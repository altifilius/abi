import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';

interface LoginSession {
  id: string;
  expires_at: string;
  current: boolean;
}

export default function SessionList({ onLogout }: { onLogout: () => void }) {
  const { text } = useI18n();
  const [sessions, setSessions] = useState<LoginSession[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const loadSessions = useCallback(async () => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    await api<LoginSession[]>('/auth/sessions', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setSessions(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
  }, []);
  useEffect(() => {
    void loadSessions();
    return () => activeLoad.current?.abort();
  }, [loadSessions]);
  async function revoke(ids: string[]) {
    setBusy(true);
    setError('');
    try {
      for (const id of ids) {
        await api(`/auth/sessions/${id}`, { method: 'DELETE' });
        setSessions((current) => current?.filter((session) => session.id !== id) || null);
        if (sessions?.find((session) => session.id === id)?.current) {
          onLogout();
          return;
        }
      }
      await loadSessions();
    } catch (reason) {
      setError(errorMessage(reason));
      await loadSessions();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <h2>{text('Açık oturumlar', 'Active sessions')}</h2>
      <p>
        {text(
          'Oturumların son kullanma zamanları UTC olarak gösterilir. Cihaz ve konum verisi toplanmaz.',
          'Session expiry times are shown in UTC. Device and location data are not collected.',
        )}
      </p>
      {sessions === null && !error && <p role="status">{text('Yükleniyor…', 'Loading…')}</p>}
      {sessions?.map((session) => (
        <article key={session.id} className="panel">
          <p>
            {session.current
              ? text('Bu oturum', 'This session')
              : text('Diğer oturum', 'Other session')}{' '}
            ·{' '}
            <time dateTime={session.expires_at}>{new Date(session.expires_at).toISOString()}</time>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  session.current
                    ? text('Bu oturum kapatılsın mı?', 'Sign out this session?')
                    : text('Bu oturum iptal edilsin mi?', 'Revoke this session?'),
                )
              )
                void revoke([session.id]);
            }}
          >
            {session.current
              ? text('Bu oturumu kapat', 'Sign out this session')
              : text('Oturumu iptal et', 'Revoke session')}
          </button>
        </article>
      ))}
      <button
        type="button"
        disabled={busy || !sessions?.some((session) => !session.current)}
        onClick={() => {
          if (
            window.confirm(
              text('Diğer tüm oturumlar iptal edilsin mi?', 'Revoke all other sessions?'),
            )
          )
            void revoke(
              sessions?.filter((session) => !session.current).map((session) => session.id) || [],
            );
        }}
      >
        {text('Diğer tüm oturumları iptal et', 'Revoke all other sessions')}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
