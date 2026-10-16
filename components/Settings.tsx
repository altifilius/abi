import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { loadPreferences, savePreferences } from '../services/persistence';
import { COUNTRIES, type User, type Workspace } from '../types';
import AccountControls from './AccountControls';

interface EmailPreferences {
  email_enabled: boolean;
  task_reminders: boolean;
  deadline_reminders: boolean;
  review_notifications: boolean;
  activity_notifications: boolean;
}
export default function Settings({
  workspace,
  user,
  onWorkspaceChanged,
  onUsage,
  onDeleted,
}: {
  workspace: Workspace;
  user: User;
  onWorkspaceChanged: () => Promise<void>;
  onUsage: () => void;
  onDeleted: () => void;
}) {
  const { text, language, setLanguage } = useI18n();
  const [theme, setTheme] = useState(loadPreferences().theme || 'light');
  const [policy, setPolicy] = useState(workspace.ai_policy);
  const [country, setCountry] = useState(workspace.country);
  const [name, setName] = useState(workspace.name);
  const [email, setEmail] = useState<EmailPreferences | null>(null);
  const [mail, setMail] = useState<{ configured: boolean } | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePreferences({ theme });
  }, [theme]);
  useEffect(() => {
    const active = new AbortController();
    setPolicy(workspace.ai_policy);
    setCountry(workspace.country);
    setName(workspace.name);
    setError('');
    Promise.all([
      api<EmailPreferences>('/notification-preferences', { signal: active.signal }),
      api<{ configured: boolean }>('/mail-status', { signal: active.signal }),
    ])
      .then(([preferences, mailStatus]) => {
        if (!active.signal.aborted) {
          setEmail(preferences);
          setMail(mailStatus);
        }
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    return () => active.abort();
  }, [workspace]);
  return (
    <div className="stack">
      <h1>{text('Ayarlar', 'Settings')}</h1>
      <AccountControls
        workspace={workspace}
        user={user}
        onUsage={onUsage}
        onWorkspaceChanged={onWorkspaceChanged}
        onDeleted={onDeleted}
      />
      <section className="panel">
        <h2>{text('Bu tarayıcı', 'This browser')}</h2>
        <p>
          {text(
            'Dil, tema ve son seçimler bu tarayıcıda saklanır. Proje, profil, politika ve e-posta tercihleri sunucudadır.',
            'Language, theme and last selections are stored in this browser. Projects, profiles, policy and email preferences are server-side.',
          )}
        </p>
        <label>
          {text('Dil', 'Language')}
          <select value={language} onChange={(e) => setLanguage(e.target.value as 'tr' | 'en')}>
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {text('Tema', 'Theme')}
          <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}>
            <option value="light">{text('Açık', 'Light')}</option>
            <option value="dark">{text('Koyu', 'Dark')}</option>
          </select>
        </label>
      </section>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setStatus('');
          try {
            await api(`/workspaces/${workspace.id}`, {
              method: 'PATCH',
              json: { name, country, ai_policy: policy },
            });
            await onWorkspaceChanged();
            setStatus(text('Kaydedildi', 'Saved'));
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{text('Çalışma alanı ve AI politikası', 'Workspace and AI policy')}</h2>
        <label>
          {text('Ad', 'Name')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {text('Ülke', 'Country')}
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </label>
        <label>
          {text('AI veri politikası', 'AI data policy')}
          <select
            value={policy}
            onChange={(e) => setPolicy(e.target.value as 'local' | 'external')}
          >
            <option value="local">{text('Yerel / kendi sunucunuz', 'Local / self-hosted')}</option>
            <option value="external">{text('Harici sağlayıcı', 'External provider')}</option>
          </select>
        </label>
        <p>
          {text(
            'Politika sohbet, belge, çeviri ve embedding işlemlerine uygulanır. Harici seçim verilerin yapılandırılmış sağlayıcıya gönderilmesine izin verir. Yapılandırma yoksa işlem açık hata verir; sessiz sağlayıcı değişimi yoktur.',
            'Policy applies to chat, documents, translation and embeddings. External selection permits sending data to the configured provider. Missing configuration fails explicitly; no silent provider switch.',
          )}
        </p>
        <button disabled={busy || !['owner', 'admin'].includes(workspace.role || '')}>
          {text('Sunucu ayarlarını kaydet', 'Save server settings')}
        </button>
      </form>
      <section className="panel">
        <h2>{text('E-posta bildirimleri', 'Email notifications')}</h2>
        <p>
          {mail?.configured
            ? text(
                'SMTP yapılandırılmış. Gerçek teslimat zamanlayıcı işçisi gerektirir.',
                'SMTP is configured. Actual delivery requires the scheduler worker.',
              )
            : text(
                'SMTP yapılandırılmamış; e-posta gönderimi kullanılamaz.',
                'SMTP is not configured; email delivery is unavailable.',
              )}
        </p>
        {email && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setStatus('');
              try {
                setEmail(
                  await api<EmailPreferences>('/notification-preferences', {
                    method: 'PATCH',
                    json: email,
                  }),
                );
                setStatus(text('E-posta tercihleri kaydedildi', 'Email preferences saved'));
              } catch (error) {
                setError(errorMessage(error));
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
                  onChange={(e) => setEmail({ ...email, [key]: e.target.checked })}
                />
                {text(tr, en)}
              </label>
            ))}
            <button disabled={busy}>
              {text('E-posta tercihlerini kaydet', 'Save email preferences')}
            </button>
          </form>
        )}
        <p>
          {text(
            'Tarayıcı push bildirimi veya takvim senkronizasyonu yok. Ekip sekmesinden gerçek ICS indirin.',
            'No browser push or calendar synchronization. Download actual ICS from the team tab.',
          )}
        </p>
        <button
          disabled={busy || !mail?.configured}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api('/auth/request-verification', { method: 'POST' });
              setStatus(
                text(
                  'Doğrulama e-postası kuyruğa alındı; gelen bağlantıyı açın.',
                  'Verification email queued; open the delivered link.',
                ),
              );
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {text('E-posta doğrulama bağlantısı gönder', 'Send email verification link')}
        </button>
      </section>
      <section className="panel">
        <h2>Free / Pro</h2>
        <p>
          {text(
            'Free: 100 sohbet + 10 yazım / UTC ay. Pro: çalışma alanına ortak 500 sohbet + 50 yazım, en fazla 3 üye. Ücret, OCR kotası ve ödeme sağlayıcısı kararları bekliyor; ödeme ve ücretli ekstra kredi satışı etkin değildir. Otomatik aşım yok.',
            'Free: 100 chat + 10 writing operations / UTC month. Pro: 500 chat + 50 writing operations shared per workspace, up to 3 members. Pricing, OCR quotas and payment provider decisions are deferred; billing and paid extra-credit sales are not active. No automatic overage.',
          )}
        </p>
        {user.is_admin && (
          <>
            <h3>
              {text(
                'Yalnızca yönetici: manuel yerel yetki',
                'Admin only: manual local entitlement',
              )}
            </h3>
            <p>
              {text(
                'Bu işlem ödeme değildir ve ödeme yapılmış gibi göstermez.',
                'This operation is not payment and does not claim a purchase.',
              )}
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api(`/admin/workspaces/${workspace.id}/plan`, {
                    method: 'POST',
                    json: { plan: workspace.plan === 'pro' ? 'free' : 'pro' },
                  });
                  await onWorkspaceChanged();
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text('Manuel planı değiştir', 'Change manual plan')} →{' '}
              {workspace.plan === 'pro' ? 'Free' : 'Pro'}
            </button>
          </>
        )}
      </section>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
