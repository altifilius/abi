import { useCallback, useEffect, useRef, useState } from 'react';
import { api, downloadFile } from '../services/api';
import type { Project, Workspace } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

interface Task {
  id: string;
  title: string;
  assignee_id: string | null;
  due_at: string | null;
  status: 'open' | 'in_progress' | 'done';
}
interface Comment {
  id: string;
  author_id: string;
  text: string;
  created_at: string;
}
interface Member {
  user_id: string;
  name: string;
  email?: string;
  role: string;
}
interface Activity {
  id: string;
  event_type: string;
  actor_id: string;
  detail: Record<string, unknown>;
  created_at: string;
}
interface Notification {
  id: string;
  workspace_id: string;
  event_type: string;
  detail: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
interface Preferences {
  email_enabled: boolean;
  task_reminders: boolean;
  deadline_reminders: boolean;
  review_notifications: boolean;
  activity_notifications: boolean;
}
interface ReviewApplication {
  id: string;
  call_id: string;
  revision: number;
  state: string;
  language: string;
  data: Record<string, unknown>;
}
interface MailStatus {
  configured: boolean;
  error: string | null;
  delivery_requires_worker: boolean;
}
interface MailDelivery {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  sent_at: string | null;
}

export default function CollaborationPanel({
  workspace,
  project,
}: {
  workspace: Workspace;
  project: Project;
}) {
  const text = useEvidenceText();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [applications, setApplications] = useState<ReviewApplication[]>([]);
  const [mailStatus, setMailStatus] = useState<MailStatus | null>(null);
  const [deliveries, setDeliveries] = useState<MailDelivery[]>([]);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [comment, setComment] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [languageConfirmed, setLanguageConfirmed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const pro = workspace.plan === 'pro';
  const canEdit = ['owner', 'admin', 'reviewer', 'editor'].includes(workspace.role || '');
  const canReview = ['owner', 'admin', 'reviewer'].includes(workspace.role || '');

  const load = useCallback(() => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    const active = () => !controller.signal.aborted;
    setTasks([]);
    setComments([]);
    setMembers([]);
    setActivity([]);
    setNotifications([]);
    setApplications([]);
    setPreferences(null);
    setMailStatus(null);
    setDeliveries([]);
    setTitle('');
    setAssignee('');
    setDue('');
    setComment('');
    setReviewNotes({});
    setError('');
    setLoading(true);
    setLanguageConfirmed({});
    const loads: Promise<void>[] = [
      api<Activity[]>(`/workspaces/${workspace.id}/activity`).then((data) => {
        if (active()) setActivity(data);
      }),
      api<Notification[]>('/notifications').then((data) => {
        if (active()) setNotifications(data.filter((item) => item.workspace_id === workspace.id));
      }),
      api<Preferences>('/notification-preferences').then((data) => {
        if (active()) setPreferences(data);
      }),
      api<MailStatus>('/mail-status').then((data) => {
        if (active()) setMailStatus(data);
      }),
      api<MailDelivery[]>('/mail-deliveries').then((data) => {
        if (active()) setDeliveries(data);
      }),
    ];
    if (pro)
      loads.push(
        api<Task[]>(`/projects/${project.id}/tasks`).then((data) => {
          if (active()) setTasks(data);
        }),
        api<Comment[]>(`/projects/${project.id}/comments`).then((data) => {
          if (active()) setComments(data);
        }),
        api<Member[]>(`/workspaces/${workspace.id}/members`).then((data) => {
          if (active()) setMembers(data);
        }),
        api<ReviewApplication[]>(`/projects/${project.id}/applications`).then((data) => {
          if (active()) setApplications(data);
        }),
      );
    Promise.allSettled(loads).then((results) => {
      if (!active()) return;
      setError(
        results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => errorText(result.reason))
          .join(' · '),
      );
      setLoading(false);
    });
    return controller;
  }, [workspace.id, project.id, pro]);
  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, [load]);

  async function mutate(path: string, json: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, json });
      load();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function calendar() {
    setBusy(true);
    setError('');
    try {
      await downloadFile(`/workspaces/${workspace.id}/calendar.ics`, 'abi-calendar.ics');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const preferenceLabels: Record<keyof Preferences, string> = {
    email_enabled: text('E-posta gönderimini etkinleştir', 'Enable email delivery'),
    task_reminders: text('Görev hatırlatmaları', 'Task reminders'),
    deadline_reminders: text('Son tarih hatırlatmaları', 'Deadline reminders'),
    review_notifications: text('İnceleme bildirimleri', 'Review notifications'),
    activity_notifications: text('Etkinlik bildirimleri', 'Activity notifications'),
  };
  const statuses = {
    open: text('Açık', 'Open'),
    in_progress: text('Sürüyor', 'In progress'),
    done: text('Tamamlandı', 'Done'),
  };

  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h2 className="text-xl font-semibold">{text('Ekip ve takvim', 'Team and calendar')}</h2>
        <p>
          {text(
            'Görevler, yorumlar ve incelemeler sunucuda saklanır. Takvim gerçek görevleri ve çağrı tarihlerini ICS olarak indirir; tarayıcı bildirimi veya takvim senkronizasyonu yoktur.',
            'Tasks, comments and reviews persist on the server. Calendar downloads real tasks and call dates as ICS; browser push and calendar synchronization are not implemented.',
          )}
        </p>
        {!pro && (
          <p>
            {text(
              'Ekip görevleri, yorumlar ve başvuru incelemeleri Pro gerektirir. Etkinlik geçmişi, ICS ve e-posta tercihleri erişilebilir.',
              'Team tasks, comments and application reviews require Pro. Activity history, ICS and email preferences remain available.',
            )}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button className={buttonClass} disabled={loading || busy} onClick={load}>
            {text('Yenile', 'Refresh')}
          </button>
          <button className={buttonClass} disabled={busy} onClick={calendar}>
            {text('Gerçek takvimi indir (.ics)', 'Download real calendar (.ics)')}
          </button>
        </div>
        {(loading || busy) && (
          <p role="status">{text('İşlem sürüyor…', 'Operation in progress…')}</p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      {pro && (
        <>
          <section className={panelClass}>
            <h3 className="text-lg font-semibold">{text('Görevler', 'Tasks')}</h3>
            {canEdit && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(`/projects/${project.id}/tasks`, {
                    title: title.trim(),
                    assignee_id: assignee || null,
                    due_at: due ? new Date(due).toISOString() : null,
                  });
                }}
              >
                <label>
                  {text('Görev başlığı', 'Task title')}
                  <input
                    className={inputClass}
                    required
                    maxLength={300}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  {text('Atanan üye', 'Assignee')}
                  <select
                    className={inputClass}
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  >
                    <option value="">{text('Atanmamış', 'Unassigned')}</option>
                    {members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text('Son tarih (yerel saat)', 'Due date (local time)')}
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={due}
                    onChange={(event) => setDue(event.target.value)}
                  />
                </label>
                <button className={buttonClass} disabled={busy || !title.trim()}>
                  {text('Görevi kaydet', 'Save task')}
                </button>
              </form>
            )}
            {!loading && !error && tasks.length === 0 && (
              <p>{text('Kayıtlı görev yok.', 'No saved tasks.')}</p>
            )}
            {tasks.map((task) => (
              <article key={task.id} className="border-t border-border-dark pt-3 space-y-2">
                <h4 className="font-semibold">{task.title}</h4>
                <p>
                  {timestamp(task.due_at)} ·{' '}
                  {members.find((member) => member.user_id === task.assignee_id)?.name ||
                    task.assignee_id ||
                    text('Atanmamış', 'Unassigned')}
                </p>
                <label>
                  {text('Durum', 'Status')}
                  <select
                    className={inputClass}
                    disabled={busy || !canEdit}
                    value={task.status}
                    onChange={(event) =>
                      mutate(`/tasks/${task.id}`, { status: event.target.value }, 'PATCH')
                    }
                  >
                    {Object.entries(statuses).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {canEdit && (
                  <>
                    <label>
                      {text('Başlık', 'Title')}
                      <input
                        className={inputClass}
                        defaultValue={task.title}
                        disabled={busy}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value && value !== task.title)
                            void mutate(`/tasks/${task.id}`, { title: value }, 'PATCH');
                        }}
                      />
                    </label>
                    <label>
                      {text('Atanan üye', 'Assignee')}
                      <select
                        className={inputClass}
                        disabled={busy}
                        value={task.assignee_id || ''}
                        onChange={(event) =>
                          mutate(
                            `/tasks/${task.id}`,
                            { assignee_id: event.target.value || null },
                            'PATCH',
                          )
                        }
                      >
                        <option value="">{text('Atanmamış', 'Unassigned')}</option>
                        {members.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {text('Son tarih (yerel saat)', 'Due date (local time)')}
                      <input
                        className={inputClass}
                        type="datetime-local"
                        disabled={busy}
                        defaultValue={
                          task.due_at
                            ? new Date(
                                new Date(task.due_at).getTime() -
                                  new Date(task.due_at).getTimezoneOffset() * 60000,
                              )
                                .toISOString()
                                .slice(0, 16)
                            : ''
                        }
                        onBlur={(event) => {
                          const dueAt = event.target.value
                            ? new Date(event.target.value).toISOString()
                            : null;
                          if (dueAt !== (task.due_at ? new Date(task.due_at).toISOString() : null))
                            void mutate(`/tasks/${task.id}`, { due_at: dueAt }, 'PATCH');
                        }}
                      />
                    </label>
                  </>
                )}
              </article>
            ))}
          </section>
          <section className={panelClass}>
            <h3 className="text-lg font-semibold">{text('Yorumlar', 'Comments')}</h3>
            {!loading && !error && comments.length === 0 && (
              <p>{text('Henüz yorum yok.', 'No comments yet.')}</p>
            )}
            {comments.map((item) => (
              <article key={item.id} className="border-t border-border-dark pt-3">
                <p>
                  {members.find((member) => member.user_id === item.author_id)?.name ||
                    item.author_id}{' '}
                  · {timestamp(item.created_at)}
                </p>
                <p className="whitespace-pre-wrap break-words">{item.text}</p>
              </article>
            ))}
            {canEdit && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(`/projects/${project.id}/comments`, { text: comment.trim() });
                }}
              >
                <label>
                  {text('Yeni yorum', 'New comment')}
                  <textarea
                    className={inputClass}
                    required
                    maxLength={10000}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <button className={buttonClass} disabled={busy || !comment.trim()}>
                  {text('Yorumu kaydet', 'Save comment')}
                </button>
              </form>
            )}
          </section>
          <section className={panelClass}>
            <h3 className="text-lg font-semibold">
              {text('Başvuru inceleme kuyruğu', 'Application review queue')}
            </h3>
            {!loading && !error && applications.length === 0 && (
              <p>{text('Kayıtlı başvuru yok.', 'No saved applications.')}</p>
            )}
            {applications.map((application) => (
              <article className="border-t border-border-dark pt-3 space-y-2" key={application.id}>
                <p>
                  {application.call_id} · v{application.revision} · {application.state}
                </p>
                <p>
                  {text('Başvuru dili', 'Application language')}: {application.language}
                </p>
                <details>
                  <summary>
                    {text('İncelenecek başvuru içeriği', 'Application content to review')}
                  </summary>
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {JSON.stringify(application.data, null, 2)}
                  </pre>
                </details>
                {canEdit && (
                  <button
                    className={buttonClass}
                    disabled={
                      busy ||
                      application.state === 'approved' ||
                      application.state === 'review_requested'
                    }
                    onClick={() =>
                      mutate(`/applications/${application.id}/submit-review`, {
                        expected_revision: application.revision,
                      })
                    }
                  >
                    {text('İncelemeye gönder', 'Submit for review')}
                  </button>
                )}
                {canReview && (
                  <>
                    <label>
                      {text('İnceleme notu', 'Review note')}
                      <textarea
                        className={inputClass}
                        value={reviewNotes[application.id] || ''}
                        onChange={(event) =>
                          setReviewNotes((previous) => ({
                            ...previous,
                            [application.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={languageConfirmed[application.id] === true}
                        onChange={(event) =>
                          setLanguageConfirmed((previous) => ({
                            ...previous,
                            [application.id]: event.target.checked,
                          }))
                        }
                      />
                      {text(
                        'İçeriği inceledim; metin çağrının gerekli başvuru dilinde hazırlanmıştır:',
                        'I reviewed the content; it is written in the call’s required application language:',
                      )}{' '}
                      {application.language}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {[true, false].map((approved) => (
                        <button
                          key={String(approved)}
                          className={buttonClass}
                          disabled={
                            busy ||
                            application.state !== 'review_requested' ||
                            (approved &&
                              (!languageConfirmed[application.id] || !application.language))
                          }
                          onClick={() =>
                            mutate(`/applications/${application.id}/approve`, {
                              expected_revision: application.revision,
                              approved,
                              notes: reviewNotes[application.id] || '',
                              ...(approved ? { confirmed_language: application.language } : {}),
                            })
                          }
                        >
                          {approved
                            ? text('Onayla', 'Approve')
                            : text('Değişiklik iste', 'Request changes')}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      <section className={panelClass}>
        <h3 className="text-lg font-semibold">{text('E-posta tercihleri', 'Email preferences')}</h3>
        <p>
          {text(
            'Tercihler sunucuda saklanır. Teslimat için yapılandırılmış SMTP ve sunucuda çalışan bildirim zamanlayıcısı gerekir; tercih kaydı gönderim yapıldığı anlamına gelmez.',
            'Preferences persist on the server. Delivery requires configured SMTP and a running server notification scheduler; saving a preference does not mean an email was sent.',
          )}
        </p>
        {mailStatus && (
          <p>
            {mailStatus.configured
              ? text(
                  'SMTP yapılandırılmış. Gönderim için çalışan zamanlayıcı gerekir.',
                  'SMTP is configured. Delivery still requires a running scheduler.',
                )
              : text(
                  'Yapılandırma hatası: SMTP ayarlanmamış; e-posta gönderilemez.',
                  'Configuration error: SMTP is not configured; emails cannot be delivered.',
                )}
          </p>
        )}
        {preferences &&
          (Object.keys(preferenceLabels) as (keyof Preferences)[]).map((key) => (
            <label key={key} className="flex gap-2">
              <input
                type="checkbox"
                checked={preferences[key]}
                disabled={busy}
                onChange={(event) =>
                  mutate('/notification-preferences', { [key]: event.target.checked }, 'PATCH')
                }
              />
              {preferenceLabels[key]}
            </label>
          ))}
        <h4 className="font-semibold">
          {text('Sunucu e-posta teslimat geçmişi', 'Server email delivery history')}
        </h4>
        {!loading && !error && deliveries.length === 0 && (
          <p>{text('Kayıtlı e-posta teslimatı yok.', 'No recorded email deliveries.')}</p>
        )}
        {deliveries.map((item) => (
          <article key={item.id} className="border-t border-border-dark pt-2">
            <p>
              {item.kind} · {item.status} · {text('Deneme', 'Attempts')}: {item.attempts}
            </p>
            <p>
              {text('Oluşturuldu', 'Created')}: {timestamp(item.created_at)} ·{' '}
              {text('SMTP kabulü', 'SMTP accepted')}: {timestamp(item.sent_at)}
            </p>
            {item.last_error && <p role="status">{item.last_error}</p>}
            {item.next_attempt_at && (
              <p>
                {text('Sonraki deneme', 'Next attempt')}: {timestamp(item.next_attempt_at)}
              </p>
            )}
          </article>
        ))}
      </section>
      <section className={panelClass}>
        <h3 className="text-lg font-semibold">{text('Bildirimler', 'Notifications')}</h3>
        {!loading && !error && notifications.length === 0 && (
          <p>{text('Kayıtlı bildirim yok.', 'No saved notifications.')}</p>
        )}
        {notifications.map((item) => (
          <article key={item.id} className="border-t border-border-dark pt-3 space-y-2">
            <p>
              {item.event_type} · {timestamp(item.created_at)}
            </p>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {JSON.stringify(item.detail, null, 2)}
            </pre>
            {item.read_at ? (
              <p>
                {text('Okundu', 'Read')}: {timestamp(item.read_at)}
              </p>
            ) : (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => mutate(`/notifications/${item.id}`, { read: true }, 'PATCH')}
              >
                {text('Okundu işaretle', 'Mark read')}
              </button>
            )}
          </article>
        ))}
      </section>
      <section className={panelClass}>
        <h3 className="text-lg font-semibold">
          {text('Gerçek etkinlik geçmişi', 'Actual activity history')}
        </h3>
        {!loading && !error && activity.length === 0 && (
          <p>{text('Kayıtlı etkinlik yok.', 'No recorded activity.')}</p>
        )}
        {activity.map((item) => (
          <article key={item.id} className="border-t border-border-dark pt-3">
            <p>
              {item.event_type} · {item.actor_id} · {timestamp(item.created_at)}
            </p>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {JSON.stringify(item.detail, null, 2)}
            </pre>
          </article>
        ))}
      </section>
    </div>
  );
}
