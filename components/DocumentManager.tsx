import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, downloadFile } from '../services/api';
import type { Profile, Project, Workspace } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

interface StoredDocument {
  id: string;
  original_name: string;
  mime: string;
  size: number;
  sha256: string;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  text_preview?: string;
}
interface DocumentProposal {
  profile: Profile;
  profile_revision: number;
  document_sha256: string;
  ai_policy: string;
  requires_confirmation: boolean;
  analyzed_by: string;
  analyzed_at: string;
}
interface DocumentManagerProps {
  project: Project;
  workspace: Workspace;
  onProjectChanged?: () => void;
  onUsage?: () => void;
}

export default function DocumentManager({
  project,
  workspace,
  onProjectChanged,
  onUsage,
}: DocumentManagerProps) {
  const text = useEvidenceText();
  const { language } = useI18n();
  const [documentList, setDocumentList] = useState<{
    projectId: string;
    items: StoredDocument[];
  } | null>(null);
  const documents = documentList?.projectId === project.id ? documentList.items : [];
  const scope = useRef<{ projectId: string; controller: AbortController } | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [proposals, setProposals] = useState<Record<string, DocumentProposal>>({});
  const [applyNotice, setApplyNotice] = useState('');
  const canEdit = ['owner', 'admin', 'reviewer', 'editor'].includes(workspace.role || '');
  const canReview = ['owner', 'admin', 'reviewer'].includes(workspace.role || '');

  const loadDocuments = useCallback(async () => {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setError('');
    setLoading(true);
    try {
      const data = await api<StoredDocument[]>(`/projects/${project.id}/documents`, {
        signal: request.signal,
      });
      if (request.signal.aborted || active.controller.signal.aborted) return;
      setDocumentList({ projectId: project.id, items: data });
      const stored: Record<string, DocumentProposal> = {};
      for (const document of data) {
        const proposal = document.metadata.ai_proposal as DocumentProposal | undefined;
        if (
          proposal &&
          typeof proposal.profile === 'object' &&
          typeof proposal.profile_revision === 'number'
        )
          stored[document.id] = proposal;
      }
      setProposals(stored);
    } catch (reason) {
      if (!request.signal.aborted && !active.controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (!request.signal.aborted && !active.controller.signal.aborted) setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    const active = { projectId: project.id, controller: new AbortController() };
    scope.current = active;
    setDocumentList(null);
    setNotes({});
    setInstructions({});
    setProposals({});
    setApplyNotice('');
    setBusy(false);
    void loadDocuments();
    return () => {
      active.controller.abort();
      listRequest.current?.abort();
    };
  }, [project.id, loadDocuments]);

  async function upload(file: File) {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      await api<StoredDocument>(`/projects/${project.id}/documents`, {
        method: 'POST',
        body,
        signal: active.controller.signal,
      });
      if (!active.controller.signal.aborted) await loadDocuments();
    } catch (reason) {
      if (!active.controller.signal.aborted) setError(errorText(reason));
    } finally {
      if (!active.controller.signal.aborted) setBusy(false);
    }
  }

  async function action(
    document: StoredDocument,
    operation: 'process' | 'verify' | 'reject' | 'delete' | 'download',
  ) {
    if (
      operation === 'delete' &&
      !window.confirm(
        text(
          'Bu özel dosyayı kalıcı olarak silmek istiyor musunuz? İlgili başvuru onayları geçersizleşebilir.',
          'Permanently delete this private file? Referencing application approvals may be invalidated.',
        ),
      )
    )
      return;
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    try {
      if (operation === 'download')
        await downloadFile(`/documents/${document.id}/download`, document.original_name, {
          signal,
        });
      else if (operation === 'delete')
        await api(`/documents/${document.id}`, { method: 'DELETE', signal });
      else if (operation === 'process')
        await api(`/documents/${document.id}/process`, { method: 'POST', signal });
      else
        await api(`/documents/${document.id}/verify`, {
          method: 'POST',
          signal,
          json: { approved: operation === 'verify', notes: notes[document.id] || '' },
        });
      if (!signal.aborted && operation !== 'download') await loadDocuments();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function analyze(document: StoredDocument) {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    setApplyNotice('');
    try {
      await api(`/documents/${document.id}/analyze`, {
        method: 'POST',
        signal,
        json: { language, instruction: instructions[document.id] || undefined },
      });
      if (signal.aborted) return;
      onUsage?.();
      await loadDocuments();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function applyProposal(documentId: string) {
    const active = scope.current;
    const proposal = proposals[documentId];
    if (!proposal || active?.projectId !== project.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    try {
      if (proposal.profile_revision !== project.revision)
        throw new Error(
          text(
            'Profil değişti; belgeyi yeniden analiz edin.',
            'The profile changed; analyze the document again.',
          ),
        );
      const profile: Profile = { ...project.profile };
      for (const key of ['company', 'project', 'team', 'extra'] as const) {
        if (proposal.profile[key])
          profile[key] = {
            ...project.profile[key],
            ...Object.fromEntries(
              Object.entries(proposal.profile[key]).filter(
                ([, value]) => value !== null && value !== undefined,
              ),
            ),
          };
      }
      if (proposal.profile.budget) profile.budget = proposal.profile.budget;
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        signal,
        json: { expected_revision: proposal.profile_revision, profile },
      });
      if (signal.aborted) return;
      setProposals((previous) => {
        const next = { ...previous };
        delete next[documentId];
        return next;
      });
      setApplyNotice(
        text(
          'Öneri profil taslağına kaydedildi. Değerlendirmeden önce profil ekranında yeni sürümü onaylayın.',
          'Proposal saved to the profile draft. Confirm the new revision in the profile editor before evaluation.',
        ),
      );
      onProjectChanged?.();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  const labels: Record<string, string> = {
    uploaded: text('Yüklendi — işlenmedi', 'Uploaded — not processed'),
    processed: text('İşlendi', 'Processed'),
    processing: text('İşleniyor', 'Processing'),
    review_required: text('İnceleme gerekli', 'Review required'),
    verified: text('Yetkili tarafından doğrulandı', 'Verified by reviewer'),
    rejected: text('Reddedildi', 'Rejected'),
    failed: text('İşleme başarısız', 'Processing failed'),
  };

  return (
    <section className="space-y-5">
      <div className={panelClass}>
        <h2 className="text-xl font-semibold">
          {text('Özel belgeler ve yerel OCR', 'Private documents and local OCR')}
        </h2>
        <p>
          {text(
            'Dosyalar sunucuda özel depoda kalır. Dosya seçmek doğrulama değildir; metin çıkarımı sonrasında yetkili insan incelemesi gerekir.',
            'Files persist in private server storage. Selecting a file does not verify it; extraction requires an attributed human review.',
          )}
        </p>
        {workspace.plan !== 'pro' && (
          <p>
            {text(
              'Yükleme, OCR ve doğrulama Pro gerektirir. Daha önce kaydedilen dosyalar okunabilir, indirilebilir ve yetkiniz varsa silinebilir. Ödeme etkinleştirilmiş değildir.',
              'Uploading, OCR and verification require Pro. Previously stored files remain readable, downloadable and deletable with permission. Payment activation is not implemented.',
            )}
          </p>
        )}
        <label className="block">
          {text(
            'PDF / DOCX / XLSX / taranmış resim yükle',
            'Upload PDF / DOCX / XLSX / scanned image',
          )}
          <input
            className={inputClass}
            type="file"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.tif,.tiff,.webp"
            disabled={busy || workspace.plan !== 'pro' || !canEdit}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
        </label>
        <button
          className={buttonClass}
          disabled={loading || busy}
          onClick={() => void loadDocuments()}
        >
          {text('Sunucudan yenile', 'Reload from server')}
        </button>
        {busy && <p role="status">{text('İşlem sürüyor…', 'Operation in progress…')}</p>}
        {loading && <p role="status">{text('Belgeler yükleniyor…', 'Loading documents…')}</p>}
        {error && <p role="alert">{error}</p>}
        {applyNotice && <p role="status">{applyNotice}</p>}
        {!loading && !error && documents.length === 0 && (
          <p>{text('Bu projede kayıtlı dosya yok.', 'No stored files in this project.')}</p>
        )}
        {!loading && !error && (
          <p>
            {text('Kayıtlı', 'Stored')}: {documents.length} · {text('Doğrulanmış', 'Verified')}:{' '}
            {documents.filter((document) => document.status === 'verified').length}
          </p>
        )}
      </div>
      {documents.map((document) => (
        <article key={document.id} className={panelClass}>
          <h3 className="text-lg font-semibold break-all">{document.original_name}</h3>
          <p>
            {labels[document.status] || document.status} · {document.mime} ·{' '}
            {(document.size / 1024).toFixed(1)} KiB · {timestamp(document.created_at)}
          </p>
          <p className="break-all">SHA-256: {document.sha256}</p>
          {document.verified_by && (
            <p>
              {text('Doğrulayan', 'Verified by')}: {document.verified_by} ·{' '}
              {timestamp(document.verified_at)}
            </p>
          )}
          {document.text_preview && (
            <details>
              <summary>{text('Çıkarılan metin önizlemesi', 'Extracted text preview')}</summary>
              <pre className="whitespace-pre-wrap break-words text-sm">{document.text_preview}</pre>
            </details>
          )}
          {Object.keys(document.metadata || {}).length > 0 && (
            <details>
              <summary>
                {text('İşleme / inceleme bilgileri', 'Processing / review metadata')}
              </summary>
              <pre className="whitespace-pre-wrap break-words text-sm">
                {JSON.stringify(document.metadata, null, 2)}
              </pre>
            </details>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => action(document, 'download')}
            >
              {text('Orijinali indir', 'Download original')}
            </button>
            <button
              className={buttonClass}
              disabled={busy || workspace.plan !== 'pro' || !canEdit}
              onClick={() => action(document, 'process')}
            >
              {text('Yerel metin / OCR işle', 'Process local text / OCR')}
            </button>
            <button
              className={buttonClass}
              disabled={busy || !canEdit}
              onClick={() => action(document, 'delete')}
            >
              {text('Kalıcı sil', 'Delete permanently')}
            </button>
          </div>
          {workspace.plan === 'pro' && canEdit && (
            <section className="space-y-2 border-t border-border-dark pt-3">
              <p>
                {text(
                  'AI analizi çalışma alanının seçili yerel/haricî veri politikasına tabidir ve yazım kullanımına sayılır. OCR ve insan doğrulamasından ayrıdır.',
                  'AI analysis follows the workspace local/external data policy and counts as writing usage. It is separate from OCR and human verification.',
                )}{' '}
                · {workspace.ai_policy}
              </p>
              <label>
                {text('AI analiz talimatı (isteğe bağlı)', 'AI analysis instruction (optional)')}
                <textarea
                  className={inputClass}
                  value={instructions[document.id] || ''}
                  onChange={(event) =>
                    setInstructions((previous) => ({
                      ...previous,
                      [document.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                className={buttonClass}
                disabled={
                  busy || !['processed', 'review_required', 'verified'].includes(document.status)
                }
                onClick={() => analyze(document)}
              >
                {text(
                  'Belgeden profil önerisi çıkar',
                  'Extract a profile proposal from this document',
                )}
              </button>
              {proposals[document.id] && (
                <>
                  <h4 className="font-semibold">
                    {text('AI önerisi — henüz uygulanmadı', 'AI proposal — not applied')}
                  </h4>
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {JSON.stringify(proposals[document.id], null, 2)}
                  </pre>
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => applyProposal(document.id)}
                  >
                    {text(
                      'Öneriyi inceledim; profil taslağına uygula',
                      'I reviewed the proposal; apply to the profile draft',
                    )}
                  </button>
                </>
              )}
            </section>
          )}
          {workspace.plan === 'pro' && canReview && (
            <div className="space-y-2">
              <label>
                {text('İnceleme notu (zorunlu)', 'Review note (required)')}
                <textarea
                  className={inputClass}
                  required
                  value={notes[document.id] || ''}
                  onChange={(event) =>
                    setNotes((previous) => ({ ...previous, [document.id]: event.target.value }))
                  }
                />
              </label>
              <div className="flex gap-2 flex-wrap">
                <button
                  className={buttonClass}
                  disabled={
                    busy ||
                    !(notes[document.id] || '').trim() ||
                    !['review_required', 'processed'].includes(document.status)
                  }
                  onClick={() => action(document, 'verify')}
                >
                  {text('İçeriği doğruladım', 'I verified the content')}
                </button>
                <button
                  className={buttonClass}
                  disabled={
                    busy ||
                    !(notes[document.id] || '').trim() ||
                    !['review_required', 'processed', 'verified'].includes(document.status)
                  }
                  onClick={() => action(document, 'reject')}
                >
                  {text('İncelemeyi reddet', 'Reject review')}
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
