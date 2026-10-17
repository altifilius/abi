import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, downloadFile } from '../services/api';
import type { Project, Workspace } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  SourceLink,
  useEvidenceText,
} from './EvidenceUi';

interface CalendarEvent {
  id: string;
  kind: 'task' | 'deadline' | 'opening' | 'preregistration';
  title: string;
  start_at: string;
  end_at: string;
  project_id?: string | null;
  call_id?: string | null;
  application_id?: string | null;
  task_id?: string | null;
  source_url?: string | null;
  source_locator?: string | null;
}

export default function CalendarScreen({
  workspace,
  projects,
}: {
  workspace: Workspace;
  projects: Project[];
}) {
  const text = useEvidenceText();
  const { language } = useI18n();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const month = params.get('month') || new Date().toISOString().slice(0, 7);
  const validMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    Number(month.slice(0, 4)) >= 1900 &&
    Number(month.slice(0, 4)) <= 9998;
  const start = new Date(`${validMonth ? month : '2000-01'}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const project = params.get('project') || '';
  const view = params.get('view') || 'month';
  const types = params.get('types') || 'task,deadline,opening,preregistration';
  const mine = params.get('mine') === 'true';
  const query = new URLSearchParams({
    from_at: start.toISOString(),
    to_at: end.toISOString(),
    types,
  });
  if (project) query.set('project_id', project);
  if (mine) query.set('mine', 'true');
  const queryString = query.toString();
  const locale = language === 'tr' ? 'tr-TR' : 'en-GB';
  const utcDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  const kindLabel = {
    task: text('Görev', 'Task'),
    deadline: text('Çağrı son tarihi', 'Call deadline'),
    opening: text('Çağrı açılışı', 'Call opening'),
    preregistration: text('Kuruluş önkayıt son tarihi', 'Company preregistration deadline'),
  };

  useEffect(() => {
    const controller = new AbortController();
    setEvents([]);
    setSelectedIds([]);
    setError('');
    if (!validMonth) return () => controller.abort();
    setLoading(true);
    api<{ events: CalendarEvent[] }>(`/workspaces/${workspace.id}/calendar?${queryString}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setEvents(data.events);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorText(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspace.id, queryString, validMonth]);

  function destination(event: CalendarEvent) {
    const root = `/w/${encodeURIComponent(workspace.id)}`;
    if (event.task_id) return `${root}/tasks?task=${encodeURIComponent(event.task_id)}`;
    if (event.application_id)
      return `${root}/applications/${encodeURIComponent(event.application_id)}/overview`;
    if (event.call_id) return `${root}/funding/calls/${encodeURIComponent(event.call_id)}`;
    if (event.project_id)
      return `${root}/projects/${encodeURIComponent(event.project_id)}/overview`;
    return `${root}/projects`;
  }

  function selectionCheckbox(event: CalendarEvent) {
    return (
      <label className="inline-flex gap-2 items-center">
        <input
          type="checkbox"
          checked={selectedIds.includes(event.id)}
          disabled={!selectedIds.includes(event.id) && selectedIds.length >= 100}
          onChange={(change) => {
            setSelectedIds((current) =>
              change.target.checked
                ? [...current, event.id]
                : current.filter((id) => id !== event.id),
            );
          }}
        />
        <span className="sr-only">
          {text('ICS için seç', 'Select for ICS')}: {event.title}
        </span>
      </label>
    );
  }

  async function downloadCalendar(selected: boolean) {
    setBusy(true);
    setError('');
    try {
      const selection = new URLSearchParams(queryString);
      if (selected) {
        for (const id of selectedIds) selection.append('selected_ids', id);
      }
      await downloadFile(
        `/workspaces/${workspace.id}/calendar.ics?${selection}`,
        `abi-calendar-${month}${selected ? '-selected' : ''}.ics`,
      );
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!validMonth || !['month', 'list'].includes(view))
    return (
      <p role="alert">
        {text('Geçersiz takvim görünümü veya ay.', 'Invalid calendar view or month.')}
      </p>
    );
  const firstWeekday = (start.getUTCDay() + 6) % 7;
  const days = new Date(end.getTime() - 1).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return {
      day: day >= 1 && day <= days ? day : null,
      date: new Date(start.getTime() + (index - firstWeekday) * 86_400_000)
        .toISOString()
        .slice(0, 10),
    };
  });
  return (
    <div className="space-y-5">
      <section className={panelClass}>
        <h1>{text('Takvim', 'Calendar')}</h1>
        <p>
          {text(
            'UTC saat dilimi. Yalnızca kayıtlı görevlerin tarihleri ve bu çalışma alanında değerlendirilen veya başvuru oluşturulan yayımlanmış çağrıların resmî tarihleri gösterilir. Takvim bir randevu sistemi değildir.',
            'Time zone: UTC. Only recorded task dates and official dates of published calls evaluated or applied to in this workspace appear. This is not an appointment system.',
          )}
        </p>
        <p>
          {text(
            'Önkayıt tarihleri hatırlatmadır; daha önce önkayıtlı kuruluşların yeniden önkayıt yapması gerekmez. Bu tarihler otomatik uygunluk kararı değildir.',
            'Preregistration dates are reminders; already-preregistered companies need not preregister again. These dates are not automatic eligibility decisions.',
          )}
        </p>
        <form
          key={`${month}:${project}:${types}:${view}:${mine}`}
          className="flex flex-wrap gap-3 items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = new URLSearchParams(params);
            for (const name of ['month', 'project', 'types', 'view']) {
              const value = String(form.get(name) || '');
              if (value) next.set(name, value);
              else next.delete(name);
            }
            if (form.get('mine')) next.set('mine', 'true');
            else next.delete('mine');
            setParams(next);
          }}
        >
          <label>
            {text('Ay (UTC)', 'Month (UTC)')}
            <input
              className={inputClass}
              type="month"
              name="month"
              min="1900-01"
              max="9998-12"
              defaultValue={month}
              required
            />
          </label>
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
            {text('Kayıt türü', 'Record type')}
            <select className={inputClass} name="types" defaultValue={types}>
              <option value="task,deadline,opening,preregistration">{text('Tümü', 'All')}</option>
              <option value="task">{text('Görevler', 'Tasks')}</option>
              <option value="deadline">{text('Çağrı son tarihleri', 'Call deadlines')}</option>
              <option value="opening">{text('Çağrı açılışları', 'Call openings')}</option>
              <option value="preregistration">
                {text('Önkayıt son tarihleri', 'Preregistration deadlines')}
              </option>
            </select>
          </label>
          <label>
            {text('Görünüm', 'View')}
            <select className={inputClass} name="view" defaultValue={view}>
              <option value="month">{text('Ay', 'Month')}</option>
              <option value="list">{text('Liste', 'List')}</option>
            </select>
          </label>
          <label className="inline-flex gap-2 items-center">
            <input type="checkbox" name="mine" defaultChecked={mine} />
            {text(
              'Bana atanan görevler (çağrı tarihleri görünür)',
              'Mine (call dates remain visible)',
            )}
          </label>
          <button className={buttonClass}>{text('Görünümü uygula', 'Apply view')}</button>
        </form>
        <div className="flex flex-wrap gap-3">
          {[-1, 1].map((delta) => {
            const date = new Date(start);
            date.setUTCMonth(date.getUTCMonth() + delta);
            const next = new URLSearchParams(params);
            next.set('month', date.toISOString().slice(0, 7));
            return (
              <Link key={delta} className={buttonClass} to={`?${next}`}>
                {delta === -1
                  ? text('Önceki ay', 'Previous month')
                  : text('Sonraki ay', 'Next month')}
              </Link>
            );
          })}
          <button
            className={buttonClass}
            disabled={loading || busy || !!error}
            onClick={() => downloadCalendar(false)}
          >
            {text('Bu görünümü ICS indir', 'Download this view as ICS')}
          </button>
          <button
            className={buttonClass}
            disabled={loading || busy || !!error || selectedIds.length === 0}
            onClick={() => downloadCalendar(true)}
          >
            {text('Seçilenleri ICS indir', 'Download selected as ICS')} ({selectedIds.length}/100)
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">{text('Takvim yükleniyor…', 'Loading calendar…')}</p>}
        {!loading && !error && events.length === 0 && (
          <p>
            {text(
              'Bu ay ve filtreler için tarihli kayıt yok.',
              'No dated records match this month and filters.',
            )}
          </p>
        )}
      </section>
      {!loading && !error && (
        <section className={panelClass}>
          {view === 'list' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption>
                  {start.toLocaleDateString(locale, {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}{' '}
                  · UTC
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{text('Seç', 'Select')}</th>
                    <th scope="col">{text('Tarih', 'Date')}</th>
                    <th scope="col">{text('Kayıt', 'Record')}</th>
                    <th scope="col">{text('Tür', 'Type')}</th>
                    <th scope="col">{text('Proje', 'Project')}</th>
                    <th scope="col">{text('Resmî kaynak', 'Official source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>{selectionCheckbox(event)}</td>
                      <td>
                        <time dateTime={event.start_at}>
                          {utcDate.format(new Date(event.start_at))}
                        </time>
                      </td>
                      <td>
                        <Link to={destination(event)}>{event.title}</Link>
                      </td>
                      <td>{kindLabel[event.kind]}</td>
                      <td>{projects.find((item) => item.id === event.project_id)?.title || '—'}</td>
                      <td>
                        <SourceLink url={event.source_url} />
                        {event.source_locator && (
                          <small className="block">{event.source_locator}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse min-w-[600px]">
                <caption>
                  {start.toLocaleDateString(locale, {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}{' '}
                  · UTC
                </caption>
                <thead>
                  <tr>
                    {Array.from({ length: 7 }, (_, index) => (
                      <th key={new Date(Date.UTC(2026, 0, 5 + index)).toISOString()} scope="col">
                        {new Date(Date.UTC(2026, 0, 5 + index)).toLocaleDateString(locale, {
                          weekday: 'short',
                          timeZone: 'UTC',
                        })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: cells.length / 7 }, (_, week) => (
                    <tr key={cells[week * 7].date}>
                      {cells.slice(week * 7, week * 7 + 7).map(({ day, date }) => (
                        <td key={date} className="align-top border border-border-dark p-2 h-28">
                          {day && (
                            <>
                              <time dateTime={`${month}-${String(day).padStart(2, '0')}`}>
                                {day}
                              </time>
                              <ul className="space-y-2">
                                {events
                                  .filter(
                                    (event) =>
                                      event.start_at.slice(0, 10) ===
                                      `${month}-${String(day).padStart(2, '0')}`,
                                  )
                                  .map((event) => (
                                    <li key={event.id}>
                                      {selectionCheckbox(event)}{' '}
                                      <Link
                                        className="underline break-words"
                                        to={destination(event)}
                                      >
                                        {event.title}
                                      </Link>
                                      <small className="block">
                                        {kindLabel[event.kind]} ·{' '}
                                        {new Date(event.start_at).toLocaleTimeString(locale, {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          timeZone: 'UTC',
                                        })}
                                        {' UTC'}
                                      </small>
                                      <SourceLink url={event.source_url}>
                                        {text('Kaynak', 'Source')}
                                      </SourceLink>
                                      {event.source_locator && (
                                        <small className="block">{event.source_locator}</small>
                                      )}
                                    </li>
                                  ))}
                              </ul>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
