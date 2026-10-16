import { useState } from 'react';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { COUNTRIES, type Project, type Workspace } from '../types';

interface Props {
  workspace: Workspace | null;
  projects: Project[];
  onCreated: (project: Project) => Promise<void>;
  onWorkspaceCreated: (workspace: Workspace) => Promise<void>;
}
export default function ProjectScreen({
  workspace,
  projects,
  onCreated,
  onWorkspaceCreated,
}: Props) {
  const { text } = useI18n();
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('TR');
  const [kind, setKind] = useState('personal');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <h1>{text('Projeler ve çalışma alanları', 'Projects and workspaces')}</h1>
      <section className="panel">
        <h2>{text('Yeni proje', 'New project')}</h2>
        <p>
          {text(
            'Şirket bilgileri zorunlu değildir. Her projenin profili ve belgeleri ayrıdır.',
            'Company information is not required. Each project has its own profile and documents.',
          )}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!workspace) return;
            setError('');
            setBusy(true);
            try {
              const value = await api<Project>(`/workspaces/${workspace.id}/projects`, {
                method: 'POST',
                json: { title },
              });
              await onCreated(value);
              setTitle('');
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {text('Proje adı', 'Project name')}
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <button className="primary" disabled={!workspace || busy || workspace.role === 'viewer'}>
            {text('Proje oluştur', 'Create project')}
          </button>
        </form>
        <ul>
          {projects.map((item) => (
            <li key={item.id}>
              {item.title} · {text('Revizyon', 'Revision')} {item.revision}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>{text('Yeni çalışma alanı', 'New workspace')}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setBusy(true);
            try {
              const value = await api<Workspace>('/workspaces', {
                method: 'POST',
                json: { name, kind, country },
              });
              await onWorkspaceCreated(value);
              setName('');
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {text('Ad', 'Name')}
            <input
              required
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {text('Tür', 'Type')}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="personal">{text('Kişisel', 'Personal')}</option>
              <option value="company">{text('Şirket', 'Company')}</option>
            </select>
          </label>
          <label>
            {text('Ülke', 'Country')}
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <button disabled={busy}>{text('Çalışma alanı oluştur', 'Create workspace')}</button>
        </form>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
