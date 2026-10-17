import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage, getCsrf } from '../services/api';
import type { Session } from '../types';
export default function Auth({ onSession }: { onSession: (session: Session) => void }) {
  const { text, language, setLanguage } = useI18n();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="auth-screen">
      <section className="panel">
        <div className="auth-brand">
          <span>✧</span>
          <strong>
            abi<span className="brand-dot">.</span>
          </strong>
        </div>
        <p className="eyebrow">{text('FİKRİNE YER AÇ', 'MAKE ROOM FOR YOUR IDEA')}</p>
        <h1>{text('Güzel fikirler, birlikte büyür.', 'Good ideas grow together.')}</h1>
        <p>
          {text(
            'Fikrini netleştir. Raporlarını birlikte yaz. Projene uygun desteği keşfet.',
            'Give your idea clarity. Shape your reports. Find the support to move forward.',
          )}
        </p>
        <label>
          {text('Dil', 'Language')}
          <select value={language} onChange={(e) => setLanguage(e.target.value as 'tr' | 'en')}>
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="actions">
          <button
            type="button"
            aria-pressed={!register}
            onClick={() => {
              setRegister(false);
              setError('');
            }}
          >
            {text('Giriş', 'Login')}
          </button>
          <button
            type="button"
            aria-pressed={register}
            onClick={() => {
              setRegister(true);
              setError('');
            }}
          >
            {text('Hesap aç', 'Sign up')}
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(`/auth/${register ? 'register' : 'login'}`, {
                method: 'POST',
                json: register ? { email, password, name } : { email, password },
              });
              onSession(await getCsrf());
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              {text('Ad', 'Name')}
              <input
                required
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            {text('E-posta', 'Email')}
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {text('Parola (en az 12 karakter)', 'Password (at least 12 characters)')}
            <input
              required
              type="password"
              minLength={12}
              autoComplete={register ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? text('Bekleyin…', 'Please wait…')
              : register
                ? text('Kişisel hesap oluştur', 'Create personal account')
                : text('Giriş yap', 'Login')}
          </button>
        </form>
        {!register && (
          <Link to="/auth/forgot-password">{text('Parolamı unuttum', 'Forgot password')}</Link>
        )}
      </section>
    </main>
  );
}
