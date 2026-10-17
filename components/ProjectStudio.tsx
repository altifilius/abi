import { ChevronDown, CircleHelp, FileText, Send, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useReportDraft } from '../hooks/useReportDraft';
import { useI18n } from '../i18n';
import { errorMessage } from '../services/api';
import { canEditWorkspace } from '../services/navigation';
import {
  chatWithReport,
  getReport,
  getReportMessages,
  initializeReports,
  listReports,
  type ProjectReport,
  type ReportMessage,
  reportHasContent,
  safeReportSource,
  selectReports,
} from '../services/reports';
import type { Project, Usage, Workspace } from '../types';
import { ReportDownloads, ReportSaveStatus } from './ReportEditor';
import RichReportEditor from './RichReportEditor';

export interface ProjectStudioProps {
  actorId: string;
  workspace: Workspace;
  project: Project;
  mode: 'idea' | 'reports';
  reportId?: string;
  onProjectChanged: () => Promise<void>;
  onUsage: () => Promise<void>;
}

function ReportConversation({
  actorId,
  workspace,
  project,
  reportId,
  onUsage,
  onReportChanged,
}: {
  actorId: string;
  workspace: Workspace;
  project: Project;
  reportId: string;
  onUsage: () => Promise<void>;
  onReportChanged: (report: ProjectReport) => void;
}) {
  const { text, language } = useI18n();
  const editable = canEditWorkspace(workspace.role);
  const state = useReportDraft(actorId, workspace.id, project.id, reportId, editable);
  const inputKey = `abi:report-chat:${actorId}:${workspace.id}:${project.id}:${reportId}`;
  const [input, setInput] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState('');
  const [chatError, setChatError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [view, setView] = useState<'conversation' | 'document'>('conversation');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [applied, setApplied] = useState(false);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  const messagesRequest = useRef<AbortController | null>(null);
  const inputRef = useRef('');
  const history = useRef<HTMLDivElement>(null);
  const scope = useRef(`${project.revision}:${project.confirmed_revision}`);
  const scopeRequest = useRef(0);
  const [scopeReady, setScopeReady] = useState(true);
  const report = state.draft;
  const section = report?.sections.find((item) => item.id === sectionId) || report?.sections[0];
  const scopeConfirmed = project.confirmed_revision === project.revision;
  const canWrite =
    editable &&
    scopeConfirmed &&
    !report?.needs_review &&
    scopeReady &&
    scope.current === `${project.revision}:${project.confirmed_revision}`;
  const basePath = `/w/${encodeURIComponent(workspace.id)}/projects/${encodeURIComponent(project.id)}`;
  const source = safeReportSource(report?.source_url);

  useEffect(() => {
    active.current = true;
    try {
      const value = sessionStorage.getItem(inputKey) || '';
      inputRef.current = value;
      setInput(value);
    } catch (failure) {
      setStorageError(errorMessage(failure));
    }
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, [inputKey]);

  useEffect(() => {
    const next = `${project.revision}:${project.confirmed_revision}`;
    if (scope.current === next) return;
    scope.current = next;
    const generation = ++scopeRequest.current;
    request.current?.abort();
    setBusy(false);
    setScopeReady(false);
    state.pauseForScopeChange();
    getReport(reportId)
      .then((value) => {
        if (!active.current || generation !== scopeRequest.current) return;
        state.accept(value);
        setScopeReady(true);
      })
      .catch((failure) => {
        if (active.current && generation === scopeRequest.current)
          setChatError(errorMessage(failure));
      });
  }, [
    project.revision,
    project.confirmed_revision,
    reportId,
    state.pauseForScopeChange,
    state.accept,
  ]);

  const loadMessages = useCallback(() => {
    messagesRequest.current?.abort();
    const controller = new AbortController();
    messagesRequest.current = controller;
    setMessagesLoading(true);
    setMessagesError('');
    getReportMessages(reportId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setMessages(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setMessagesError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setMessagesLoading(false);
      });
  }, [reportId]);

  useEffect(() => {
    loadMessages();
    return () => messagesRequest.current?.abort();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0 || busy)
      history.current?.scrollTo({ top: history.current.scrollHeight });
  }, [messages.length, busy]);
  useEffect(() => {
    if (state.base) onReportChanged(state.base);
  }, [state.base, onReportChanged]);

  useUnsavedChanges(busy || Boolean(storageError && input), () => {
    request.current?.abort();
  });

  const updateInput = (value: string) => {
    inputRef.current = value;
    setInput(value);
    try {
      if (value) sessionStorage.setItem(inputKey, value);
      else sessionStorage.removeItem(inputKey);
      setStorageError('');
    } catch (failure) {
      setStorageError(errorMessage(failure));
    }
  };

  const reconcile = async () => {
    const generation = scopeRequest.current;
    setChatError('');
    messagesRequest.current?.abort();
    setMessagesLoading(true);
    try {
      const [currentReport, history] = await Promise.all([
        getReport(reportId),
        getReportMessages(reportId),
      ]);
      if (!active.current || generation !== scopeRequest.current) return;
      state.accept(currentReport);
      setMessages(history);
      setUncertain(false);
      setMessagesError('');
      setScopeReady(true);
    } catch (failure) {
      if (active.current && generation === scopeRequest.current)
        setChatError(errorMessage(failure));
    } finally {
      if (active.current && generation === scopeRequest.current) setMessagesLoading(false);
    }
  };

  const send = async () => {
    const submitted = inputRef.current.trim();
    if (
      !submitted ||
      !section ||
      !canWrite ||
      busy ||
      state.conflict ||
      uncertain ||
      messagesError ||
      messagesLoading
    )
      return;
    setBusy(true);
    setChatError('');
    setApplied(false);
    const controller = new AbortController();
    request.current = controller;
    try {
      const saved = await state.flush();
      if (!active.current || controller.signal.aborted) return;
      if (!saved) {
        setChatError(
          text(
            'Önce belgedeki kayıt sorununu çözün. Mesajınız korunmuştur.',
            'Resolve the document save problem first. Your message has been preserved.',
          ),
        );
        return;
      }
      const result = await chatWithReport(
        reportId,
        { text: submitted, section_id: section.id, expected_revision: saved.revision, language },
        controller.signal,
      );
      if (!active.current || controller.signal.aborted) return;
      setMessages((previous) => {
        const ids = new Set(previous.map((message) => message.id));
        return [
          ...previous,
          ...[result.user_message, result.message].filter((message) => !ids.has(message.id)),
        ];
      });
      state.accept(result.report);
      onReportChanged(result.report);
      if (
        result.message.section_id &&
        result.report.sections.some((item) => item.id === result.message.section_id)
      )
        setSectionId(result.message.section_id);
      setApplied(result.applied);
      if (result.usage) setUsage(result.usage);
      if (inputRef.current.trim() === submitted) updateInput('');
      try {
        await onUsage();
      } catch (failure) {
        if (active.current && request.current === controller && !controller.signal.aborted)
          setChatError(errorMessage(failure));
      }
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      setChatError(errorMessage(failure));
      setUncertain(true);
      try {
        await onUsage();
      } catch (usageFailure) {
        if (active.current && request.current === controller && !controller.signal.aborted)
          setChatError(`${errorMessage(failure)} · ${errorMessage(usageFailure)}`);
      }
    } finally {
      if (active.current && request.current === controller) setBusy(false);
    }
  };

  if (state.loading && !report)
    return (
      <div className="studio-empty" role="status">
        {text('Rapor açılıyor…', 'Opening report…')}
      </div>
    );
  if (!report)
    return (
      <div className="studio-empty">
        <p className="error" role="alert">
          {state.error || text('Rapor açılamadı.', 'The report could not be opened.')}
        </p>
        <button type="button" onClick={state.retryLoad}>
          {text('Yeniden dene', 'Try again')}
        </button>
      </div>
    );
  return (
    <>
      <div className="studio-context">
        <label className="field">
          <span>{text('Çalışılan bölüm', 'Current section')}</span>
          <select
            aria-label={text('Çalışılan bölüm', 'Current section')}
            value={section?.id || ''}
            disabled={busy || state.loading || report.sections.length === 0}
            onChange={(event) => setSectionId(event.target.value)}
          >
            {report.sections.map((item, index) => (
              <option value={item.id} key={item.id}>
                {index + 1}. {item.title}
              </option>
            ))}
          </select>
        </label>
        {section && report.sections.indexOf(section) < report.sections.length - 1 && (
          <button
            className="quiet-button next-section-button"
            disabled={busy}
            onClick={() => setSectionId(report.sections[report.sections.indexOf(section) + 1].id)}
          >
            {text('Sonraki başlık', 'Next section')} →
          </button>
        )}
        <Link
          className="button secondary"
          to={`${basePath}/reports/${encodeURIComponent(reportId)}`}
        >
          <FileText size={16} aria-hidden="true" />
          {text('Tam belgeyi aç', 'Open full document')}
        </Link>
        <span
          className="studio-report-status"
          data-status={
            report.needs_review
              ? 'needs-review'
              : reportHasContent(report)
                ? 'in-progress'
                : 'missing'
          }
        >
          {report.needs_review
            ? text('İnceleme gerekli', 'Needs review')
            : reportHasContent(report)
              ? text('Devam ediyor', 'In progress')
              : text('Henüz yazılmadı', 'Not written yet')}
        </span>
      </div>
      <section
        className="studio-status-region"
        aria-label={text('Çalışma durumu', 'Workspace status')}
      >
        {!scopeConfirmed && (
          <p className="studio-notice notice">
            {text(
              'AI ile yazmak için önce proje kapsamını onaylayın. Manuel düzenleme ve indirme açık.',
              'Confirm the project scope to write with AI. Manual editing and downloads remain available.',
            )}{' '}
            <Link to={`${basePath}/ai/idea`}>{text('Kapsamı gözden geçir', 'Review scope')}</Link>
          </p>
        )}
        {!scopeReady && (
          <div className="studio-notice notice">
            <p>
              {text(
                'Kapsam değişti. Yerel metin ve mesajınız korundu; güncel rapor kontrol ediliyor.',
                'Scope changed. Your local text and message are preserved while the current report is checked.',
              )}
            </p>
            <button
              type="button"
              disabled={messagesLoading}
              onClick={() => {
                void reconcile();
              }}
            >
              {text('Kayıtlı durumu yenile', 'Refresh saved state')}
            </button>
          </div>
        )}
        {report.needs_review && scopeConfirmed && (
          <div className="studio-notice notice">
            <p>
              {text(
                'Kapsam değişti. AI ile devam etmeden önce raporu tam belgede inceleyin; metin değiştirilmedi.',
                'Scope changed. Review the full report before continuing with AI; its text has not changed.',
              )}
            </p>
            {editable && (
              <button
                type="button"
                disabled={
                  !scopeConfirmed ||
                  !scopeReady ||
                  state.saving ||
                  state.conflict ||
                  state.loading ||
                  busy
                }
                onClick={async () => {
                  const saved = await state.flush(true);
                  if (saved && active.current) onReportChanged(saved);
                }}
              >
                {text(
                  'Raporu güncel kapsamla inceledim',
                  'I reviewed this report against the current scope',
                )}
              </button>
            )}
          </div>
        )}
        {!editable && (
          <p className="studio-notice notice">
            {text(
              'Salt okunur: rapor ve kayıtlı konuşma görüntülenebilir.',
              'Read-only: the report and saved conversation are available to read.',
            )}
          </p>
        )}
      </section>
      <fieldset
        className="studio-mobile-tabs"
        aria-label={text('Çalışma görünümü', 'Workspace view')}
      >
        <button
          type="button"
          data-active={view === 'conversation'}
          aria-pressed={view === 'conversation'}
          onClick={() => setView('conversation')}
        >
          {text('Sohbet', 'Conversation')}
        </button>
        <button
          type="button"
          data-active={view === 'document'}
          aria-pressed={view === 'document'}
          onClick={() => setView('document')}
        >
          {text('Belge', 'Document')}
        </button>
      </fieldset>
      <div className="studio-workspace" data-view={view}>
        <section
          className="studio-chat"
          aria-label={text('Rapora özel sohbet', 'Report conversation')}
        >
          <header className="studio-chat-heading">
            <h3>{text('Abi ile yaz', 'Write with Abi')}</h3>
            <details className="compact-menu studio-chat-help">
              <summary
                aria-label={text('Taslaklar nasıl uygulanır?', 'How are drafts applied?')}
                title={text('Taslaklar nasıl uygulanır?', 'How are drafts applied?')}
              >
                <CircleHelp size={17} aria-hidden="true" />
              </summary>
              <div className="compact-menu-panel">
                <p>
                  {text(
                    'Taslaklar sohbette kalır. Belgeye yazmak için açıkça “Taslağı uygula” yazın.',
                    'Drafts stay in the conversation. To write one into the document, explicitly send “Apply draft”.',
                  )}
                </p>
              </div>
            </details>
          </header>
          <div
            ref={history}
            className="studio-chat-history"
            role="log"
            aria-live="polite"
            aria-busy={messagesLoading}
          >
            {messagesLoading && (
              <p role="status">{text('Konuşma yükleniyor…', 'Loading conversation…')}</p>
            )}
            {messagesError && (
              <div>
                <p className="error" role="alert">
                  {messagesError}
                </p>
                <button type="button" onClick={loadMessages}>
                  {text('Konuşmayı yeniden yükle', 'Reload conversation')}
                </button>
              </div>
            )}
            {!messagesLoading && !messagesError && messages.length === 0 && (
              <div className="studio-empty">
                <h3>{text('Bu rapora ait ilk mesajınız', 'Your first message for this report')}</h3>
                <p>
                  {text(
                    'Bir bölüm seçin ve ne yazmak istediğinizi anlatın. Tüm bölümler serbestçe seçilebilir; sırayla tamamlamanız gerekmez.',
                    'Choose any section and describe what you want to write. You can work on every section freely; there is no required completion order.',
                  )}
                </p>
              </div>
            )}
            {messages.map((message) => (
              <article className="studio-message" data-role={message.role} key={message.id}>
                <div className="studio-message-meta">
                  <strong>{message.role === 'user' ? text('Siz', 'You') : 'Abi'}</strong>
                  <time dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleString(
                      language === 'tr' ? 'tr-TR' : 'en-GB',
                      { dateStyle: 'short', timeStyle: 'short' },
                    )}
                  </time>
                  {message.section_id && (
                    <span>
                      {report.sections.find((item) => item.id === message.section_id)?.title ||
                        text('Önceki bölüm', 'Previous section')}
                    </span>
                  )}
                </div>
                <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</p>
              </article>
            ))}
            {busy && (
              <p role="status">{text('Abi yanıt hazırlıyor…', 'Abi is preparing a response…')}</p>
            )}
            {usage && (
              <p className="studio-usage" role="status">
                {text('Aylık kalan sohbet / yazım', 'Monthly chat / writing remaining')}:{' '}
                {usage.chat.remaining} / {usage.write.remaining}
              </p>
            )}
            {applied && (
              <p className="studio-notice notice" role="status">
                {text(
                  'Açık talimatınızla taslak kayıtlı bölüme uygulandı.',
                  'Your explicit instruction applied the draft to the saved section.',
                )}
              </p>
            )}
          </div>
          <form
            className="studio-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="field">
              <span className="sr-only">
                {section
                  ? `${text('Bölüm', 'Section')}: ${section.title}`
                  : text('Mesajınız', 'Your message')}
              </span>
              <textarea
                aria-label={
                  section
                    ? `${text('Bölüm', 'Section')}: ${section.title}`
                    : text('Mesajınız', 'Your message')
                }
                rows={2}
                maxLength={12000}
                value={input}
                disabled={!editable}
                onChange={(event) => updateInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={text(
                  'Bu bölüm için ne yazalım?',
                  'What should we write for this section?',
                )}
              />
            </label>
            <div className="actions">
              <button
                type="submit"
                disabled={
                  !canWrite ||
                  busy ||
                  state.saving ||
                  state.conflict ||
                  state.loading ||
                  !section ||
                  !input.trim() ||
                  messagesLoading ||
                  Boolean(messagesError) ||
                  uncertain
                }
              >
                <Send size={16} aria-hidden="true" />
                {busy
                  ? text('Yanıt bekleniyor…', 'Waiting for a response…')
                  : text('Gönder', 'Send')}
              </button>
              <small>
                {workspace.ai_policy === 'local'
                  ? text('Yerel AI · ayrı rapor geçmişi', 'Local AI · separate report history')
                  : text('Harici AI · ayrı rapor geçmişi', 'External AI · separate report history')}
              </small>
            </div>
            <div className="studio-composer-status">
              {chatError && (
                <p className="error" role="alert">
                  {chatError}
                </p>
              )}
              {storageError && (
                <p className="error" role="alert">
                  {storageError}
                </p>
              )}
              {uncertain && (
                <div className="notice">
                  <p>
                    {text(
                      'Mesajınız korundu. Yanıtın kaydedilip kaydedilmediğini kontrol etmek için devam etmeden önce kayıtlı konuşmayı yenileyin. Aynı mesaj otomatik gönderilmez.',
                      'Your message is preserved. Refresh the saved conversation before continuing to check whether a response was saved. The message is never resent automatically.',
                    )}
                  </p>
                  <button
                    type="button"
                    disabled={messagesLoading}
                    onClick={() => {
                      void reconcile();
                    }}
                  >
                    {text('Kayıtlı durumu yenile', 'Refresh saved state')}
                  </button>
                </div>
              )}
            </div>
          </form>
        </section>
        <section
          className="studio-document"
          aria-label={text('Kayıtlı rapor bölümü', 'Saved report section')}
        >
          <header className="studio-document-heading">
            <div>
              <p className="sr-only">{text('Güncel belge', 'Current document')}</p>
              <h2>{section?.title || report.title}</h2>
              {busy && (
                <span className="studio-document-busy" role="status">
                  {text(
                    'AI yanıt hazırlıyor · düzenleme bekliyor',
                    'AI is responding · editing paused',
                  )}
                </span>
              )}
            </div>
            <ReportDownloads report={state.base} hasUnsaved={state.dirty || state.saving} />
          </header>
          <ReportSaveStatus controller={state} editable={editable} />
          <div className="studio-document-body">
            {source && (
              <details className="report-source-details">
                <summary>{text('Kaynak bilgisi', 'Source information')}</summary>
                <p className="report-sourced">
                  <a href={source} target="_blank" rel="noopener noreferrer">
                    {text('Resmî kaynak', 'Official source')}
                  </a>{' '}
                  ·{' '}
                  {text(
                    'Kaynak başlıkları sabittir; bu belge teslim edilmiş başvuru değildir.',
                    'Source headings are fixed; this document is not a submitted application.',
                  )}
                </p>
              </details>
            )}
            {section ? (
              <RichReportEditor
                key={section.id}
                content={section.content}
                label={section.title}
                readOnly={!editable || busy || state.loading}
                onChange={(content) => state.setSection(section.id, content)}
              />
            ) : (
              <p className="studio-empty">
                {text(
                  'Bu raporda bölüm yok. Tam belgede bir bölüm ekleyin.',
                  'This report has no sections. Add a section in the full editor.',
                )}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function StudioReports({ actorId, workspace, project, reportId, onUsage }: ProjectStudioProps) {
  const { text, language } = useI18n();
  const navigate = useNavigate();
  const editable = canEditWorkspace(workspace.role);
  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerError, setDrawerError] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const drawerTitle = useId();
  const selectionRequest = useRef<AbortController | null>(null);
  const active = useRef(true);
  const reportsRequest = useRef<AbortController | null>(null);
  const currentReportId = useRef(reportId);
  currentReportId.current = reportId;
  const basePath = `/w/${encodeURIComponent(workspace.id)}/projects/${encodeURIComponent(project.id)}`;
  const visibleReports = reports.map((report) => ({
    ...report,
    needs_review:
      report.scope_revision !== project.revision || project.confirmed_revision !== project.revision,
  }));
  const selected = visibleReports.filter((report) => report.selected);
  const current = reportId ? visibleReports.find((report) => report.id === reportId) : undefined;

  const loadReports = useCallback(() => {
    reportsRequest.current?.abort();
    const controller = new AbortController();
    reportsRequest.current = controller;
    setLoading(true);
    setError('');
    const load = editable
      ? initializeReports(project.id, controller.signal, language)
      : listReports(project.id, controller.signal);
    load
      .then((value) => {
        if (controller.signal.aborted) return;
        if (
          value.some(
            (report) => report.project_id !== project.id || report.workspace_id !== workspace.id,
          )
        )
          throw new Error('The server returned reports for a different project.');
        const ordered = [...value].sort((a, b) => a.position - b.position);
        setReports(ordered);
        setSelection(ordered.filter((report) => report.selected).map((report) => report.id));
        if (!currentReportId.current && !ordered.some((report) => report.selected))
          setDrawerOpen(true);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [project.id, workspace.id, editable, language]);

  useEffect(() => {
    active.current = true;
    loadReports();
    return () => {
      active.current = false;
      reportsRequest.current?.abort();
      selectionRequest.current?.abort();
    };
  }, [loadReports]);
  useEffect(() => {
    if (drawerOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [drawerOpen]);

  const updateReport = useRef((report: ProjectReport) => {
    setReports((previous) =>
      previous.map((item) =>
        item.id === report.id && item.revision <= report.revision
          ? { ...report, selected: item.selected }
          : item,
      ),
    );
  }).current;

  const openReport = (id: string) => {
    navigate(`${basePath}/ai/reports?report=${encodeURIComponent(id)}`);
  };
  const saveSelection = async () => {
    if (selectionBusy || !editable || selection.length === 0) return;
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelectionBusy(true);
    setDrawerError('');
    try {
      const value = await selectReports(project.id, selection, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      const ordered = [...value].sort((a, b) => a.position - b.position);
      setReports(ordered);
      const first = ordered.find((report) => report.selected);
      setDrawerOpen(false);
      if (first) openReport(first.id);
    } catch (failure) {
      if (!controller.signal.aborted) setDrawerError(errorMessage(failure));
    } finally {
      if (!controller.signal.aborted) setSelectionBusy(false);
    }
  };

  return (
    <section className="studio-screen">
      <header className="studio-toolbar">
        <h2 className="sr-only">{text('Rapor yazımı', 'Report writing')}</h2>
        <div className="studio-selectors">
          <details className="compact-menu studio-options">
            <summary>
              <Settings2 size={16} aria-hidden="true" />
              {text('Raporlar', 'Reports')}
              <ChevronDown size={13} aria-hidden="true" />
            </summary>
            <div className="compact-menu-panel">
              <button
                type="button"
                disabled={loading}
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  setSelection(
                    reports.filter((report) => report.selected).map((report) => report.id),
                  );
                  setDrawerError('');
                  setDrawerOpen(true);
                }}
              >
                {text('Raporları seç', 'Choose reports')}
              </button>
            </div>
          </details>
          <label className="field">
            <span>{text('Rapor', 'Report')}</span>
            <select
              aria-label={text('Rapor', 'Report')}
              value={current?.id || ''}
              disabled={loading || selected.length === 0}
              onChange={(event) => openReport(event.target.value)}
            >
              <option value="" disabled>
                {text('Bir rapor açın', 'Open a report')}
              </option>
              {(current && !current.selected ? [current, ...selected] : selected).map((report) => (
                <option value={report.id} key={report.id}>
                  {report.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {loading && (
        <p role="status" className="studio-empty">
          {text('Raporlar yükleniyor…', 'Loading reports…')}
        </p>
      )}
      {error && (
        <div className="studio-empty">
          <p role="alert" className="error">
            {error}
          </p>
          <button type="button" onClick={loadReports}>
            {text('Yeniden dene', 'Try again')}
          </button>
        </div>
      )}
      {current && (
        <ReportConversation
          key={`${actorId}:${workspace.id}:${project.id}:${current.id}`}
          actorId={actorId}
          workspace={workspace}
          project={project}
          reportId={current.id}
          onUsage={onUsage}
          onReportChanged={updateReport}
        />
      )}
      {!loading && !error && !current && (
        <div className="studio-empty">
          <h2>
            {reportId
              ? text('Bu rapor projede bulunamadı', 'This report was not found in the project')
              : text(
                  'Üzerinde çalışacağınız raporları seçin',
                  'Choose the reports you want to work on',
                )}
          </h2>
          <p>
            {text(
              'Beş temel rapor ve seçtiğiniz desteklere ait belgeler hazır şablonlarla başlar. Rapor veya bölüm seçmek AI çalıştırmaz.',
              'The five core reports and documents for your selected funding calls start from predefined templates. Choosing a report or section never calls AI.',
            )}
          </p>
          {selected.length > 0 && (
            <button type="button" onClick={() => openReport(selected[0].id)}>
              {text('İlk seçili raporu aç', 'Open first selected report')}
            </button>
          )}
          <button type="button" onClick={() => setDrawerOpen(true)}>
            {text('Raporları göster', 'Show reports')}
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="drawer-panel"
        aria-labelledby={drawerTitle}
        onCancel={(event) => {
          if (selectionBusy) event.preventDefault();
          else setDrawerOpen(false);
        }}
        onClose={() => setDrawerOpen(false)}
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">{project.title}</p>
            <h2 id={drawerTitle}>{text('Rapor çalışma alanınız', 'Your report workspace')}</h2>
          </div>
          <button
            type="button"
            disabled={selectionBusy}
            aria-label={text('Kapat', 'Close')}
            onClick={() => setDrawerOpen(false)}
          >
            ×
          </button>
        </header>
        <div className="drawer-body">
          <p>
            {text(
              'Birden fazla rapor seçebilirsiniz. Seçim yalnızca çalışma listenizi kaydeder; AI veya kredi kullanmaz.',
              'Choose multiple reports. Selection only saves your working list; it does not call AI or consume credits.',
            )}
          </p>
          {[
            {
              title: text('Temel raporlar', 'Core reports'),
              items: visibleReports.filter((report) => !report.call_id),
            },
            {
              title: text('Seçili destek raporları', 'Selected funding reports'),
              items: visibleReports.filter((report) => Boolean(report.call_id)),
            },
          ].map((group) => (
            <section className="studio-selection-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.items.length === 0 && (
                <p className="studio-empty">
                  {text(
                    'Henüz seçili destek yok. Destek bul ekranından bir destek ekleyebilirsiniz.',
                    'No funding calls selected yet. Add one from Find support.',
                  )}
                </p>
              )}
              {group.items.map((report) => (
                <div className="studio-report-option" key={report.id}>
                  <label>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={selection.includes(report.id)}
                      checked={selection.includes(report.id)}
                      disabled={!editable || selectionBusy}
                      onChange={(event) =>
                        setSelection((previous) =>
                          event.target.checked
                            ? [...previous, report.id]
                            : previous.filter((id) => id !== report.id),
                        )
                      }
                    />
                    <span>{report.title}</span>
                  </label>
                  <span
                    className="studio-report-status"
                    data-status={
                      report.needs_review
                        ? 'needs-review'
                        : reportHasContent(report)
                          ? 'in-progress'
                          : 'missing'
                    }
                  >
                    {report.needs_review
                      ? text('İnceleme gerekli', 'Needs review')
                      : reportHasContent(report)
                        ? text('Devam ediyor', 'In progress')
                        : text('Eksik', 'Missing')}
                  </span>
                  {!editable && (
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerOpen(false);
                        openReport(report.id);
                      }}
                    >
                      {text('Aç', 'Open')}
                    </button>
                  )}
                </div>
              ))}
            </section>
          ))}
          {drawerError && (
            <p className="error" role="alert">
              {drawerError}
            </p>
          )}
        </div>
        <footer className="drawer-footer">
          {editable && (
            <button
              type="button"
              disabled={selectionBusy || selection.length === 0}
              onClick={() => {
                void saveSelection();
              }}
            >
              {selectionBusy
                ? text('Seçim kaydediliyor…', 'Saving selection…')
                : text('Seçilenlerle başla', 'Start selected reports')}
            </button>
          )}
          <button type="button" disabled={selectionBusy} onClick={() => setDrawerOpen(false)}>
            {text('Vazgeç', 'Cancel')}
          </button>
        </footer>
      </dialog>
    </section>
  );
}

export default function ProjectStudio(props: ProjectStudioProps) {
  const { text } = useI18n();
  if (props.mode === 'idea')
    return (
      <p className="studio-notice">
        {text(
          'Fikir geliştirme için Fikir modunu açın.',
          'Open Idea mode to develop your project idea.',
        )}
      </p>
    );
  return (
    <StudioReports key={`${props.actorId}:${props.workspace.id}:${props.project.id}`} {...props} />
  );
}
