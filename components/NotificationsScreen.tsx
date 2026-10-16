import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { activityDestination, activityLabel } from '../services/activity';
import { api } from '../services/api';
import type { User } from '../types';
import {
  buttonClass,
  errorText,
  inputClass,
  panelClass,
  timestamp,
  useEvidenceText,
} from './EvidenceUi';

interface NotificationRecord {
  id: string;
  workspace_id: string;
  project_id: string | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export default function NotificationsScreen({ user }: { user: User }) {
  const text = useEvidenceText();
  const { language } = useI18n();
  const [params, setParams] = useSearchParams();
  const [records, setRecords] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const scope = useRef<{ userId: string; controller: AbortController } | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const unread = params.get('unread') === '1';
  const category = params.get('category') || '';
  const requestedOffset = Number(params.get('offset'));
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const load = useCallback(async () => {
    const active = scope.current;
    if (active?.userId !== user.id || active.controller.signal.aborted) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setError('');
    setRecords([]);
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (unread) query.set('unread', 'true');
    if (category) query.set('category', category);
    try {
      const data = await api<NotificationRecord[]>(`/notifications?${query}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted && !active.controller.signal.aborted) setRecords(data);
    } catch (reason) {
      if (!controller.signal.aborted && !active.controller.signal.aborted)
        setError(errorText(reason));
    } finally {
      if (!controller.signal.aborted && !active.controller.signal.aborted) setLoading(false);
    }
  }, [user.id, unread, category, offset]);

  useEffect(() => {
    const active = { userId: user.id, controller: new AbortController() };
    scope.current = active;
    setBusy(null);
    void load();
    return () => {
      active.controller.abort();
      listRequest.current?.abort();
    };
  }, [user.id, load]);

  const markRead = async (record: NotificationRecord) => {
    const active = scope.current;
    if (busy || active?.userId !== user.id || active.controller.signal.aborted) return;
    const signal = active.controller.signal;
    setBusy(record.id);
    setError('');
    try {
      await api<{ id: string; read_at: string | null }>(
        `/notifications/${encodeURIComponent(record.id)}`,
        { method: 'PATCH', signal, json: { read: !record.read_at } },
      );
      if (!signal.aborted) await load();
    } catch (reason) {
      if (!signal.aborted) setError(errorText(reason));
    } finally {
      if (!signal.aborted) setBusy(null);
    }
  };
  return (
    <section className={panelClass}>
      <h1>{text('Bildirimler', 'Notifications')}</h1>
      <p>
        {text(
          'Hesabınıza ait tüm çalışma alanı bildirimleri. Çalışma alanı veya proje seçmeniz gerekmez; ilgili kaydı açarken erişim yetkiniz yeniden kontrol edilir.',
          'All workspace notifications belonging to your account. No workspace or project selection is required; access is checked again when you open a record.',
        )}
      </p>
      <Link to="/account/preferences">
        {text('E-posta ve bildirim tercihleri', 'Email and notification preferences')}
      </Link>
      <form
        key={`${unread}:${category}`}
        className="flex flex-wrap gap-3 items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams(params);
          next.delete('offset');
          if (data.has('unread')) next.set('unread', '1');
          else next.delete('unread');
          const value = String(data.get('category') || '');
          if (value) next.set('category', value);
          else next.delete('category');
          setParams(next);
        }}
      >
        <label className="flex gap-2">
          <input type="checkbox" name="unread" defaultChecked={unread} />
          {text('Yalnızca okunmamış', 'Unread only')}
        </label>
        <label>
          {text('Kategori', 'Category')}
          <select name="category" className={inputClass} defaultValue={category}>
            <option value="">{text('Tümü', 'All')}</option>
            <option value="task">{text('Görevler', 'Tasks')}</option>
            <option value="deadline">{text('Son tarihler', 'Deadlines')}</option>
            <option value="application">
              {text('Başvurular / inceleme', 'Applications / review')}
            </option>
            <option value="activity">{text('Diğer etkinlikler', 'Other activity')}</option>
          </select>
        </label>
        <button className={buttonClass}>{text('Filtreleri uygula', 'Apply filters')}</button>
      </form>
      <button className={buttonClass} disabled={loading || !!busy} onClick={() => void load()}>
        {text('Yenile', 'Refresh')}
      </button>
      {loading && <p role="status">{text('Bildirimler yükleniyor…', 'Loading notifications…')}</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && records.length === 0 && (
        <p>{text('Bu filtrelerle bildirim yok.', 'No notifications match these filters.')}</p>
      )}
      <ul className="space-y-4">
        {records.map((record) => (
          <li key={record.id} className="border border-border-dark rounded-lg p-3 space-y-2">
            <Link className="underline" to={activityDestination(record)}>
              {activityLabel(record.event_type, language)}
            </Link>
            <p>
              <time dateTime={record.created_at}>{timestamp(record.created_at)}</time> ·{' '}
              {record.read_at ? text('Okundu', 'Read') : text('Okunmadı', 'Unread')}
            </p>
            <button className={buttonClass} disabled={!!busy} onClick={() => void markRead(record)}>
              {record.read_at
                ? text('Okunmadı olarak işaretle', 'Mark unread')
                : text('Okundu olarak işaretle', 'Mark read')}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        {offset > 0 && (
          <button
            className={buttonClass}
            disabled={loading || !!busy}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('offset', String(Math.max(0, offset - 100)));
              setParams(next);
            }}
          >
            {text('Önceki sayfa', 'Previous page')}
          </button>
        )}
        {records.length === 100 && (
          <button
            className={buttonClass}
            disabled={loading || !!busy}
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
  );
}
