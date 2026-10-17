import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useI18n } from '../i18n';
import { api, downloadFile, errorMessage } from '../services/api';
import { COUNTRIES, type Usage, type Workspace } from '../types';

const IncorporationGuide = lazy(() => import('./IncorporationGuide'));
const TeamManagement = lazy(() => import('./TeamManagement'));
const WorkspaceActivity = lazy(() => import('./WorkspaceActivity'));

interface WorkspaceProps {
  workspace: Workspace;
  section: string;
  onChanged: () => Promise<void>;
  usage: Usage | null;
  onUsage: () => Promise<void>;
}

export function WorkspaceCreation({ onChanged }: { onChanged: () => Promise<void> }) {
  const { text } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('TR');
  const [kind, setKind] = useState<'personal' | 'company'>('personal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Workspace | null>(null);
  const [ready, setReady] = useState(false);
  useUnsavedChanges(!created && (Boolean(name) || country !== 'TR' || kind !== 'personal'), () => {
    setName('');
    setCountry('TR');
    setKind('personal');
  });
  useEffect(() => {
    if (created && ready) navigate(`/w/${created.id}/workspace/info`);
  }, [created, ready, navigate]);
  return (
    <form
      className="panel stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          const workspace =
            created ||
            (await api<Workspace>('/workspaces', {
              method: 'POST',
              json: { name, kind, country },
            }));
          setCreated(workspace);
          setName('');
          setCountry('TR');
          setKind('personal');
          await onChanged();
          setReady(true);
        } catch (reason) {
          setError(errorMessage(reason));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1>{text('Yeni çalışma alanı oluştur', 'Create a workspace')}</h1>
      <p>
        {text(
          'Kişisel Free alan için şirket gerekmez. Yeni çalışma alanı Free olarak oluşturulur; bu bir ücretli yükseltme değildir.',
          'A personal Free workspace does not require a company. New workspaces start on Free; this is not a paid upgrade.',
        )}
      </p>
      {!created && (
        <>
          <label>
            {text('Ad', 'Name')}
            <input
              required
              maxLength={200}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {text('Tür', 'Type')}
            <select
              value={kind}
              disabled={busy}
              onChange={(event) => setKind(event.target.value as 'personal' | 'company')}
            >
              <option value="personal">{text('Kişisel', 'Personal')}</option>
              <option value="company">{text('Şirket', 'Company')}</option>
            </select>
          </label>
          <label>
            {text('Ülke', 'Country')}
            <select
              value={country}
              disabled={busy}
              onChange={(event) => setCountry(event.target.value)}
            >
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {created && (
        <p role="status">
          {text(
            'Çalışma alanı oluşturuldu. Oturum listesini yenileyerek açın.',
            'Workspace created. Refresh the session list to open it.',
          )}
        </p>
      )}
      <button disabled={busy}>
        {created
          ? text('Oturum listesini yenile ve aç', 'Refresh session list and open')
          : text('Free çalışma alanı oluştur', 'Create Free workspace')}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

function WorkspaceInfo({ workspace, onChanged }: Pick<WorkspaceProps, 'workspace' | 'onChanged'>) {
  const { text } = useI18n();
  const editable = workspace.role === 'owner' || workspace.role === 'admin';
  const [name, setName] = useState(workspace.name);
  const [country, setCountry] = useState(workspace.country);
  const [saved, setSaved] = useState({ name: workspace.name, country: workspace.country });
  const lastServer = useRef({ name: workspace.name, country: workspace.country });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dirty = name !== saved.name || country !== saved.country;
  useUnsavedChanges(dirty, () => {
    setName(workspace.name);
    setCountry(workspace.country);
    setSaved({ name: workspace.name, country: workspace.country });
  });
  useEffect(() => {
    if (
      lastServer.current.name === workspace.name &&
      lastServer.current.country === workspace.country
    )
      return;
    lastServer.current = { name: workspace.name, country: workspace.country };
    if (name === saved.name && country === saved.country) {
      setName(workspace.name);
      setCountry(workspace.country);
      setSaved({ name: workspace.name, country: workspace.country });
    }
  }, [workspace.name, workspace.country, name, country, saved]);
  return (
    <div className="stack">
      <form
        className="panel"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!editable) return;
          setBusy(true);
          setError('');
          setStatus('');
          try {
            const updated = await api<Workspace>(`/workspaces/${workspace.id}`, {
              method: 'PATCH',
              json: { name, country },
            });
            setName(updated.name);
            setCountry(updated.country);
            setSaved({ name: updated.name, country: updated.country });
            await onChanged();
            setStatus(text('Çalışma alanı kaydedildi.', 'Workspace saved.'));
          } catch (reason) {
            setError(errorMessage(reason));
            await onChanged().catch(() => undefined);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{text('Çalışma alanı bilgileri', 'Workspace information')}</h2>
        <p>
          {text('Tür', 'Type')}:{' '}
          {workspace.kind === 'personal' ? text('Kişisel', 'Personal') : text('Şirket', 'Company')}{' '}
          · {text('Rolünüz', 'Your role')}: {workspace.role} ·{' '}
          {workspace.plan === 'pro' ? 'Pro' : 'Free'}
        </p>
        {!editable && (
          <p>
            {text(
              'Salt okunur. Bu ayarları yalnızca sahip veya yönetici değiştirebilir.',
              'Read-only. Only an owner or admin can change these settings.',
            )}
          </p>
        )}
        <label>
          {text('Çalışma alanı adı', 'Workspace name')}
          <input
            required
            maxLength={200}
            value={name}
            disabled={busy || !editable}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {text('Ülke', 'Country')}
          <select
            value={country}
            disabled={busy || !editable}
            onChange={(event) => setCountry(event.target.value)}
          >
            {COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        {dirty && (workspace.name !== saved.name || workspace.country !== saved.country) && (
          <p role="alert">
            {text(
              'Sunucu ayarları değişti. Girdiniz korundu; kaydetmek güncel değerleri değiştirecektir.',
              'Server settings changed. Your input was preserved; saving will replace current values.',
            )}
          </p>
        )}
        {editable && (
          <button disabled={busy || !dirty}>{text('Bilgileri kaydet', 'Save information')}</button>
        )}
      </form>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <NavLink to="/workspaces/new">
        {text('Yeni çalışma alanı oluştur', 'Create a workspace')}
      </NavLink>
    </div>
  );
}

interface PolicyConfiguration {
  configured: boolean;
  operations: { chat: boolean; documents: boolean; translation: boolean; embeddings: boolean };
}
function Policy({ workspace, onChanged }: Pick<WorkspaceProps, 'workspace' | 'onChanged'>) {
  const { text } = useI18n();
  const editable = workspace.role === 'owner' || workspace.role === 'admin';
  const [policy, setPolicy] = useState(workspace.ai_policy);
  const [saved, setSaved] = useState(workspace.ai_policy);
  const lastServerPolicy = useRef(workspace.ai_policy);
  const [configuration, setConfiguration] = useState<Record<
    'local' | 'external',
    PolicyConfiguration
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useUnsavedChanges(policy !== saved, () => {
    setPolicy(workspace.ai_policy);
    setSaved(workspace.ai_policy);
  });
  useEffect(() => {
    if (lastServerPolicy.current === workspace.ai_policy) return;
    lastServerPolicy.current = workspace.ai_policy;
    if (policy === saved) {
      setPolicy(workspace.ai_policy);
      setSaved(workspace.ai_policy);
    }
  }, [workspace.ai_policy, policy, saved]);
  useEffect(() => {
    const controller = new AbortController();
    api<Record<'local' | 'external', PolicyConfiguration>>(
      `/workspaces/${workspace.id}/ai-configuration`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setConfiguration(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [workspace.id]);
  return (
    <form
      className="panel stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!editable || !configuration?.[policy].configured) return;
        setBusy(true);
        setError('');
        setStatus('');
        try {
          const updated = await api<Workspace>(`/workspaces/${workspace.id}`, {
            method: 'PATCH',
            json: { ai_policy: policy },
          });
          setPolicy(updated.ai_policy);
          setSaved(updated.ai_policy);
          await onChanged();
          setStatus(text('AI politikası kaydedildi.', 'AI policy saved.'));
        } catch (reason) {
          setError(errorMessage(reason));
          await onChanged().catch(() => undefined);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{text('AI veri politikası', 'AI data policy')}</h2>
      <p>
        {text(
          'Sohbet, belge inceleme, çeviri ve embedding işlemleri seçili politikayı kullanır. Harici politika verilerin yapılandırılmış sağlayıcıya gönderilmesine izin verir. Sessiz sağlayıcı değişimi yoktur.',
          'Chat, document analysis, translation and embedding operations use the selected policy. External policy permits sending data to the configured provider. There is no silent provider fallback.',
        )}
      </p>
      <p>
        {text(
          'Yapılandırılmış olması sağlayıcının sağlıklı veya kimlik bilgilerinin geçerli olduğunu kanıtlamaz. Eksik yapılandırma ve sağlayıcı hataları işlem sırasında açıkça bildirilir.',
          'Configured does not prove that a provider is healthy or its credentials are valid. Missing configuration and provider errors are reported explicitly during operations.',
        )}
      </p>
      {!editable && (
        <p>
          {text(
            'Salt okunur; yalnızca sahip veya yönetici değiştirebilir.',
            'Read-only; only an owner or admin can change this policy.',
          )}
        </p>
      )}
      <label>
        {text('Politika', 'Policy')}
        <select
          value={policy}
          disabled={busy || !editable || !configuration}
          onChange={(event) => setPolicy(event.target.value as 'local' | 'external')}
        >
          <option value="local" disabled={!configuration?.local.configured}>
            {text('Yerel / kendi sunucunuz', 'Local / self-hosted')}
          </option>
          <option value="external" disabled={!configuration?.external.configured}>
            {text('Harici sağlayıcı', 'External provider')}
          </option>
        </select>
      </label>
      {configuration &&
        (['local', 'external'] as const).map((key) => (
          <section key={key}>
            <h3>
              {key === 'local' ? text('Yerel', 'Local') : text('Harici', 'External')}:{' '}
              {configuration[key].configured
                ? text('Yapılandırılmış', 'Configured')
                : text('Yapılandırılmamış', 'Not configured')}
            </h3>
            <ul>
              {(
                [
                  ['chat', 'Sohbet', 'Chat'],
                  ['documents', 'Belge inceleme', 'Document analysis'],
                  ['translation', 'Çeviri', 'Translation'],
                  ['embeddings', 'Embedding', 'Embeddings'],
                ] as const
              ).map(([operation, tr, en]) => (
                <li key={operation}>
                  {text(tr, en)}:{' '}
                  {configuration[key].operations[operation]
                    ? text('Yapılandırılmış', 'Configured')
                    : text('Kullanılamaz', 'Unavailable')}
                </li>
              ))}
            </ul>
          </section>
        ))}
      {policy !== saved && workspace.ai_policy !== saved && (
        <p role="alert">
          {text(
            'Politika başka bir oturumda değişti; seçiminiz korundu.',
            'Policy changed in another session; your selection was preserved.',
          )}
        </p>
      )}
      {editable && (
        <button disabled={busy || policy === saved || !configuration?.[policy].configured}>
          {text('Politikayı kaydet', 'Save policy')}
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

function WorkspaceUsage({ usage, onUsage }: Pick<WorkspaceProps, 'usage' | 'onUsage'>) {
  const { text } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel stack">
      <h2>{text('Kullanım ve kota', 'Usage and allowance')}</h2>
      <p>
        {text(
          'Free: kullanıcı başına tüm çalışma alanları arasında ortak 100 başarılı sohbet + 10 yazım / UTC ay. Pro: çalışma alanı üyelerine ortak 500 sohbet + 50 yazım / UTC ay. Başarısız işlemler kota tüketmez; devam eden işlemler rezervasyon yapar.',
          'Free: 100 successful chats + 10 writing operations shared across the user’s workspaces per UTC month. Pro: 500 chats + 50 writing operations shared by workspace members per UTC month. Failed operations do not consume allowance; ongoing operations reserve it.',
        )}
      </p>
      <p>
        {text(
          'Fiyatlandırma, ödeme ve ücretli ek kredi satışı etkin değildir. Otomatik kota aşımı yoktur.',
          'Pricing, payments and paid extra-credit sales are not active. There is no automatic overage.',
        )}
      </p>
      {usage ? (
        <>
          <p>
            {usage.plan === 'pro' ? 'Pro' : 'Free'} · {text('UTC ayı', 'UTC month')}: {usage.month}{' '}
            ·{' '}
            {usage.scope === 'user'
              ? text('Kullanıcıya ortak', 'Shared by user')
              : text('Çalışma alanına ortak', 'Shared by workspace')}
          </p>
          {(['chat', 'write'] as const).map((category) => (
            <article key={category} className="panel">
              <h3>{category === 'chat' ? text('Sohbet', 'Chat') : text('Yazım', 'Writing')}</h3>
              <dl>
                <dt>{text('Aylık temel kota', 'Base monthly allowance')}</dt>
                <dd>{usage[category].base_limit}</dd>
                <dt>{text('Toplam kullanılabilir kota', 'Total allowance')}</dt>
                <dd>{usage[category].limit}</dd>
                <dt>{text('Başarılı kullanım', 'Successful usage')}</dt>
                <dd>{usage[category].used}</dd>
                <dt>{text('Rezerve', 'Reserved')}</dt>
                <dd>{usage[category].reserved}</dd>
                <dt>{text('Kalan', 'Remaining')}</dt>
                <dd>{usage[category].remaining}</dd>
              </dl>
            </article>
          ))}
        </>
      ) : (
        <p role="status">{text('Kullanım bilgisi yükleniyor…', 'Loading usage…')}</p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await onUsage();
          } catch (reason) {
            setError(errorMessage(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        {text('Kullanımı yenile', 'Refresh usage')}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

function WorkspacePrivacy({
  workspace,
  onChanged,
}: Pick<WorkspaceProps, 'workspace' | 'onChanged'>) {
  const { text } = useI18n();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owner = workspace.role === 'owner';
  return (
    <section className="panel stack">
      <h2>{text('Çalışma alanı gizliliği', 'Workspace privacy')}</h2>
      <p>
        {text(
          'Dışa aktarma ve silme yalnızca çalışma alanı sahibine açıktır. Silme bu alanın projelerini, başvurularını ve özel dosyalarını kalıcı olarak kaldırır; diğer çalışma alanlarının ve üyelerin ilgisiz özel verileri korunur.',
          'Export and deletion are restricted to workspace owners. Deletion permanently removes this workspace’s projects, applications and private files; unrelated private data of other workspaces and members are preserved.',
        )}
      </p>
      {owner ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await downloadFile(
                  `/workspaces/${workspace.id}/export`,
                  `workspace-${workspace.id}.json`,
                );
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setBusy(false);
              }
            }}
          >
            {text('Çalışma alanını dışa aktar (JSON)', 'Export workspace (JSON)')}
          </button>
          <p>
            {text(
              'JSON arşivi belge metadata içerir; özgün dosyaları Belgeler bölümünden ayrıca indirin. Silmeden önce yedeğinizi kontrol edin. Kişisel hesap silme ayrı Hesabım / Gizlilik bölümündedir.',
              'The JSON archive includes document metadata; download original files separately from Documents. Check your backup before deletion. Personal account deletion is separate under My account / Privacy.',
            )}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (confirmation !== 'DELETE') return;
              if (
                !window.confirm(
                  text(
                    `“${workspace.name}” kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`,
                    `Permanently delete “${workspace.name}”? This cannot be undone.`,
                  ),
                )
              )
                return;
              setBusy(true);
              setError('');
              try {
                await api(`/workspaces/${workspace.id}`, { method: 'DELETE' });
                setConfirmation('');
                await onChanged();
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {text('Onaylamak için DELETE yazın', 'Type DELETE to confirm')}
              <input
                required
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button disabled={busy || confirmation !== 'DELETE'}>
              {text('Bu çalışma alanını kalıcı sil', 'Permanently delete this workspace')}
            </button>
          </form>
        </>
      ) : (
        <p>
          {text(
            'Salt okunur. Dışa aktarma veya silme için bir çalışma alanı sahibine başvurun.',
            'Read-only. Contact a workspace owner to export or delete this workspace.',
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export default function WorkspaceScreen({
  workspace,
  section,
  onChanged,
  usage,
  onUsage,
}: WorkspaceProps) {
  const { text } = useI18n();
  return (
    <div className="stack">
      <h1>
        {text('Çalışma alanı yönetimi', 'Workspace management')}: {workspace.name}
      </h1>
      <nav className="actions" aria-label={text('Çalışma alanı bölümleri', 'Workspace sections')}>
        {[
          ['info', 'Bilgiler', 'Information'],
          ['team', 'Ekip', 'Team'],
          ['ai', 'AI politikası', 'AI policy'],
          ['usage', 'Kullanım', 'Usage'],
          ['privacy', 'Gizlilik', 'Privacy'],
          ['activity', 'Geçmiş', 'Activity'],
          ...(workspace.country === 'TR'
            ? [['incorporation', 'Türkiye kuruluş rehberi', 'Türkiye incorporation']]
            : []),
        ].map(([key, tr, en]) => (
          <NavLink key={key} to={`/w/${workspace.id}/workspace/${key}`}>
            {text(tr, en)}
          </NavLink>
        ))}
      </nav>
      <Suspense
        key={section}
        fallback={
          <p role="status">
            {text('Çalışma alanı bölümü yükleniyor…', 'Loading workspace section…')}
          </p>
        }
      >
        {section === 'info' ? (
          <WorkspaceInfo key={workspace.id} workspace={workspace} onChanged={onChanged} />
        ) : section === 'team' ? (
          <TeamManagement key={workspace.id} workspace={workspace} onChanged={onChanged} />
        ) : section === 'ai' ? (
          <Policy key={workspace.id} workspace={workspace} onChanged={onChanged} />
        ) : section === 'usage' ? (
          <WorkspaceUsage key={workspace.id} usage={usage} onUsage={onUsage} />
        ) : section === 'privacy' ? (
          <WorkspacePrivacy key={workspace.id} workspace={workspace} onChanged={onChanged} />
        ) : section === 'activity' ? (
          <WorkspaceActivity key={workspace.id} workspace={workspace} />
        ) : section === 'incorporation' && workspace.country === 'TR' ? (
          <IncorporationGuide key={workspace.id} workspace={workspace} />
        ) : (
          <p role="alert">
            {text('Çalışma alanı bölümü bulunamadı.', 'Workspace section not found.')}
          </p>
        )}
      </Suspense>
    </div>
  );
}
