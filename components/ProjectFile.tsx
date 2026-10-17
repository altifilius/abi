import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Globe2,
  Layers3,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { canEditWorkspace } from '../services/navigation';
import type { ProjectReport } from '../services/reports';
import {
  exportReport,
  initializeReports,
  listReports,
  reportHasContent,
} from '../services/reports';
import type { Application, CalendarEvent, Project, Task, Workspace } from '../types';
import { fundingDisplayName } from './FundingCatalog';

interface SelectedFunding {
  id: string;
  call_id: string;
  program_name: string;
  call_title: string;
  call_state: string;
  template: { documents?: { key: string; label: string; required?: boolean }[] };
  source_url: string | null;
  report_id?: string;
}
const reportLabels: Record<string, [string, string]> = {
  summary: ['Proje özeti', 'Project summary'],
  project_plan: ['Ayrıntılı proje planı', 'Project plan'],
  business_plan: ['İş planı', 'Business plan'],
  feasibility: ['Fizibilite raporu', 'Feasibility study'],
  financial_plan: ['Bütçe ve finansman planı', 'Budget and funding plan'],
};

export default function ProjectFile({
  workspace,
  project,
}: {
  workspace: Workspace;
  project: Project;
}) {
  const { text, language } = useI18n();
  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [funds, setFunds] = useState<SelectedFunding[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dates, setDates] = useState<CalendarEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const base = `/w/${workspace.id}/projects/${project.id}`;
  const root = `/w/${workspace.id}`;
  const canEdit = canEditWorkspace(workspace.role);
  const confirmed = project.confirmed_revision === project.revision;
  const loadProjectFile = useCallback(() => {
    activeLoad.current?.abort();
    const active = new AbortController();
    activeLoad.current = active;
    setLoading(true);
    setError('');
    setReports([]);
    setFunds([]);
    setTasks([]);
    setDates([]);
    setApplications([]);
    const reportsRequest = canEdit
      ? initializeReports(project.id, active.signal, language)
      : listReports(project.id, active.signal);
    const query = new URLSearchParams({ project_id: project.id });
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 90 * 86400000).toISOString();
    const requests = [
      reportsRequest.then((value) => {
        if (!active.signal.aborted) setReports(value);
      }),
      api<SelectedFunding[]>(`/projects/${project.id}/funding-selections`, {
        signal: active.signal,
      }).then((value) => {
        if (!active.signal.aborted) setFunds(value);
      }),
      api<Application[]>(`/workspaces/${workspace.id}/applications?${query}`, {
        signal: active.signal,
      }).then((value) => {
        if (!active.signal.aborted) setApplications(value);
      }),
      api<Task[]>(`/workspaces/${workspace.id}/tasks?${query}`, { signal: active.signal }).then(
        (value) => {
          if (!active.signal.aborted) setTasks(value);
        },
      ),
      api<{ events: CalendarEvent[] }>(
        `/workspaces/${workspace.id}/calendar?${new URLSearchParams({ project_id: project.id, from_at: from, to_at: to })}`,
        { signal: active.signal },
      ).then((value) => {
        if (!active.signal.aborted) setDates(value.events);
      }),
    ];
    void Promise.allSettled(requests).then((results) => {
      if (active.signal.aborted) return;
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      setError(failures.map((failure) => errorMessage(failure.reason)).join(' · '));
      setLoading(false);
    });
    return active;
  }, [project.id, workspace.id, canEdit, language]);
  useEffect(() => {
    loadProjectFile();
    return () => activeLoad.current?.abort();
  }, [loadProjectFile]);
  const download = useCallback(async (report: ProjectReport, format: 'pdf' | 'docx') => {
    setDownloading(report.id);
    setError('');
    try {
      await exportReport(report, format);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDownloading(null);
    }
  }, []);
  const renderReports = (list: ProjectReport[]) => (
    <ul className="report-records">
      {list.map((report) => (
        <li key={report.id}>
          <Link className="report-record-title" to={`${base}/reports/${report.id}`}>
            <span className="document-glyph">
              <FileText size={18} />
            </span>
            <span>
              <strong>{fundingDisplayName(report.title)}</strong>
              <small className={report.needs_review ? 'status-review' : ''}>
                {report.needs_review
                  ? text('Kapsam değişti · Gözden geçir', 'Scope changed · Review needed')
                  : reportHasContent(report)
                    ? text('Taslak', 'Draft')
                    : text('Henüz yazılmadı', 'Not started')}
              </small>
            </span>
          </Link>
          <div className="report-record-actions">
            <Link to={`${base}/reports/${report.id}`} className="quiet-button">
              {text('Aç', 'Open')}
            </Link>
            {canEdit && (
              <Link to={`${base}/ai/reports?report=${report.id}`} className="quiet-button">
                <Sparkles size={14} />
                {reportHasContent(report)
                  ? text('AI ile geliştir', 'Refine with AI')
                  : text('AI ile yaz', 'Write with AI')}
              </Link>
            )}
            <details className="download-menu">
              <summary aria-label={`${report.title} · ${text('İndir', 'Download')}`}>
                <ArrowDownToLine size={15} />
                <span>{text('İndir', 'Download')}</span>
              </summary>
              <div>
                <button
                  disabled={downloading === report.id}
                  onClick={() => void download(report, 'pdf')}
                >
                  PDF
                </button>
                <button
                  disabled={downloading === report.id}
                  onClick={() => void download(report, 'docx')}
                >
                  DOCX
                </button>
              </div>
            </details>
          </div>
        </li>
      ))}
    </ul>
  );
  const core = reports.filter((report) => !report.call_id);
  const next =
    reports.find((report) => report.needs_review) ||
    core.find((report) => !reportHasContent(report)) ||
    core[0];
  const nextPath = !confirmed
    ? `${base}/ai/idea`
    : next?.needs_review
      ? `${base}/reports/${next.id}`
      : next
        ? `${base}/ai/reports?report=${next.id}`
        : `${base}/ai/reports`;
  return (
    <div className="project-file page-enter">
      <section className="next-step-card">
        <div className="next-step-symbol">
          <Sparkles size={24} strokeWidth={1.5} />
        </div>
        <div>
          <p className="eyebrow">{text('BİR SONRAKİ ADIM', 'YOUR NEXT STEP')}</p>
          <h2>
            {!confirmed
              ? text(
                  'Fikrinin çerçevesini birlikte netleştirelim.',
                  'Let’s give your idea a clear direction.',
                )
              : next?.needs_review
                ? text('Yeni kapsamını raporlarına yansıt.', 'Bring your reports up to date.')
                : next
                  ? text(
                      `${reportLabels[next.template_key]?.[0] || next.title} üzerinde ilerle.`,
                      `Keep shaping ${reportLabels[next.template_key]?.[1] || next.title}.`,
                    )
                  : text('İlk raporuna birlikte başlayalım.', 'Let’s start your first report.')}
          </h2>
          <p>
            {!confirmed
              ? text(
                  'Kapsamını onayla; sonra raporlarına ve destek önerilerine geç.',
                  'Confirm the scope, then move on to reports and funding suggestions.',
                )
              : text(
                  'Küçük bir bölüm, anlamlı bir ilerleme. Kaldığın yerden devam et.',
                  'One small section. One meaningful step. Continue where you left off.',
                )}
          </p>
        </div>
        <Link className="primary button-link" to={nextPath}>
          {text('AI ile devam et', 'Continue with AI')}
          <ArrowRight size={17} />
        </Link>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
          <button className="text-button" onClick={() => loadProjectFile()}>
            {text('Yeniden dene', 'Try again')}
          </button>
        </p>
      )}
      <div className="file-section-heading">
        <div>
          <p className="eyebrow">
            {text('FİKRİNİN BÜTÜN PARÇALARI', 'THE PIECES OF YOUR PROJECT')}
          </p>
          <h2>{text('Proje dosyan', 'Your project file')}</h2>
        </div>
        <details className="file-tools">
          <summary>
            {text('Diğer işlemler', 'More tools')}
            <ChevronDown size={15} />
          </summary>
          <div>
            <Link to={`${base}/profile`}>
              {text('Ayrıntılı bilgiler', 'Detailed project facts')}
            </Link>
            <Link to={`${base}/budget`}>{text('Başvuru bütçesi', 'Application budget')}</Link>
            <Link to={`${base}/eligibility`}>
              {text('Kaynaklı uygunluk incelemesi', 'Source-backed eligibility')}
            </Link>
            <Link to={`${base}/history`}>{text('Proje geçmişi', 'Project history')}</Link>
          </div>
        </details>
      </div>
      <div className="file-card-grid">
        <section className={`file-card report-group ${expanded === 'core' ? 'is-expanded' : ''}`}>
          <button
            className="file-card-toggle"
            aria-expanded={expanded === 'core'}
            onClick={() => setExpanded((previous) => (previous === 'core' ? null : 'core'))}
          >
            <span className="file-card-icon">
              <Layers3 size={23} strokeWidth={1.5} />
            </span>
            <span>
              <strong>{text('Proje raporları', 'Project reports')}</strong>
              <small>
                {loading
                  ? text('Raporlar yükleniyor…', 'Loading reports…')
                  : text(
                      `${core.length} temel rapor · ${core.filter(reportHasContent).length} taslak`,
                      `${core.length} core reports · ${core.filter(reportHasContent).length} drafted`,
                    )}
              </small>
            </span>
            {expanded === 'core' ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
          </button>
          {expanded === 'core' && (
            <div className="file-card-body">
              {renderReports(core)}
              {!core.length && !loading && (
                <p>
                  {text(
                    'Bu proje için henüz rapor oluşturulmadı.',
                    'No reports have been initialized for this project.',
                  )}
                </p>
              )}
            </div>
          )}
        </section>
        <Link className="file-card funding-suggestion" to={`${root}/funding?project=${project.id}`}>
          <span className="file-card-icon support-icon">
            <Globe2 size={24} strokeWidth={1.5} />
          </span>
          <span>
            <strong>{text('Destek önerileri', 'Find your support')}</strong>
            <small>
              {text(
                'Projene uygun yolları, gerekçeleriyle keşfet.',
                'Explore relevant opportunities, with reasons why.',
              )}
            </small>
          </span>
          <ArrowRight size={20} />
        </Link>
      </div>
      {(funds.length > 0 || applications.length > 0) && (
        <section className="fund-document-groups">
          <div className="file-section-heading">
            <h2>{text('Desteklere özel belgeler', 'Your funding documents')}</h2>
            <Link className="text-link" to={`${root}/funding?project=${project.id}`}>
              <Plus size={15} />
              {text('Destek ekle', 'Add support')}
            </Link>
          </div>
          <div className="file-card-grid">
            {funds.map((fund) => {
              const fundReports = reports.filter((report) => report.call_id === fund.call_id);
              const linkedApplications = applications.filter(
                (application) => application.call_id === fund.call_id,
              );
              return (
                <section
                  className={`file-card report-group ${expanded === fund.id ? 'is-expanded' : ''}`}
                  key={fund.id}
                >
                  <button
                    className="file-card-toggle"
                    aria-expanded={expanded === fund.id}
                    onClick={() =>
                      setExpanded((previous) => (previous === fund.id ? null : fund.id))
                    }
                  >
                    <span className="file-card-icon fund-icon">
                      <FolderOpen size={23} strokeWidth={1.5} />
                    </span>
                    <span>
                      <strong>{fundingDisplayName(fund.program_name)}</strong>
                      <small>{fundingDisplayName(fund.call_title)}</small>
                    </span>
                    {expanded === fund.id ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
                  </button>
                  {expanded === fund.id && (
                    <div className="file-card-body">
                      <p className="quiet-notice">
                        {text(
                          'Hazırlık belgeleri resmî gönderim değildir. Zorunlu kaynak ve insan incelemeleri korunur.',
                          'Preparation is not an official submission. Source and human-review requirements still apply.',
                        )}
                      </p>
                      {renderReports(fundReports)}
                      {!!fund.template?.documents?.length && (
                        <details className="required-attachments">
                          <summary>
                            {text('Gerekli orijinal ekler', 'Required original attachments')}
                          </summary>
                          <ul>
                            {fund.template.documents.map((document) => (
                              <li key={document.key}>
                                {document.label}
                                {document.required ? ` · ${text('Zorunlu', 'Required')}` : ''}
                              </li>
                            ))}
                          </ul>
                          <Link to={`${root}/documents?project=${project.id}`}>
                            {text('Belgeleri yükle ve incele', 'Upload and review documents')}
                          </Link>
                        </details>
                      )}
                      <div className="actions">
                        {linkedApplications.map((application) => (
                          <Link
                            className="quiet-button"
                            key={application.id}
                            to={`${root}/applications/${application.id}/overview`}
                          >
                            {text('Başvuruyu incele', 'Review application')}
                            <ArrowRight size={14} />
                          </Link>
                        ))}
                        <Link
                          className="quiet-button"
                          to={`${root}/applications?project=${project.id}&call=${fund.call_id}`}
                        >
                          {text('Başvuru kontrolleri ve paket', 'Application checks and package')}
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
            {applications
              .filter((application) => !funds.some((fund) => fund.call_id === application.call_id))
              .map((application) => (
                <Link
                  className="file-card"
                  key={application.id}
                  to={`${root}/applications/${application.id}/overview`}
                >
                  <span className="file-card-icon">
                    <FolderOpen size={22} />
                  </span>
                  <span>
                    <strong>
                      {application.program_name ||
                        application.call_title ||
                        text('Kayıtlı başvuru', 'Saved application')}
                    </strong>
                    <small>
                      {text(
                        'Mevcut başvuruna ve incelemelerine devam et.',
                        'Continue the saved application and its reviews.',
                      )}
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </Link>
              ))}
          </div>
        </section>
      )}
      <details className="project-tasks-card">
        <summary>
          <span className="file-card-icon">
            <CalendarDays size={20} />
          </span>
          <span>
            <strong>{text('Yapılacaklar ve tarihler', 'Things to do, dates to remember')}</strong>
            <small>
              {text(
                `${tasks.filter((task) => task.status !== 'done').length} açık iş · ${dates.length} yaklaşan tarih`,
                `${tasks.filter((task) => task.status !== 'done').length} open tasks · ${dates.length} upcoming dates`,
              )}
            </small>
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className="project-tasks-body">
          <ul className="task-mini-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  className={`task-check ${task.status === 'done' ? 'checked' : ''}`}
                  disabled={!canEdit || workspace.plan !== 'pro' || taskBusy}
                  aria-label={`${task.title} · ${task.status === 'done' ? text('Yeniden aç', 'Reopen') : text('Tamamla', 'Complete')}`}
                  onClick={async () => {
                    setTaskBusy(true);
                    try {
                      await api(`/tasks/${task.id}`, {
                        method: 'PATCH',
                        json: { status: task.status === 'done' ? 'open' : 'done' },
                      });
                      loadProjectFile();
                    } catch (reason) {
                      setError(errorMessage(reason));
                    } finally {
                      setTaskBusy(false);
                    }
                  }}
                >
                  {task.status === 'done' && <Check size={13} />}
                </button>
                <Link to={`${root}/tasks?project=${project.id}&task=${task.id}`}>{task.title}</Link>
                {task.due_at && (
                  <time>
                    {new Date(task.due_at).toLocaleDateString(
                      language === 'tr' ? 'tr-TR' : 'en-GB',
                    )}
                  </time>
                )}
              </li>
            ))}
          </ul>
          {dates
            .filter((date) => date.kind !== 'task')
            .slice(0, 6)
            .map((date) => (
              <p className="date-mini-row" key={date.id}>
                <span>{date.title}</span>
                <time>
                  {new Date(date.start_at).toLocaleDateString(
                    language === 'tr' ? 'tr-TR' : 'en-GB',
                  )}
                </time>
              </p>
            ))}
          {!tasks.length && !dates.length && (
            <p className="muted">
              {text(
                'Henüz yapılacak iş veya yaklaşan tarih yok.',
                'No tasks or upcoming dates yet.',
              )}
            </p>
          )}
          {canEdit && workspace.plan === 'pro' && (
            <form
              className="task-quick-add"
              onSubmit={async (event) => {
                event.preventDefault();
                if (taskBusy || !taskTitle.trim()) return;
                setTaskBusy(true);
                try {
                  await api(`/projects/${project.id}/tasks`, {
                    method: 'POST',
                    json: {
                      title: taskTitle.trim(),
                      ...(taskDue ? { due_at: new Date(taskDue).toISOString() } : {}),
                    },
                  });
                  setTaskTitle('');
                  setTaskDue('');
                  loadProjectFile();
                } catch (reason) {
                  setError(errorMessage(reason));
                } finally {
                  setTaskBusy(false);
                }
              }}
            >
              <label className="sr-only" htmlFor="quick-task">
                {text('Yapılacak iş', 'New task')}
              </label>
              <input
                id="quick-task"
                placeholder={text('Küçük bir sonraki adım ekle…', 'Add a small next step…')}
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                maxLength={300}
              />
              <label className="sr-only" htmlFor="quick-task-due">
                {text('Son tarih', 'Due date')}
              </label>
              <input
                id="quick-task-due"
                type="datetime-local"
                value={taskDue}
                onChange={(event) => setTaskDue(event.target.value)}
              />
              <button
                disabled={taskBusy || !taskTitle.trim()}
                aria-label={text('İş ekle', 'Add task')}
              >
                <Plus size={17} />
              </button>
            </form>
          )}
          <div className="actions">
            <Link className="text-link" to={`${root}/tasks?project=${project.id}`}>
              {text('Tüm yapılacaklar', 'All project tasks')}
              <ArrowRight size={14} />
            </Link>
            <Link className="text-link" to={`${root}/calendar?project=${project.id}`}>
              {text('Takvim ve ICS', 'Calendar and ICS')}
              <ArrowRight size={14} />
            </Link>
            <Link className="text-link" to={`${root}/documents?project=${project.id}`}>
              {text('Orijinal belgeler', 'Original documents')}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </details>
      <p className="project-file-footer">
        <Check size={14} />
        {text(
          'Dosyan hesabında güvenle saklanır. AI, sen istemeden kayıtlı metnini değiştirmez.',
          'Your work stays with your account. AI never changes saved writing without your instruction.',
        )}
      </p>
    </div>
  );
}
