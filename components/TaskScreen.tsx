import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { api } from '../services/api';
import { canEditWorkspace } from '../services/navigation';
import type { Project, User, Workspace } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

interface TaskRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  project_title: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  application_id: string | null;
  application_title?: string | null;
  document_id: string | null;
  document_name?: string | null;
  due_at: string | null;
  status: 'open' | 'in_progress' | 'done';
  updated_at: string;
}
interface Member {
  user_id: string;
  name: string;
  role: string;
}
interface Comment {
  id: string;
  author_id: string | null;
  text: string;
  created_at: string;
}
interface TaskHistory {
  id: string;
  event_type: 'task.created' | 'task.updated' | 'task.deleted';
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
  detail: { changed_fields?: string[]; assignee_id?: string | null; status?: string };
}
interface TaskDraft {
  title: string;
  description: string;
  assignee_id: string;
  application_id: string;
  document_id: string;
  due_at: string;
  status: TaskRecord['status'];
}

function taskDraft(task?: TaskRecord): TaskDraft {
  return {
    title: task?.title || '',
    description: task?.description || '',
    assignee_id: task?.assignee_id || '',
    application_id: task?.application_id || '',
    document_id: task?.document_id || '',
    due_at: task?.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : '',
    status: task?.status || 'open',
  };
}

function TaskEditor({
  workspace,
  projects,
  members,
  taskId,
  onChanged,
}: {
  workspace: Workspace;
  projects: Project[];
  members: Member[];
  taskId: string;
  onChanged: () => void;
}) {
  const text = useEvidenceText();
  const textRef = useRef(text);
  textRef.current = text;
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => taskDraft());
  const [saved, setSaved] = useState<TaskDraft>(() => taskDraft());
  const [projectId, setProjectId] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [applications, setApplications] = useState<
    { id: string; call_title: string; state: string }[]
  >([]);
  const [documents, setDocuments] = useState<{ id: string; original_name: string }[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(taskId !== 'new');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<TaskRecord | null>(null);
  const [deleted, setDeleted] = useState(false);
  const taskProjectId = task?.project_id;
  const referenceProjectId = taskProjectId || projectId;
  const editable = workspace.plan === 'pro' && canEditWorkspace(workspace.role);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) ||
    !!comment ||
    (taskId === 'new' && !!projectId);
  useUnsavedChanges(dirty, () => {
    setDraft(saved);
    setProjectId('');
    setComment('');
  });

  useEffect(() => {
    if (taskId === 'new') return;
    const controller = new AbortController();
    api<TaskRecord>(`/tasks/${encodeURIComponent(taskId)}`, { signal: controller.signal })
      .then((record) => {
        if (controller.signal.aborted) return;
        if (record.workspace_id !== workspace.id)
          throw new Error(
            textRef.current(
              'Görev bu çalışma alanında değil.',
              'Task does not belong to this workspace.',
            ),
          );
        setTask(record);
        setDraft(taskDraft(record));
        setSaved(taskDraft(record));
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [taskId, workspace.id]);

  useEffect(() => {
    if (!taskProjectId || workspace.plan !== 'pro') return;
    const controller = new AbortController();
    api<Comment[]>(`/projects/${taskProjectId}/comments`, { signal: controller.signal })
      .then((records) => {
        if (!controller.signal.aborted) setComments(records);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      });
    return () => controller.abort();
  }, [taskProjectId, workspace.plan]);

  useEffect(() => {
    setApplications([]);
    setDocuments([]);
    setReferencesLoading(false);
    if (!referenceProjectId) return;
    const controller = new AbortController();
    setReferencesLoading(true);
    async function records<T>(kind: 'applications' | 'documents'): Promise<T[]> {
      const result: T[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await api<T[]>(
          `/workspaces/${workspace.id}/${kind}?project_id=${encodeURIComponent(referenceProjectId)}&limit=500&offset=${offset}`,
          { signal: controller.signal },
        );
        result.push(...page);
        if (page.length < 500) return result;
      }
    }
    Promise.all([
      records<{ id: string; call_title: string; state: string }>('applications'),
      records<{ id: string; original_name: string }>('documents'),
    ])
      .then(([applicationRecords, documentRecords]) => {
        if (!controller.signal.aborted) {
          setApplications(applicationRecords);
          setDocuments(documentRecords);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReferencesLoading(false);
      });
    return () => controller.abort();
  }, [referenceProjectId, workspace.id]);

  const loadHistory = useCallback(
    async (offset = 0, signal?: AbortSignal) => {
      if (taskId === 'new') return;
      setHistoryLoading(true);
      try {
        const records = await api<TaskHistory[]>(
          `/tasks/${encodeURIComponent(taskId)}/history?limit=50&offset=${offset}`,
          { signal },
        );
        if (!signal?.aborted) {
          setHistory((previous) => (offset ? [...previous, ...records] : records));
          setHistoryMore(records.length === 50);
        }
      } catch (reason) {
        if (!signal?.aborted) setError(errorText(reason));
      } finally {
        if (!signal?.aborted) setHistoryLoading(false);
      }
    },
    [taskId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(0, controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  function changeHistory() {
    return (
      <section>
        <h3>{text('Değişiklik geçmişi', 'Change history')}</h3>
        <p>
          {text(
            'Yalnızca bu görevin kayıtlı işlem metaverisi gösterilir.',
            'Only recorded operation metadata for this task is shown.',
          )}
        </p>
        {!history.length && !historyLoading && (
          <p>{text('Kayıtlı işlem yok.', 'No recorded operations.')}</p>
        )}
        <ol>
          {history.map((event) => (
            <li key={event.id}>
              {event.event_type === 'task.created'
                ? text('Oluşturuldu', 'Created')
                : event.event_type === 'task.deleted'
                  ? text('Silindi', 'Deleted')
                  : text('Güncellendi', 'Updated')}
              {' · '}
              {event.actor_name || text('Silinmiş kullanıcı', 'Deleted user')}
              {' · '}
              {timestamp(event.created_at)}
              {event.detail.changed_fields?.length
                ? ` · ${event.detail.changed_fields.join(', ')}`
                : ''}
              {event.detail.status ? ` · ${event.detail.status}` : ''}
            </li>
          ))}
        </ol>
        {historyLoading && <p role="status">{text('Geçmiş yükleniyor…', 'Loading history…')}</p>}
        {historyMore && (
          <button
            type="button"
            className={buttonClass}
            disabled={historyLoading}
            onClick={() => void loadHistory(history.length)}
          >
            {text('Daha eski işlemler', 'Older operations')}
          </button>
        )}
      </section>
    );
  }

  async function save() {
    if (!editable || busy) return;
    setBusy(true);
    setError('');
    try {
      const dueAt =
        task && draft.due_at === saved.due_at
          ? task.due_at
          : draft.due_at
            ? new Date(`${draft.due_at}Z`).toISOString()
            : null;
      const json = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        assignee_id: draft.assignee_id || null,
        application_id: draft.application_id || null,
        document_id: draft.document_id || null,
        due_at: dueAt,
        ...(task ? { status: draft.status } : {}),
      };
      const result = await api<TaskRecord>(
        task ? `/tasks/${task.id}` : `/projects/${projectId}/tasks`,
        { method: task ? 'PATCH' : 'POST', json },
      );
      if (task) {
        setTask({ ...task, ...result });
        setSaved(taskDraft(result));
        setDraft(taskDraft(result));
        await loadHistory();
      } else {
        setCreated(result);
        setDraft(taskDraft());
        setSaved(taskDraft());
        setProjectId('');
      }
      onChanged();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">{text('Görev yükleniyor…', 'Loading task…')}</p>;
  if (taskId !== 'new' && !task)
    return <p role="alert">{error || text('Görev bulunamadı.', 'Task not found.')}</p>;
  if (deleted)
    return (
      <section className={panelClass}>
        <p role="status">
          {text('Görev silindi.', 'Task deleted.')}{' '}
          <Link to={`/w/${workspace.id}/tasks`}>{text('Görev listesi', 'Task list')}</Link>
        </p>
        {error && <p role="alert">{error}</p>}
        {changeHistory()}
      </section>
    );

  return (
    <section className={panelClass}>
      <h2>{task ? text('Görev ayrıntısı', 'Task detail') : text('Yeni görev', 'New task')}</h2>
      {error && <p role="alert">{error}</p>}
      {created && (
        <p role="status">
          {text('Görev oluşturuldu.', 'Task created.')}{' '}
          <Link to={`/w/${workspace.id}/tasks?task=${created.id}`}>{created.title}</Link>
        </p>
      )}
      {task && (
        <p>
          <Link to={`/w/${workspace.id}/projects/${task.project_id}/overview`}>
            {task.project_title ||
              projects.find((project) => project.id === task.project_id)?.title ||
              task.project_id}
          </Link>{' '}
          · {timestamp(task.updated_at)}
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={!editable || busy} className="space-y-3">
          {!task && (
            <label className="block">
              {text('Proje', 'Project')}
              <select
                required
                className={inputClass}
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setDraft({ ...draft, application_id: '', document_id: '' });
                }}
              >
                <option value="">{text('Proje seçin', 'Choose a project')}</option>
                {projects
                  .filter((project) => project.stage !== 'archived')
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="block">
            {text('Başlık', 'Title')}
            <input
              required
              maxLength={300}
              className={inputClass}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="block">
            {text('Açıklama', 'Description')}
            <textarea
              maxLength={10000}
              rows={4}
              className={inputClass}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <label className="block">
            {text('Sorumlu', 'Assignee')}
            <select
              className={inputClass}
              value={draft.assignee_id}
              onChange={(event) => setDraft({ ...draft, assignee_id: event.target.value })}
            >
              <option value="">{text('Atanmamış', 'Unassigned')}</option>
              {draft.assignee_id &&
                !members.some(
                  (member) => member.user_id === draft.assignee_id && member.role !== 'viewer',
                ) && (
                  <option value={draft.assignee_id} disabled>
                    {task?.assignee_name || text('Eski sorumlu', 'Former assignee')} ·{' '}
                    {text('Artık seçilemez', 'No longer selectable')}
                  </option>
                )}
              {members
                .filter((member) => member.role !== 'viewer')
                .map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name} · {member.role}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            {text('İlgili başvuru', 'Related application')}
            <select
              className={inputClass}
              disabled={referencesLoading || !referenceProjectId}
              value={draft.application_id}
              onChange={(event) => setDraft({ ...draft, application_id: event.target.value })}
            >
              <option value="">{text('İlişki yok', 'No relation')}</option>
              {draft.application_id &&
                !applications.some((application) => application.id === draft.application_id) && (
                  <option value={draft.application_id} disabled>
                    {task?.application_title || text('Kayıtlı başvuru', 'Saved application')}
                  </option>
                )}
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.call_title} · {application.state}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {text('İlgili belge', 'Related document')}
            <select
              className={inputClass}
              disabled={referencesLoading || !referenceProjectId}
              value={draft.document_id}
              onChange={(event) => setDraft({ ...draft, document_id: event.target.value })}
            >
              <option value="">{text('İlişki yok', 'No relation')}</option>
              {draft.document_id &&
                !documents.some((document) => document.id === draft.document_id) && (
                  <option value={draft.document_id} disabled>
                    {task?.document_name || text('Kayıtlı belge', 'Saved document')}
                  </option>
                )}
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.original_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {text('Son tarih (UTC)', 'Due date (UTC)')}
            <input
              type="datetime-local"
              className={inputClass}
              value={draft.due_at}
              onChange={(event) => setDraft({ ...draft, due_at: event.target.value })}
            />
          </label>
          {task && (
            <label className="block">
              {text('Durum', 'Status')}
              <select
                className={inputClass}
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value as TaskDraft['status'] })
                }
              >
                <option value="open">{text('Açık', 'Open')}</option>
                <option value="in_progress">{text('Sürüyor', 'In progress')}</option>
                <option value="done">{text('Tamamlandı', 'Done')}</option>
              </select>
            </label>
          )}
          <button
            className={buttonClass}
            disabled={!draft.title.trim() || (!task && !projectId) || (task ? !dirty : false)}
          >
            {text('Görevi kaydet', 'Save task')}
          </button>
        </fieldset>
      </form>
      {!editable && (
        <p>
          {workspace.plan !== 'pro'
            ? text(
                'Görev düzenleme Pro gerektirir; kayıtları okuyabilirsiniz.',
                'Task editing requires Pro; existing records remain readable.',
              )
            : text('Görüntüleyici: salt okunur.', 'Viewer: read only.')}
        </p>
      )}
      {task && (
        <>
          <h3>{text('İlgili kayıtlar', 'Related records')}</h3>
          <ul>
            <li>
              <Link to={`/w/${workspace.id}/projects/${task.project_id}/overview`}>
                {task.project_title || text('Proje', 'Project')}
              </Link>
            </li>
            {task.application_id && (
              <li>
                <Link to={`/w/${workspace.id}/applications/${task.application_id}/overview`}>
                  {applications.find((application) => application.id === task.application_id)
                    ?.call_title ||
                    task.application_title ||
                    text('İlgili başvuru', 'Related application')}
                </Link>
              </li>
            )}
            {task.document_id && (
              <li>
                <Link to={`/w/${workspace.id}/documents?document=${task.document_id}`}>
                  {documents.find((document) => document.id === task.document_id)?.original_name ||
                    task.document_name ||
                    text('İlgili belge', 'Related document')}
                </Link>
              </li>
            )}
          </ul>
          {changeHistory()}
          {editable && (
            <button
              className={buttonClass}
              disabled={busy || dirty}
              onClick={async () => {
                if (
                  !window.confirm(
                    text('Görev kalıcı olarak silinsin mi?', 'Permanently delete this task?'),
                  )
                )
                  return;
                setBusy(true);
                setError('');
                try {
                  await api(`/tasks/${task.id}`, { method: 'DELETE' });
                  setDeleted(true);
                  await loadHistory();
                  onChanged();
                } catch (reason) {
                  setError(errorText(reason));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text('Görevi sil', 'Delete task')}
            </button>
          )}
          <h3>{text('Proje yorumları', 'Project comments')}</h3>
          <p>
            {text(
              'Bu yorumlar projenin tüm görevlerinde ortaktır; göreve özel bir yazışma değildir.',
              'These comments are shared by the entire project, not a task-specific thread.',
            )}
          </p>
          <Link to={`/w/${workspace.id}/projects/${task.project_id}/ai/idea`}>
            {text('Proje konuşmasını aç', 'Open project conversation')}
          </Link>
          {workspace.plan === 'pro' && (
            <>
              {comments.length === 0 && (
                <p>{text('Henüz proje yorumu yok.', 'No project comments yet.')}</p>
              )}
              {comments.map((item) => (
                <article key={item.id}>
                  <p className="whitespace-pre-wrap">{item.text}</p>
                  <small>
                    {members.find((member) => member.user_id === item.author_id)?.name ||
                      text('Eski üye', 'Former member')}{' '}
                    · {timestamp(item.created_at)}
                  </small>
                </article>
              ))}
              {editable && (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError('');
                    try {
                      const result = await api<Comment>(`/projects/${task.project_id}/comments`, {
                        method: 'POST',
                        json: { text: comment.trim() },
                      });
                      setComments([...comments, result]);
                      setComment('');
                    } catch (reason) {
                      setError(errorText(reason));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="block">
                    {text('Proje yorumu yaz', 'Write a project comment')}
                    <textarea
                      required
                      maxLength={10000}
                      className={inputClass}
                      value={comment}
                      disabled={busy}
                      onChange={(event) => setComment(event.target.value)}
                    />
                  </label>
                  <button className={buttonClass} disabled={busy || !comment.trim()}>
                    {text('Yorumu gönder', 'Post comment')}
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function TaskScreen({
  workspace,
  projects,
  user,
}: {
  workspace: Workspace;
  projects: Project[];
  user: User;
}) {
  const text = useEvidenceText();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeLoad = useRef<AbortController | null>(null);
  const selected = params.get('task');
  const tab = params.get('tab') || 'mine';
  const project = params.get('project') || '';
  const status = params.get('status') || '';
  const due = params.get('due') || '';
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const query = new URLSearchParams({ limit: '100', offset: String(offset) });
  if (tab === 'mine') query.set('assignee_id', user.id);
  if (project) query.set('project_id', project);
  if (status) query.set('status', status);
  if (due) query.set('due', due);
  const queryString = query.toString();
  const loadTasks = useCallback(async () => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    setLoading(true);
    setError('');
    setTasks([]);
    if (tab === 'project' && !project) {
      setLoading(false);
      return;
    }
    await api<TaskRecord[]>(`/workspaces/${workspace.id}/tasks?${queryString}`, {
      signal: controller.signal,
    })
      .then((records) => {
        if (!controller.signal.aborted) setTasks(records);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [workspace.id, queryString, tab, project]);
  useEffect(() => {
    void loadTasks();
    return () => activeLoad.current?.abort();
  }, [loadTasks]);
  useEffect(() => {
    const controller = new AbortController();
    setMembers([]);
    api<Member[]>(`/workspaces/${workspace.id}/members`, { signal: controller.signal })
      .then((records) => {
        if (!controller.signal.aborted) setMembers(records);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      });
    return () => controller.abort();
  }, [workspace.id]);
  if (!['mine', 'all', 'project'].includes(tab))
    return <p role="alert">{text('Geçersiz görev görünümü.', 'Invalid task view.')}</p>;
  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h1>{text('Görevler', 'Tasks')}</h1>
        <nav className="flex flex-wrap gap-3">
          {[
            ['mine', text('Görevlerim', 'My tasks')],
            ['all', text('Tüm görevler', 'All tasks')],
            ['project', text('Projeye göre', 'By project')],
          ].map(([value, label]) => {
            const next = new URLSearchParams(params);
            next.set('tab', value);
            next.delete('offset');
            return (
              <Link key={value} aria-current={tab === value ? 'page' : undefined} to={`?${next}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        <form
          key={`${workspace.id}:${project}:${status}:${due}`}
          className="flex flex-wrap gap-3 items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const next = new URLSearchParams(params);
            next.delete('offset');
            for (const name of ['project', 'status', 'due']) {
              const value = String(data.get(name) || '');
              if (value) next.set(name, value);
              else next.delete(name);
            }
            setParams(next);
          }}
        >
          <label>
            {text('Proje', 'Project')}
            <select className={inputClass} name="project" defaultValue={project}>
              <option value="">{text('Tüm projeler', 'All projects')}</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('Durum', 'Status')}
            <select className={inputClass} name="status" defaultValue={status}>
              <option value="">{text('Tümü', 'All')}</option>
              <option value="open">{text('Açık', 'Open')}</option>
              <option value="in_progress">{text('Sürüyor', 'In progress')}</option>
              <option value="done">{text('Tamamlandı', 'Done')}</option>
            </select>
          </label>
          <label>
            {text('Son tarih', 'Due date')}
            <select className={inputClass} name="due" defaultValue={due}>
              <option value="">{text('Tümü', 'All')}</option>
              <option value="overdue">{text('Gecikmiş', 'Overdue')}</option>
              <option value="upcoming">{text('Yaklaşan', 'Upcoming')}</option>
              <option value="undated">{text('Tarihsiz', 'Undated')}</option>
            </select>
          </label>
          <button className={buttonClass}>{text('Filtreleri uygula', 'Apply filters')}</button>
        </form>
        {workspace.plan === 'pro' && canEditWorkspace(workspace.role) && (
          <Link className={buttonClass} to={`/w/${workspace.id}/tasks?task=new`}>
            {text('Görev oluştur', 'Create task')}
          </Link>
        )}
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">{text('Yükleniyor…', 'Loading…')}</p>}
        {!loading && !error && tasks.length === 0 && (
          <p>
            {tab === 'project' && !project
              ? text('Bir proje seçin.', 'Choose a project.')
              : text('Bu filtrelerle görev yok.', 'No tasks match these filters.')}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption>
              {text(
                'Son tarihler yerel saat diliminizde gösterilir; düzenleme UTC kullanır.',
                'Due dates are displayed in your local time zone; editing uses UTC.',
              )}
            </caption>
            <thead>
              <tr>
                {[
                  text('Görev', 'Task'),
                  text('Proje', 'Project'),
                  text('Sorumlu', 'Assignee'),
                  text('Durum', 'Status'),
                  text('Son tarih', 'Due date'),
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((item) => {
                const next = new URLSearchParams(params);
                next.set('task', item.id);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`?${next}`}>{item.title}</Link>
                    </td>
                    <td>
                      <Link to={`/w/${workspace.id}/projects/${item.project_id}/overview`}>
                        {item.project_title}
                      </Link>
                    </td>
                    <td>{item.assignee_name || text('Atanmamış', 'Unassigned')}</td>
                    <td>
                      {item.status === 'done'
                        ? text('Tamamlandı', 'Done')
                        : item.status === 'in_progress'
                          ? text('Sürüyor', 'In progress')
                          : text('Açık', 'Open')}
                    </td>
                    <td>{timestamp(item.due_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3">
          {offset > 0 && (
            <button
              className={buttonClass}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('offset', String(Math.max(0, offset - 100)));
                setParams(next);
              }}
            >
              {text('Önceki sayfa', 'Previous page')}
            </button>
          )}
          {tasks.length === 100 && (
            <button
              className={buttonClass}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('offset', String(offset + 100));
                setParams(next);
              }}
            >
              {text('Sonraki sayfa', 'Next page')}
            </button>
          )}
        </div>
      </section>
      {selected && (
        <TaskEditor
          key={`${workspace.id}:${selected}`}
          workspace={workspace}
          projects={projects}
          members={members}
          taskId={selected}
          onChanged={() => void loadTasks()}
        />
      )}
    </div>
  );
}
