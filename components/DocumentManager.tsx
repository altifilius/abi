import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useI18n } from '../i18n';
import { api, downloadFile } from '../services/api';
import type { Profile, Project, Workspace } from '../types';
import BudgetEditor from './BudgetEditor';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';
import { ProfileFields } from './ProfileScreen';

export interface StoredDocument {
  id: string;
  project_id?: string;
  workspace_id?: string;
  project_title?: string;
  used_by?: { id: string; call_title: string; state: string }[];
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
  text_content?: string;
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
  onProjectChanged?: () => void | Promise<void>;
  onUsage?: () => void;
  documentId?: string;
  onDocumentsChanged?: () => void;
  uploadOnly?: boolean;
}

export default function DocumentManager({
  project,
  workspace,
  onProjectChanged,
  onUsage,
  documentId,
  onDocumentsChanged,
  uploadOnly = false,
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
  const [editedProfiles, setEditedProfiles] = useState<Record<string, Profile>>({});
  const [appliedProposals, setAppliedProposals] = useState<Record<string, boolean>>({});
  const dirty =
    Object.keys(editedProfiles).length > 0 ||
    Object.values(notes).some((value) => value.trim()) ||
    Object.values(instructions).some((value) => value.trim());
  const discardEdits = useCallback(() => {
    setNotes({});
    setInstructions({});
    setEditedProfiles({});
  }, []);
  useUnsavedChanges(dirty, discardEdits);
  const canEdit = ['owner', 'admin', 'reviewer', 'editor'].includes(workspace.role || '');
  const canReview = ['owner', 'admin', 'reviewer'].includes(workspace.role || '');
  const applicationLabels: Record<string, string> = {
    draft: text('Taslak', 'Draft'),
    review: text('İnceleme bekliyor', 'Awaiting review'),
    approved: text('Onaylandı', 'Approved'),
    exported: text('Paket dışa aktarıldı', 'Package exported'),
  };

  const loadDocuments = useCallback(async () => {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setError('');
    setLoading(true);
    setDocumentList(null);
    try {
      if (uploadOnly) {
        setDocumentList({ projectId: project.id, items: [] });
        return;
      }
      const data = documentId
        ? [
            await api<StoredDocument>(
              `/workspaces/${workspace.id}/documents/${encodeURIComponent(documentId)}`,
              { signal: request.signal },
            ),
          ]
        : await api<StoredDocument[]>(
            `/workspaces/${workspace.id}/documents?project_id=${encodeURIComponent(project.id)}&limit=100`,
            { signal: request.signal },
          );
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
  }, [project.id, workspace.id, documentId, uploadOnly]);

  useEffect(() => {
    const active = { projectId: project.id, controller: new AbortController() };
    scope.current = active;
    setDocumentList(null);
    setNotes({});
    setInstructions({});
    setProposals({});
    setEditedProfiles({});
    setAppliedProposals({});
    setApplyNotice('');
    setBusy(false);
    void loadDocuments();
    return () => {
      active.controller.abort();
      listRequest.current?.abort();
    };
  }, [project.id, loadDocuments]);

  async function reloadFromServer() {
    const active = scope.current;
    if (active?.projectId !== project.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    try {
      await loadDocuments();
      if (!signal.aborted) await onProjectChanged?.();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

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
      if (!active.controller.signal.aborted) onDocumentsChanged?.();
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
      if (!signal.aborted && (operation === 'verify' || operation === 'reject'))
        setNotes((previous) => ({ ...previous, [document.id]: '' }));
      if (!signal.aborted && operation !== 'download') await loadDocuments();
      if (!signal.aborted && operation !== 'download') onDocumentsChanged?.();
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
      if (signal.aborted) return;
      setInstructions((previous) => ({ ...previous, [document.id]: '' }));
      await onProjectChanged?.();
      if (!signal.aborted) onDocumentsChanged?.();
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
      const document = documents.find((item) => item.id === documentId);
      if (!document || document.sha256 !== proposal.document_sha256)
        throw new Error(
          text(
            'Belge içeriği öneri kaynağı ile eşleşmiyor.',
            'The document content does not match the proposal source.',
          ),
        );
      const reviewedProfile = editedProfiles[documentId] || proposal.profile;
      const profile: Profile = { ...project.profile };
      for (const key of ['company', 'project', 'team', 'extra'] as const) {
        if (reviewedProfile[key])
          profile[key] = {
            ...project.profile[key],
            ...Object.fromEntries(
              Object.entries(reviewedProfile[key]).filter(
                ([, value]) => value !== null && value !== undefined,
              ),
            ),
          };
      }
      if (reviewedProfile.budget) profile.budget = reviewedProfile.budget;
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
      setEditedProfiles((previous) => {
        const next = { ...previous };
        delete next[documentId];
        return next;
      });
      setAppliedProposals((previous) => ({ ...previous, [documentId]: true }));
      setApplyNotice(
        text(
          'Öneri profil taslağına kaydedildi. Değerlendirmeden önce profil ekranında yeni sürümü onaylayın.',
          'Proposal saved to the profile draft. Confirm the new revision in the profile editor before evaluation.',
        ),
      );
      onProjectChanged?.();
      onDocumentsChanged?.();
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
        {!canEdit && (
          <p role="status">
            {text(
              'Salt okunur: belge içeriğini okuyabilir ve orijinali indirebilirsiniz.',
              'Read-only: you may read document content and download originals.',
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
            disabled={busy || dirty || workspace.plan !== 'pro' || !canEdit}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
        </label>
        <button
          className={buttonClass}
          disabled={loading || busy || dirty}
          onClick={() => void reloadFromServer()}
        >
          {text('Sunucudan yenile', 'Reload from server')}
        </button>
        {dirty && (
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  text(
                    'Kaydedilmemiş öneri, talimat ve inceleme notlarını geri al?',
                    'Discard unsaved proposal edits, instructions and review notes?',
                  ),
                )
              )
                discardEdits();
            }}
          >
            {text('Kaydedilmemiş değişiklikleri geri al', 'Discard unsaved changes')}
          </button>
        )}
        {busy && <p role="status">{text('İşlem sürüyor…', 'Operation in progress…')}</p>}
        {loading && <p role="status">{text('Belgeler yükleniyor…', 'Loading documents…')}</p>}
        {error && <p role="alert">{error}</p>}
        {applyNotice && <p role="status">{applyNotice}</p>}
        {!uploadOnly && !loading && !error && documents.length === 0 && (
          <p>{text('Bu projede kayıtlı dosya yok.', 'No stored files in this project.')}</p>
        )}
        {!uploadOnly && !loading && !error && (
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
          {document.used_by?.length ? (
            <section>
              <h4 className="font-semibold">{text('Bağlı başvurular', 'Linked applications')}</h4>
              {document.used_by.map((application) => (
                <p key={application.id}>
                  <Link
                    className="text-primary underline"
                    to={`/w/${workspace.id}/applications/${application.id}/documents`}
                  >
                    {application.call_title}
                  </Link>{' '}
                  · {applicationLabels[application.state] || application.state}
                </p>
              ))}
            </section>
          ) : null}
          {(document.text_content || document.text_preview) && (
            <details>
              <summary>
                {document.text_content
                  ? text('Çıkarılan tam metin', 'Full extracted text')
                  : text('Çıkarılan metin önizlemesi', 'Extracted text preview')}
              </summary>
              <pre className="whitespace-pre-wrap break-words text-sm">
                {document.text_content || document.text_preview}
              </pre>
            </details>
          )}
          {!!document.metadata.processed_by && (
            <p>
              {text('Metni işleyen', 'Text processed by')}: {String(document.metadata.processed_by)}{' '}
              · {timestamp(String(document.metadata.processed_at || ''))}
            </p>
          )}
          {document.metadata.extraction === 'local' && (
            <p>
              {text('Yerel metin çıkarımı', 'Local text extraction')} ·{' '}
              {text('OCR sayfaları', 'OCR pages')}: {String(document.metadata.ocr_pages ?? '—')} ·{' '}
              {text('Sayfa sayısı', 'Page count')}: {String(document.metadata.pages ?? '—')}
            </p>
          )}
          {!!document.metadata.processing_error && (
            <p role="alert">
              {text('Metin çıkarımı hatası', 'Text extraction error')}:{' '}
              {String(document.metadata.processing_error)}
            </p>
          )}
          {!!document.metadata.review && (
            <section>
              <h4 className="font-semibold">
                {text('Atıflı insan incelemesi', 'Attributed human review')}
              </h4>
              <p>{String((document.metadata.review as Record<string, unknown>).notes || '')}</p>
              <p>
                {text('İnceleyen', 'Reviewer')}:{' '}
                {String((document.metadata.review as Record<string, unknown>).reviewer_id || '—')} ·{' '}
                {timestamp(
                  String((document.metadata.review as Record<string, unknown>).reviewed_at || ''),
                )}
              </p>
            </section>
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
              disabled={busy || dirty || workspace.plan !== 'pro' || !canEdit}
              onClick={() => action(document, 'process')}
            >
              {text('Yerel metin / OCR işle', 'Process local text / OCR')}
            </button>
            <button
              className={buttonClass}
              disabled={busy || dirty || !canEdit}
              onClick={() => action(document, 'delete')}
            >
              {text('Kalıcı sil', 'Delete permanently')}
            </button>
          </div>
          {((workspace.plan === 'pro' && canEdit) || proposals[document.id]) && (
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
                  disabled={busy || workspace.plan !== 'pro' || !canEdit}
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
                  busy ||
                  !!editedProfiles[document.id] ||
                  workspace.plan !== 'pro' ||
                  !canEdit ||
                  !['processed', 'review_required', 'verified'].includes(document.status)
                }
                onClick={() => analyze(document)}
              >
                {text(
                  'Belgeden profil önerisi çıkar',
                  'Extract a profile proposal from this document',
                )}
              </button>
              {proposals[document.id] && !appliedProposals[document.id] && (
                <>
                  <h4 className="font-semibold">
                    {text('AI önerisi — düzenleyip inceleyin', 'AI proposal — edit and review')}
                  </h4>
                  <p>
                    {text('Kaynak belge özeti', 'Source document digest')}:{' '}
                    {proposals[document.id].document_sha256}
                  </p>
                  <p>
                    {text('Analiz eden', 'Analyzed by')}: {proposals[document.id].analyzed_by} ·{' '}
                    {timestamp(proposals[document.id].analyzed_at)} ·{' '}
                    {proposals[document.id].ai_policy} · {text('Profil sürümü', 'Profile revision')}
                    : {proposals[document.id].profile_revision}
                  </p>
                  {proposals[document.id].profile_revision !== project.revision && (
                    <p role="alert">
                      {text(
                        'Profil değişti. Düzenlemeleriniz korundu; öneri mevcut sürüme uygulanamaz. Yeniden analiz etmeden önce düzenlemelerinizi kaydedin veya geri alın.',
                        'The profile changed. Your edits are preserved; this proposal cannot be applied to the current revision. Save or discard your edits before analyzing again.',
                      )}
                    </p>
                  )}
                  <ProfileFields
                    profile={editedProfiles[document.id] || proposals[document.id].profile}
                    disabled={busy || workspace.plan !== 'pro' || !canEdit}
                    onChange={(profile) =>
                      setEditedProfiles((previous) => ({ ...previous, [document.id]: profile }))
                    }
                  />
                  {(editedProfiles[document.id] || proposals[document.id].profile).budget && (
                    <BudgetEditor
                      mode="project"
                      value={
                        (editedProfiles[document.id] || proposals[document.id].profile).budget!
                      }
                      disabled={busy || workspace.plan !== 'pro' || !canEdit}
                      onChange={(budget) =>
                        setEditedProfiles((previous) => ({
                          ...previous,
                          [document.id]: {
                            ...(previous[document.id] || proposals[document.id].profile),
                            budget,
                          },
                        }))
                      }
                    />
                  )}
                  {(editedProfiles[document.id] || proposals[document.id].profile).extra && (
                    <ProposalFacts
                      value={(editedProfiles[document.id] || proposals[document.id].profile).extra!}
                      disabled={busy || workspace.plan !== 'pro' || !canEdit}
                      onChange={(extra) =>
                        setEditedProfiles((previous) => ({
                          ...previous,
                          [document.id]: {
                            ...(previous[document.id] || proposals[document.id].profile),
                            extra,
                          },
                        }))
                      }
                    />
                  )}
                  {editedProfiles[document.id] && (
                    <button
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            text(
                              'Önerideki düzenlemeleri geri al?',
                              'Discard edits to the proposal?',
                            ),
                          )
                        )
                          setEditedProfiles((previous) => {
                            const next = { ...previous };
                            delete next[document.id];
                            return next;
                          });
                      }}
                    >
                      {text('Öneri düzenlemelerini geri al', 'Discard proposal edits')}
                    </button>
                  )}
                  <button
                    className={buttonClass}
                    disabled={
                      busy ||
                      Object.values(instructions).some((value) => value.trim()) ||
                      Object.values(notes).some((value) => value.trim()) ||
                      workspace.plan !== 'pro' ||
                      !canEdit ||
                      proposals[document.id].profile_revision !== project.revision ||
                      proposals[document.id].document_sha256 !== document.sha256
                    }
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
                  disabled={busy || !!editedProfiles[document.id]}
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
                    !!editedProfiles[document.id] ||
                    Object.values(instructions).some((value) => value.trim()) ||
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
                    !!editedProfiles[document.id] ||
                    Object.values(instructions).some((value) => value.trim()) ||
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

function ProposalFacts({
  value,
  disabled,
  onChange,
}: {
  value: Record<string, unknown>;
  disabled: boolean;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const text = useEvidenceText();
  const instanceId = useId();
  const listKeys = useRef<Record<string, string[]>>({});
  for (const [field, facts] of Object.entries(value)) {
    if (!Array.isArray(facts)) continue;
    const keys = listKeys.current[field] || [];
    while (keys.length < facts.length) keys.push(crypto.randomUUID());
    listKeys.current[field] = keys.slice(0, facts.length);
  }
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend>{text('Belgedeki ek bilgiler', 'Additional document facts')}</legend>
      {Object.entries(value).map(([key, fact]) => {
        const label = key.replace(/_/g, ' ');
        if (fact && typeof fact === 'object' && !Array.isArray(fact))
          return (
            <section key={key}>
              <h5>{label}</h5>
              <ProposalFacts
                value={fact as Record<string, unknown>}
                disabled={disabled}
                onChange={(next) => onChange({ ...value, [key]: next })}
              />
            </section>
          );
        if (Array.isArray(fact))
          return (
            <fieldset key={key}>
              <legend>{label}</legend>
              {fact.map((item, index) =>
                item && typeof item === 'object' && !Array.isArray(item) ? (
                  <ProposalFacts
                    key={listKeys.current[key][index]}
                    value={item as Record<string, unknown>}
                    disabled={disabled}
                    onChange={(next) =>
                      onChange({
                        ...value,
                        [key]: fact.map((entry, position) => (position === index ? next : entry)),
                      })
                    }
                  />
                ) : (
                  <label key={listKeys.current[key][index]}>
                    {label} {index + 1}
                    <input
                      className={inputClass}
                      value={String(item ?? '')}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          [key]: fact.map((entry, position) =>
                            position === index
                              ? typeof item === 'number'
                                ? Number(event.target.value)
                                : event.target.value
                              : entry,
                          ),
                        })
                      }
                    />
                  </label>
                ),
              )}
            </fieldset>
          );
        return (
          <label className="block" key={key} htmlFor={`${instanceId}-${key}`}>
            {label}
            {typeof fact === 'boolean' ? (
              <select
                id={`${instanceId}-${key}`}
                className={inputClass}
                value={String(fact)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [key]: event.target.value === '' ? null : event.target.value === 'true',
                  })
                }
              >
                <option value="">{text('Bilinmiyor', 'Unknown')}</option>
                <option value="true">{text('Evet', 'Yes')}</option>
                <option value="false">{text('Hayır', 'No')}</option>
              </select>
            ) : (
              <input
                id={`${instanceId}-${key}`}
                className={inputClass}
                type={typeof fact === 'number' ? 'number' : 'text'}
                value={String(fact ?? '')}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [key]:
                      event.target.value === ''
                        ? null
                        : typeof fact === 'number'
                          ? Number(event.target.value)
                          : event.target.value,
                  })
                }
              />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
