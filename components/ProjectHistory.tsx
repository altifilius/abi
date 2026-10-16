import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { Project } from '../types';

interface ProjectRevision {
  revision: number;
  actor_id: string | null;
  created_at: string;
  snapshot: Project;
  current?: boolean;
}
export function compareProjectSnapshots(
  before: unknown,
  after: unknown,
  path = '',
): { field: string; before: unknown; after: unknown }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    return keys.flatMap((key) =>
      compareProjectSnapshots(left[key], right[key], path ? `${path}.${key}` : key),
    );
  }
  return [{ field: path, before, after }];
}
export default function ProjectHistory({ project }: { project: Project }) {
  const { text, language } = useI18n();
  const [params, setParams] = useSearchParams();
  const [revisions, setRevisions] = useState<ProjectRevision[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<ProjectRevision[]>(`/projects/${project.id}/revisions`, { signal: controller.signal })
      .then((rows) => {
        if (!controller.signal.aborted) setRevisions(rows);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id]);
  const before =
    revisions.find((row) => String(row.revision) === params.get('from')) ||
    revisions[Math.max(0, revisions.length - 2)];
  const after =
    revisions.find((row) => String(row.revision) === params.get('to')) ||
    revisions[revisions.length - 1];
  const changes =
    before && after
      ? compareProjectSnapshots(
          {
            title: before.snapshot.title,
            description: before.snapshot.description,
            profile: before.snapshot.profile,
            confirmed_revision: before.snapshot.confirmed_revision,
          },
          {
            title: after.snapshot.title,
            description: after.snapshot.description,
            profile: after.snapshot.profile,
            confirmed_revision: after.snapshot.confirmed_revision,
          },
        )
      : [];
  return (
    <div className="stack">
      <h2>{text('Proje geçmişi', 'Project history')}</h2>
      <p>
        {text(
          'Kayıtlı revizyonları karşılaştırın. Bu görünüm geçmiş kayıtları geri yüklemez veya mevcut verileri değiştirmez.',
          'Compare saved revisions. This view does not restore old records or change current data.',
        )}
      </p>
      {loading && <p role="status">{text('Geçmiş yükleniyor…', 'Loading history…')}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {revisions.length > 0 && (
        <>
          <section className="panel form-grid">
            {(['from', 'to'] as const).map((key) => (
              <label key={key}>
                {key === 'from'
                  ? text('Önceki revizyon', 'Earlier revision')
                  : text('Sonraki revizyon', 'Later revision')}
                <select
                  value={String(key === 'from' ? before?.revision : after?.revision)}
                  onChange={(e) => {
                    const next = new URLSearchParams(params);
                    next.set(key, e.target.value);
                    setParams(next);
                  }}
                >
                  {revisions.map((row) => (
                    <option key={row.revision} value={row.revision}>
                      {text('Revizyon', 'Revision')} {row.revision}
                      {row.current ? ` · ${text('güncel', 'current')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
          <section className="panel">
            <h3>{text('Alan değişiklikleri', 'Field changes')}</h3>
            {changes.length === 0 ? (
              <p>
                {text(
                  'Seçili içerikler arasında fark yok.',
                  'No content differences between these selections.',
                )}
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{text('Alan', 'Field')}</th>
                    <th>{text('Önce', 'Before')}</th>
                    <th>{text('Sonra', 'After')}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.field}>
                      <th>{change.field}</th>
                      <td className="preserve-lines">
                        {change.before === undefined || change.before === null
                          ? text('Bilinmiyor / boş', 'Unknown / empty')
                          : typeof change.before === 'object'
                            ? JSON.stringify(change.before, null, 2)
                            : String(change.before)}
                      </td>
                      <td className="preserve-lines">
                        {change.after === undefined || change.after === null
                          ? text('Bilinmiyor / boş', 'Unknown / empty')
                          : typeof change.after === 'object'
                            ? JSON.stringify(change.after, null, 2)
                            : String(change.after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="panel">
            <h3>{text('Revizyon kayıtları', 'Revision records')}</h3>
            <ul>
              {revisions.map((row) => (
                <li key={row.revision}>
                  {text('Revizyon', 'Revision')} {row.revision} ·{' '}
                  {new Date(row.created_at).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-GB', {
                    timeZone: 'UTC',
                  })}{' '}
                  UTC · {text('İşlemi yapan kullanıcı', 'Actor')}:{' '}
                  {row.actor_id ||
                    text('Güncel kayıt: aktör bilgisi yok', 'Current record: actor not recorded')}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
