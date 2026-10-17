import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { activityDestination, activityLabel } from '../services/activity';
import { api, errorMessage } from '../services/api';
import type { Workspace } from '../types';

interface ActivityRecord {
  id: string;
  project_id?: string | null;
  event_type: string;
  actor_id?: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export default function WorkspaceActivity({ workspace }: { workspace: Workspace }) {
  const { text, language } = useI18n();
  const [records, setRecords] = useState<ActivityRecord[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setRecords(null);
    setError('');
    api<ActivityRecord[]>(`/workspaces/${workspace.id}/activity?limit=100`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setRecords(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [workspace.id]);
  return (
    <section className="panel stack">
      <div>
        <p className="eyebrow">{text('KAYITLI ÇALIŞMALAR', 'A RECORD OF YOUR WORK')}</p>
        <h2>{text('Çalışma alanı geçmişi', 'Workspace activity')}</h2>
      </div>
      <p className="muted">
        {text(
          'Son 100 kayıt. Ayrıntılar yalnızca bu çalışma alanına erişim yetkisi olan kişiler tarafından görülebilir.',
          'The latest 100 events. Details are only available to members with access to this workspace.',
        )}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!records && !error && <p role="status">{text('Geçmiş yükleniyor…', 'Loading activity…')}</p>}
      {records?.length === 0 && (
        <p>{text('Henüz kayıtlı faaliyet yok.', 'No recorded activity yet.')}</p>
      )}
      <ul className="record-list">
        {records?.map((event) => (
          <li key={event.id}>
            <Link to={activityDestination({ ...event, workspace_id: workspace.id })}>
              {activityLabel(event.event_type, language)}
            </Link>
            <time dateTime={event.created_at}>
              {new Date(event.created_at).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-GB')}
            </time>
            <details>
              <summary>{text('Faaliyet ayrıntıları', 'Activity details')}</summary>
              <p>
                {text('Kullanıcı', 'Actor')}:{' '}
                {event.actor_id || text('Sistem / silinmiş kullanıcı', 'System / deleted user')}
              </p>
              <pre>{JSON.stringify(event.detail, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
