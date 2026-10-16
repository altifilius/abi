import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';

export default function PasswordRecovery({ onReset }: { onReset?: () => void } = {}) {
  const { text } = useI18n();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const reset = pathname === '/auth/reset-password';
  const token = params.get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  return (
    <main className="auth-screen">
      <section className="panel stack">
        <h1>
          {reset
            ? text('Parolayı sıfırla', 'Reset password')
            : text('Parolamı unuttum', 'Forgot password')}
        </h1>
        {reset && !token ? (
          <p role="alert" className="error">
            {text(
              'Sıfırlama bağlantısı eksik. Yeni bağlantı isteyin.',
              'The reset link is missing its token. Request a new link.',
            )}
          </p>
        ) : (
          !complete && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setError('');
                if (reset && password !== repeat) {
                  setError(text('Parolalar eşleşmiyor.', 'Passwords do not match.'));
                  return;
                }
                setBusy(true);
                try {
                  await api(reset ? '/auth/reset-password' : '/auth/forgot-password', {
                    method: 'POST',
                    json: reset ? { token, new_password: password } : { email },
                  });
                  setPassword('');
                  setRepeat('');
                  setComplete(true);
                  if (reset) onReset?.();
                } catch (reason) {
                  setError(errorMessage(reason));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {reset ? (
                <>
                  <label>
                    {text(
                      'Yeni parola (en az 12 karakter)',
                      'New password (at least 12 characters)',
                    )}
                    <input
                      type="password"
                      required
                      minLength={12}
                      maxLength={1024}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
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
                </>
              ) : (
                <label>
                  {text('Hesabınızın e-posta adresi', 'Your account email')}
                  <input
                    type="email"
                    required
                    maxLength={320}
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
              )}
              <button disabled={busy}>
                {busy
                  ? text('Bekleyin…', 'Please wait…')
                  : reset
                    ? text('Yeni parolayı kaydet', 'Save new password')
                    : text('Sıfırlama bağlantısı iste', 'Request reset link')}
              </button>
            </form>
          )
        )}
        {complete && (
          <p role="status">
            {reset
              ? text(
                  'Parolanız değiştirildi ve tüm oturumlar kapatıldı. Yeni parolanızla giriş yapın.',
                  'Your password was changed and all sessions were signed out. Sign in with your new password.',
                )
              : text(
                  'Bu adres için uygun bir hesap varsa sıfırlama bağlantısı e-postayla iletilecektir. Gelen kutunuzu kontrol edin.',
                  'If an eligible account exists for this address, a reset link will be delivered by email. Check your inbox.',
                )}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {reset && (
          <Link to="/auth/forgot-password">
            {text('Yeni sıfırlama bağlantısı iste', 'Request a new reset link')}
          </Link>
        )}
        <Link to="/">{text('Giriş ekranına dön', 'Return to sign in')}</Link>
      </section>
    </main>
  );
}
