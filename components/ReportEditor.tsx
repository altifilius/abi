import { ChevronDown, Download, FileText, List, MessageCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ReportDraftController, useReportDraft } from '../hooks/useReportDraft';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import { canEditWorkspace } from '../services/navigation';
import {
  emptyReportDocument,
  exportReport,
  type ProjectReport,
  safeReportSource,
} from '../services/reports';
import type { Project, Workspace } from '../types';
import RichReportEditor from './RichReportEditor';

export function ReportSaveStatus({
  controller,
  editable,
}: {
  controller: ReportDraftController;
  editable: boolean;
}) {
  const { text } = useI18n();
  const labels = {
    loading: text('Belge açılıyor…', 'Opening document…'),
    saved: text('Tüm değişiklikler kaydedildi', 'All changes saved'),
    unsaved: text('Kaydedilmemiş değişiklikler', 'Unsaved changes'),
    saving: text('Kaydediliyor…', 'Saving…'),
    error: text('Kaydedilemedi · yerel düzenlemeler korundu', 'Not saved · local edits preserved'),
    conflict: text(
      'Yeni kayıtlı sürüm var · yerel düzenlemeler korundu',
      'A newer saved version exists · local edits preserved',
    ),
  };
  return (
    <div className="report-save-state" data-state={controller.state}>
      <span role="status" aria-live="polite">
        {labels[controller.state]}
      </span>
      {editable && controller.dirty && !controller.conflict && (
        <button
          type="button"
          disabled={controller.saving || controller.loading}
          onClick={() => {
            void controller.flush();
          }}
        >
          {text('Şimdi kaydet', 'Save now')}
        </button>
      )}
      {(controller.recovered || controller.dirty) && (
        <details className="report-draft-details">
          <summary>
            {controller.recovered
              ? text('Yerel taslak geri yüklendi', 'Local draft restored')
              : text('Yerel taslak korunuyor', 'Local draft preserved')}
          </summary>
          <p className="report-draft-notice">
            {controller.recovered
              ? text(
                  'Bu tarayıcıdaki yerel taslağınız geri yüklendi. ',
                  'Your local draft from this browser was restored. ',
                )
              : ''}
            {text(
              'Kayıt tamamlanana kadar taslak bu sekmede korunur; hesaptan çıkınca silinir.',
              'Until saving completes, the draft is preserved in this tab; signing out clears it.',
            )}
          </p>
        </details>
      )}
      {controller.error && (
        <p className="error" role="alert">
          {controller.error}
        </p>
      )}
      {controller.storageError && (
        <p className="error" role="alert">
          {controller.storageError}
        </p>
      )}
      {controller.conflict && (
        <div className="report-conflict" role="alert">
          <p>
            {text(
              'Otomatik kayıt durduruldu. Yerel metniniz değiştirilmedi. Önce güncel kayıtlı sürümü yükleyin, ardından hangi sürümü koruyacağınızı seçin.',
              'Autosave is paused. Your local text has not changed. Load the current saved version, then choose which version to keep.',
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              void controller.fetchConflict();
            }}
          >
            {text('Güncel sürümü yükle', 'Load current saved version')}
          </button>
          {controller.remote && (
            <>
              <p>
                {text('Kayıtlı sürüm', 'Saved version')}: {controller.remote.revision} ·{' '}
                {controller.remote.title} · {controller.remote.sections.length}{' '}
                {text('bölüm', 'sections')}
              </p>
              <details className="report-conflict-preview">
                <summary>{text('Güncel kayıtlı metni oku', 'Read the current saved text')}</summary>
                {controller.remote.sections.map((section) => (
                  <section key={section.id}>
                    <h3>{section.title}</h3>
                    <RichReportEditor content={section.content} label={section.title} readOnly />
                  </section>
                ))}
              </details>
              <p>
                {text(
                  'Yerel metni korumak, bir sonraki kayıtta güncel kayıtlı içeriğin yerine bu taslağı yazar. Değişiklikler otomatik birleştirilmez.',
                  'Keeping local text will replace the current saved content with this draft on your next save. Changes are not merged automatically.',
                )}
              </p>
              {editable && (
                <button type="button" onClick={controller.keepLocal}>
                  {text('Yerel metni koru, kaydetmeye hazırla', 'Keep local text, prepare to save')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      text(
                        'Yerel düzenlemeler silinsin ve güncel kayıtlı sürüm açılsın mı?',
                        'Discard local edits and open the current saved version?',
                      ),
                    )
                  )
                    controller.discardLocal();
                }}
              >
                {text(
                  'Yerel düzenlemeleri bırak, kayıtlı sürümü aç',
                  'Discard local edits, use saved version',
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ReportDownloads({
  report,
  hasUnsaved = false,
}: {
  report: ProjectReport | null;
  hasUnsaved?: boolean;
}) {
  const { text } = useI18n();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <div className="report-downloads">
      <details
        className="compact-menu report-download-menu"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary aria-busy={Boolean(busy)}>
          <Download size={16} aria-hidden="true" />
          {busy ? text('Hazırlanıyor…', 'Preparing…') : text('İndir', 'Download')}
          <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div className="compact-menu-panel">
          <button
            type="button"
            className="compact-menu-dismiss"
            onClick={(event) => {
              const menu = event.currentTarget.closest('details');
              if (menu) {
                menu.open = false;
                menu.querySelector('summary')?.focus();
              }
            }}
          >
            <X size={14} aria-hidden="true" />
            {text('Kapat', 'Close')}
          </button>
          <p className="report-download-note">
            {text('Kayıtlı belgeyi indir', 'Download saved document')}
          </p>
          {(['pdf', 'docx'] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={!report || Boolean(busy)}
              onClick={async () => {
                if (!report) return;
                const controller = new AbortController();
                abort.current = controller;
                setBusy(format);
                setError('');
                try {
                  await exportReport(report, format, controller.signal);
                } catch (failure) {
                  if (!controller.signal.aborted) setError(errorMessage(failure));
                } finally {
                  if (!controller.signal.aborted) setBusy('');
                }
              }}
            >
              <FileText size={16} aria-hidden="true" />
              {busy === format
                ? text('Hazırlanıyor…', 'Preparing…')
                : `${format.toUpperCase()} ${text('indir', 'download')}`}
            </button>
          ))}
          {hasUnsaved && (
            <p className="report-download-note">
              {text(
                'İndirmeler yalnızca sunucudaki kayıtlı içeriği içerir. Yerel düzenlemelerinizi dahil etmek için önce kaydedin.',
                'Downloads contain saved server content only. Save first to include your local edits.',
              )}
            </p>
          )}
        </div>
      </details>
      {hasUnsaved && (
        <small className="report-export-warning" role="status">
          {text('İndirme kayıtlı sürümü içerir.', 'Download uses the saved version.')}
        </small>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FullReport({
  actorId,
  workspace,
  project,
  reportId,
  onProjectChanged,
}: {
  actorId: string;
  workspace: Workspace;
  project: Project;
  reportId: string;
  onProjectChanged?: () => Promise<void>;
}) {
  const { text } = useI18n();
  const editable = canEditWorkspace(workspace.role);
  const state = useReportDraft(actorId, workspace.id, project.id, reportId, editable);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [removeId, setRemoveId] = useState('');
  const [ackError, setAckError] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');
  const outline = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const scope = useRef(`${project.revision}:${project.confirmed_revision}`);
  useEffect(() => {
    const next = `${project.revision}:${project.confirmed_revision}`;
    if (scope.current === next) return;
    scope.current = next;
    state.pauseForScopeChange();
    void state.fetchConflict();
  }, [
    project.revision,
    project.confirmed_revision,
    state.pauseForScopeChange,
    state.fetchConflict,
  ]);
  useEffect(() => {
    if (outlineOpen) outline.current?.showModal();
    else outline.current?.close();
  }, [outlineOpen]);
  const report = state.draft;
  const sourced = Boolean(report?.call_id);
  const source = safeReportSource(report?.source_url);
  const scopeConfirmed = project.confirmed_revision === project.revision;
  const basePath = `/w/${encodeURIComponent(workspace.id)}/projects/${encodeURIComponent(project.id)}`;
  if (state.loading && !report)
    return (
      <section className="report-screen" aria-busy="true">
        <p role="status">{text('Rapor açılıyor…', 'Opening report…')}</p>
      </section>
    );
  if (!report)
    return (
      <section className="report-screen">
        <p role="alert" className="error">
          {state.error || text('Rapor açılamadı.', 'The report could not be opened.')}
        </p>
        <button type="button" onClick={state.retryLoad}>
          {text('Yeniden dene', 'Try again')}
        </button>
      </section>
    );
  return (
    <section className="report-screen">
      <header className="report-header">
        <div className="report-heading">
          <Link className="report-back-link" to={`${basePath}/overview`}>
            ← {text('Proje dosyası', 'Project file')}
          </Link>
          <p className="eyebrow">{project.title}</p>
          {editable && !sourced ? (
            <>
              <h1 className="sr-only">{report.title || text('Rapor', 'Report')}</h1>
              <label className="field report-title-field">
                <span className="sr-only">{text('Rapor adı', 'Report title')}</span>
                <input
                  className="report-title-input"
                  aria-label={text('Rapor adı', 'Report title')}
                  value={report.title}
                  disabled={state.loading}
                  maxLength={300}
                  onChange={(event) =>
                    state.edit((value) => ({ ...value, title: event.target.value }))
                  }
                />
              </label>
            </>
          ) : (
            <h1>{report.title}</h1>
          )}
        </div>
        <div className="report-actions">
          <button type="button" onClick={() => setOutlineOpen(true)}>
            <List size={16} aria-hidden="true" />
            {text('Bölüm planı', 'Outline')}
          </button>
          <Link
            className="button secondary"
            to={`${basePath}/ai/reports?report=${encodeURIComponent(report.id)}`}
          >
            <MessageCircle size={16} aria-hidden="true" />
            {text('AI ile yaz', 'Write with AI')}
          </Link>
          <ReportDownloads report={state.base} hasUnsaved={state.dirty || state.saving} />
        </div>
      </header>
      <ReportSaveStatus controller={state} editable={editable} />
      <div className="report-body">
        {!editable && (
          <p className="notice">
            {text(
              'Salt okunur: kayıtlı belgeyi okuyabilir ve indirebilirsiniz.',
              'Read-only: you can read and download the saved document.',
            )}
          </p>
        )}
        {report.needs_review && (
          <div className="notice report-sourced">
            <p>
              {text(
                'Proje kapsamı bu rapor yazıldıktan sonra değişti. İçeriği yeni kapsamla karşılaştırarak inceleyin; metin otomatik değiştirilmedi.',
                'The project scope changed after this report was written. Review its content against the new scope; the text has not been changed automatically.',
              )}
            </p>
            {editable && (
              <button
                type="button"
                disabled={!scopeConfirmed || state.saving || state.conflict || state.loading}
                onClick={async () => {
                  setAckError('');
                  const value = await state.flush(true);
                  if (value && onProjectChanged) {
                    try {
                      await onProjectChanged();
                    } catch (failure) {
                      setAckError(errorMessage(failure));
                    }
                  }
                }}
              >
                {text('Güncel kapsamla inceledim', 'Reviewed against the current scope')}
              </button>
            )}
            {!scopeConfirmed && (
              <p>
                {text(
                  'İnceleme onayı için önce proje kapsamını onaylayın. Manuel düzenleme açıktır.',
                  'Confirm the project scope before acknowledging review. Manual editing remains available.',
                )}
              </p>
            )}
            {ackError && (
              <p role="alert" className="error">
                {ackError}
              </p>
            )}
          </div>
        )}
        {sourced && (
          <p className="report-sourced notice">
            {text(
              'Bu destek raporunun kaynak başlıkları sabittir. Bu metin, onaylı veya teslim edilmiş bir başvuru değildir.',
              'Source headings for this funding report are fixed. This text is not an approved or submitted application.',
            )}{' '}
            {source && (
              <a href={source} target="_blank" rel="noopener noreferrer">
                {text('Resmî kaynak', 'Official source')}
              </a>
            )}
          </p>
        )}
        <div className="report-content">
          {report.sections.length === 0 && (
            <p className="studio-empty">
              {text(
                'Henüz bölüm yok. Bölüm planından ilk bölümünüzü ekleyin.',
                'No sections yet. Add your first section from the outline.',
              )}
            </p>
          )}
          {report.sections.map((section, index) => (
            <section
              className="report-section"
              id={`report-section-${section.id}`}
              key={section.id}
            >
              <h2>
                <span className="report-section-number">{String(index + 1).padStart(2, '0')}</span>{' '}
                {section.title}
              </h2>
              <RichReportEditor
                content={section.content}
                label={section.title}
                readOnly={!editable || state.loading}
                showToolbar={
                  section.id ===
                  (report.sections.some((item) => item.id === activeSectionId)
                    ? activeSectionId
                    : report.sections[0]?.id)
                }
                onFocus={() => setActiveSectionId(section.id)}
                onChange={(content) => state.setSection(section.id, content)}
              />
            </section>
          ))}
        </div>
      </div>
      <dialog
        ref={outline}
        className="drawer-panel"
        aria-labelledby={headingId}
        onCancel={() => setOutlineOpen(false)}
        onClose={() => setOutlineOpen(false)}
      >
        <header className="drawer-header">
          <h2 id={headingId}>{text('Bölüm planı', 'Document outline')}</h2>
          <button
            type="button"
            onClick={() => setOutlineOpen(false)}
            aria-label={text('Kapat', 'Close')}
          >
            ×
          </button>
        </header>
        <div className="drawer-body">
          <p>
            {sourced
              ? text(
                  'Kaynakla belirlenen zorunlu başlıklar değiştirilemez.',
                  'Mandatory source headings cannot be changed.',
                )
              : text(
                  'Başlıkları düzenleyin, sıralayın veya yeni bir bölüm ekleyin. Değişiklikler otomatik kaydedilir.',
                  'Edit headings, reorder, or add a section. Changes are saved automatically.',
                )}
          </p>
          <ol className="report-outline">
            {report.sections.map((section, index) => (
              <li className="report-outline-item" key={section.id}>
                {editable && !sourced ? (
                  <label className="field">
                    <span>
                      {text('Bölüm', 'Section')} {index + 1}
                    </span>
                    <input
                      value={section.title}
                      disabled={state.loading}
                      maxLength={1000}
                      onChange={(event) =>
                        state.edit((value) => ({
                          ...value,
                          sections: value.sections.map((item) =>
                            item.id === section.id ? { ...item, title: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                ) : (
                  <span>{section.title}</span>
                )}
                <div className="report-outline-controls">
                  <button
                    type="button"
                    onClick={() => {
                      setOutlineOpen(false);
                      window.setTimeout(
                        () =>
                          document
                            .getElementById(`report-section-${section.id}`)
                            ?.scrollIntoView({ block: 'start' }),
                        0,
                      );
                    }}
                  >
                    {text('Bölüme git', 'Go to section')}
                  </button>
                  {editable && !sourced && (
                    <>
                      <button
                        type="button"
                        disabled={index === 0 || state.loading}
                        aria-label={`${section.title}: ${text('yukarı taşı', 'move up')}`}
                        onClick={() =>
                          state.edit((value) => {
                            const sections = [...value.sections];
                            [sections[index - 1], sections[index]] = [
                              sections[index],
                              sections[index - 1],
                            ];
                            return { ...value, sections };
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === report.sections.length - 1 || state.loading}
                        aria-label={`${section.title}: ${text('aşağı taşı', 'move down')}`}
                        onClick={() =>
                          state.edit((value) => {
                            const sections = [...value.sections];
                            [sections[index], sections[index + 1]] = [
                              sections[index + 1],
                              sections[index],
                            ];
                            return { ...value, sections };
                          })
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={state.loading || report.sections.length <= 1}
                        onClick={() => setRemoveId(section.id)}
                      >
                        {text('Kaldır', 'Remove')}
                      </button>
                    </>
                  )}
                </div>
                {removeId === section.id && (
                  <div className="notice">
                    <p>
                      {text(
                        'Bu bölüm ve içeriği kaldırılsın mı?',
                        'Remove this section and its content?',
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        state.edit((value) => ({
                          ...value,
                          sections: value.sections.filter((item) => item.id !== section.id),
                        }));
                        setRemoveId('');
                      }}
                    >
                      {text('Evet, kaldır', 'Yes, remove')}
                    </button>
                    <button type="button" onClick={() => setRemoveId('')}>
                      {text('Vazgeç', 'Cancel')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
        <footer className="drawer-footer">
          {editable && !sourced && (
            <button
              type="button"
              disabled={state.loading || report.sections.length >= 100}
              onClick={() =>
                state.edit((value) => ({
                  ...value,
                  sections: [
                    ...value.sections,
                    {
                      id: crypto.randomUUID(),
                      title: text('Yeni bölüm', 'New section'),
                      content: emptyReportDocument(),
                    },
                  ],
                }))
              }
            >
              {text('Bölüm ekle', 'Add section')}
            </button>
          )}
          <button type="button" onClick={() => setOutlineOpen(false)}>
            {text('Belgeye dön', 'Back to document')}
          </button>
        </footer>
      </dialog>
    </section>
  );
}

export default function ReportEditor(props: {
  actorId: string;
  workspace: Workspace;
  project: Project;
  reportId: string;
  onProjectChanged?: () => Promise<void>;
}) {
  return (
    <FullReport
      key={`${props.actorId}:${props.workspace.id}:${props.project.id}:${props.reportId}`}
      {...props}
    />
  );
}
