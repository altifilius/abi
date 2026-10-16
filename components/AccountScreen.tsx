import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { loadPreferences, savePreferences } from '../services/persistence';
import type { User, Workspace } from '../types';
import SessionList from './SessionList';

interface AccountProps {
  user: User;
  section: string;
  onSessionChanged: () => Promise<void>;
  onLogout: () => void;
}

function Identity({ user, onSessionChanged }: Pick<AccountProps, 'user' | 'onSessionChanged'>) {
  const { text } = useI18n();
  const [name, setName] = useState(user.name);
  const [savedName, setSavedName] = useState(user.name);
  const lastServerName = useRef(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dirty = name !== savedName;
  useUnsavedChanges(dirty, () => {
    setName(user.name);
    setSavedName(user.name);
  });
  useEffect(() => {
    if (lastServerName.current === user.name) return;
    lastServerName.current = user.name;
    if (name === savedName) {
      setName(user.name);
      setSavedName(user.name);
    }
  }, [user.name, name, savedName]);
  return (
    <section className="panel stack">
      <h2>{text('Kimlik', 'Identity')}</h2>
      <p>{user.email}</p>
      <p>
        {user.email_verified_at
          ? text('E-posta doğrulandı', 'Email verified')
          : text('E-posta henüz doğrulanmadı', 'Email not yet verified')}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          setStatus('');
          try {
            const updated = await api<User>('/auth/profile', { method: 'PATCH', json: { name } });
            setSavedName(updated.name);
            setName(updated.name);
            await onSessionChanged();
            setStatus(text('Adınız kaydedildi.', 'Your name was saved.'));
          } catch (reason) {
            setError(errorMessage(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {text('Adınız', 'Your name')}
          <input
            required
            maxLength={200}
            autoComplete="name"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {dirty && user.name !== savedName && (
          <p role="alert">
            {text(
              'Adınız başka bir oturumda değişti. Girdiniz korundu; kaydetmek sunucudaki adı değiştirecektir.',
              'Your name changed in another session. Your input was preserved; saving will replace the server name.',
            )}
          </p>
        )}
        <button disabled={busy || !dirty}>{text('Adı kaydet', 'Save name')}</button>
      </form>
      {!user.email_verified_at && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setStatus('');
            try {
              await api('/auth/request-verification', { method: 'POST' });
              setStatus(
                text(
                  'Doğrulama e-postası kuyruğa alındı. Gelen bağlantıyı açın.',
                  'Verification email queued. Open the delivered link.',
                ),
              );
            } catch (reason) {
              setError(errorMessage(reason));
            } finally {
              setBusy(false);
            }
          }}
        >
          {text('Doğrulama e-postasını yeniden gönder', 'Resend verification email')}
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

function Security({ onLogout }: Pick<AccountProps, 'onLogout'>) {
  const { text } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="stack">
      <form
        className="panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          if (newPassword !== repeat) {
            setError(text('Parolalar eşleşmiyor.', 'Passwords do not match.'));
            return;
          }
          setBusy(true);
          try {
            await api('/auth/change-password', {
              method: 'POST',
              json: { current_password: currentPassword, new_password: newPassword },
            });
            setCurrentPassword('');
            setNewPassword('');
            setRepeat('');
            onLogout();
          } catch (reason) {
            setError(errorMessage(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{text('Parola değiştir', 'Change password')}</h2>
        <p>
          {text(
            'Parola değişikliği tüm oturumları kapatır. Yeni parolanızla tekrar giriş yapın.',
            'Changing your password signs out all sessions. Sign in again with your new password.',
          )}
        </p>
        <label>
          {text('Mevcut parola', 'Current password')}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          {text('Yeni parola (en az 12 karakter)', 'New password (at least 12 characters)')}
          <input
            type="password"
            required
            minLength={12}
            maxLength={1024}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label>
          {text('Yeni parolayı tekrar girin', 'Repeat new password')}
          <input
            type="password"
            required
            minLength={12}
            maxLength={1024}
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </label>
        <button disabled={busy}>
          {text('Parolayı değiştir ve oturumları kapat', 'Change password and sign out')}
        </button>
        <Link to="/auth/forgot-password">
          {text('Mevcut parolamı unuttum', 'I forgot my current password')}
        </Link>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
      <SessionList onLogout={onLogout} />
    </div>
  );
}

interface EmailPreferences {
  email_enabled: boolean;
  task_reminders: boolean;
  deadline_reminders: boolean;
  review_notifications: boolean;
  activity_notifications: boolean;
}

function Preferences() {
  const { text, language, setLanguage } = useI18n();
  const [theme, setTheme] = useState(loadPreferences().theme || 'light');
  const [email, setEmail] = useState<EmailPreferences | null>(null);
  const [saved, setSaved] = useState<EmailPreferences | null>(null);
  const [mail, setMail] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useUnsavedChanges(JSON.stringify(email) !== JSON.stringify(saved), () => setEmail(saved));
  useEffect(() => {
    const controller = new AbortController();
    api<EmailPreferences>('/notification-preferences', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setEmail(value);
          setSaved(value);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    api<{ configured: boolean }>('/mail-status', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setMail(value.configured);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="stack">
      <section className="panel">
        <h2>{text('Bu tarayıcı', 'This browser')}</h2>
        <p>
          {text(
            'Dil ve tema bu tarayıcıda saklanır ve hemen uygulanır. E-posta tercihleri hesabınıza kaydedilir.',
            'Language and theme are stored in this browser and apply immediately. Email preferences are saved to your account.',
          )}
        </p>
        <label>
          {text('Dil', 'Language')}
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'tr' | 'en')}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {text('Tema', 'Theme')}
          <select
            value={theme}
            onChange={(event) => {
              const next = event.target.value as 'light' | 'dark';
              setTheme(next);
              document.documentElement.dataset.theme = next;
              savePreferences({ theme: next });
            }}
          >
            <option value="light">{text('Açık', 'Light')}</option>
            <option value="dark">{text('Koyu', 'Dark')}</option>
          </select>
        </label>
      </section>
      <section className="panel">
        <h2>{text('E-posta bildirimleri', 'Email notifications')}</h2>
        <p>
          {mail === null
            ? text('Posta durumu yükleniyor…', 'Loading mail status…')
            : mail
              ? text(
                  'SMTP yapılandırılmış; teslimat posta işçisi tarafından yapılır.',
                  'SMTP is configured; delivery is performed by the mail worker.',
                )
              : text(
                  'SMTP yapılandırılmamış; e-posta teslimatı kullanılamaz.',
                  'SMTP is not configured; email delivery is unavailable.',
                )}
        </p>
        {email && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              setStatus('');
              try {
                const updated = await api<EmailPreferences>('/notification-preferences', {
                  method: 'PATCH',
                  json: email,
                });
                setEmail(updated);
                setSaved(updated);
                setStatus(text('Tercihler kaydedildi.', 'Preferences saved.'));
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setBusy(false);
              }
            }}
          >
            {(
              [
                ['email_enabled', 'E-posta açık', 'Enable email'],
                ['task_reminders', 'Görev hatırlatmaları', 'Task reminders'],
                ['deadline_reminders', 'Son tarih hatırlatmaları', 'Deadline reminders'],
                ['review_notifications', 'İnceleme bildirimleri', 'Review notifications'],
                ['activity_notifications', 'Etkinlik bildirimleri', 'Activity notifications'],
              ] as const
            ).map(([key, tr, en]) => (
              <label className="check-label" key={key}>
                <input
                  type="checkbox"
                  checked={email[key]}
                  disabled={busy}
                  onChange={(event) => setEmail({ ...email, [key]: event.target.checked })}
                />
                {text(tr, en)}
              </label>
            ))}
            <button disabled={busy || JSON.stringify(email) === JSON.stringify(saved)}>
              {text('E-posta tercihlerini kaydet', 'Save email preferences')}
            </button>
          </form>
        )}
        <p>
          {text(
            'Tarayıcı push bildirimi veya otomatik takvim senkronizasyonu yoktur.',
            'There are no browser push notifications or automatic calendar synchronization.',
          )}
        </p>
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function Privacy({ onLogout }: Pick<AccountProps, 'onLogout'>) {
  const { text } = useI18n();
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Workspace[]>('/workspaces', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setWorkspaces(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel stack">
      <h2>{text('Hesap gizliliği', 'Account privacy')}</h2>
      <p>
        {text(
          'Hesap silme geri alınamaz. Son sahibi olduğunuz çalışma alanını önce dışa aktarın ve silin veya başka bir sahip atayın. Diğer üyelerin ve ilgisiz çalışma alanlarının özel verileri silinmez.',
          'Account deletion is irreversible. First export and delete any workspace where you are the last owner, or appoint another owner. Other members’ and unrelated workspaces’ private data are not deleted.',
        )}
      </p>
      {workspaces?.some((workspace) => workspace.role === 'owner') && (
        <div>
          <h3>{text('Sahibi olduğunuz çalışma alanları', 'Workspaces you own')}</h3>
          <ul>
            {workspaces
              .filter((workspace) => workspace.role === 'owner')
              .map((workspace) => (
                <li key={workspace.id}>
                  {workspace.name} ·{' '}
                  <Link to={`/w/${workspace.id}/workspace/team`}>
                    {text('Sahipliği yönet', 'Manage ownership')}
                  </Link>{' '}
                  ·{' '}
                  <Link to={`/w/${workspace.id}/workspace/privacy`}>
                    {text('Dışa aktar / sil', 'Export / delete')}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/auth/account', { method: 'DELETE', json: { password, confirmation } });
            setPassword('');
            onLogout();
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
        <label>
          {text('Mevcut parola', 'Current password')}
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={busy || confirmation !== 'DELETE' || !password}>
          {text('Hesabımı kalıcı sil', 'Permanently delete my account')}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export default function AccountScreen({ user, section, onSessionChanged, onLogout }: AccountProps) {
  const { text } = useI18n();
  return (
    <div className="stack">
      <h1>{text('Hesabım', 'My account')}</h1>
      <nav className="actions" aria-label={text('Hesap bölümleri', 'Account sections')}>
        {(
          [
            ['identity', 'Kimlik', 'Identity'],
            ['security', 'Güvenlik', 'Security'],
            ['preferences', 'Tercihler', 'Preferences'],
            ['privacy', 'Gizlilik', 'Privacy'],
          ] as const
        ).map(([key, tr, en]) => (
          <NavLink key={key} to={`/account/${key}`}>
            {text(tr, en)}
          </NavLink>
        ))}
      </nav>
      {section === 'identity' ? (
        <Identity key={user.id} user={user} onSessionChanged={onSessionChanged} />
      ) : section === 'security' ? (
        <Security key={user.id} onLogout={onLogout} />
      ) : section === 'preferences' ? (
        <Preferences key={user.id} />
      ) : section === 'privacy' ? (
        <Privacy key={user.id} onLogout={onLogout} />
      ) : (
        <p role="alert">{text('Hesap bölümü bulunamadı.', 'Account section not found.')}</p>
      )}
    </div>
  );
}
