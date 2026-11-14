import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../auth';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { usePrefs } from '../prefs';
import type { User } from '../../shared/types';

const HIGHLIGHTS: { title: string; text: string }[] = [
  {
    title: 'Sinkronkan email',
    text: 'Ambil permintaan update Rumah dari email dengan sekali sync.',
  },
  {
    title: 'Konfirmasi langsung',
    text: 'Setujui permintaan langsung dari daftar, cukup satu ketukan.',
  },
  {
    title: 'Tandai sebagai dibaca',
    text: 'Tandai permintaan sebagai dibaca setelah Anda memeriksanya.',
  },
];

interface Config {
  devLogin: boolean;
}

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { t } = usePrefs();
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [devLogin, setDevLogin] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devLoading, setDevLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await api.post<{ user: User }>('/auth/login', { username, password });
      setUser(data.user);
      navigate('/dashboard', { replace: true });
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiRequestError ? requestError.message : 'Login gagal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setDevLoading(true);
    try {
      const data = await api.post<{ user: User }>('/auth/dev-login', { email: devEmail.trim() });
      setUser(data.user);
      navigate('/dashboard', { replace: true });
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiRequestError ? requestError.message : 'Login gagal');
    } finally {
      setDevLoading(false);
    }
  };

  useEffect(() => {
    api.get<Config>('/auth/config').then((data) => {
      setDevLogin(!!data.devLogin);
    });
  }, []);

  if (user) {
    return null;
  }

  return (
    <div className="login">
      <aside className="login-hero">
        <div className="login-brand">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <span>Nivasa</span>
        </div>

        <div className="login-pitch">
          <h2>{t('login.heroSubtitle')}</h2>
          <p>{t('login.heroDescription')}</p>
        </div>

        <ul className="login-highlights">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title}>
              <span className="login-highlight-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </span>
              <span>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="login-main">
        <div className="login-theme">
          <ThemeSwitch />
        </div>

        <div className="login-card">
          <img src="/favicon.svg" alt="" width="44" height="44" className="login-card-logo" />
          <div className="login-card-head">
            <h1>{t('login.title')}</h1>
            <p>{t('login.cardSubtitle')}</p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              <div className="alert-content">
                <p>{error}</p>
              </div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label>{t('login.usernameLabel')}</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
                required
                className="input"
                autoComplete="username"
              />
            </div>
            <div className="input-group">
              <label>{t('login.passwordLabel')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                className="input"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-block"
              aria-busy={isLoading}
            >
              {isLoading ? 'Masuk...' : t('login.buttonLogin')}
            </button>
          </form>

          {devLogin && (
            <div className="dev-login">
              <h3>{t('login.devLogin')}</h3>
              <p className="hint m-0">{t('login.devHint')}</p>
              <form className="auth-form" onSubmit={handleDevSubmit}>
                <div className="input-group">
                  <label>{t('login.devEmailLabel')}</label>
                  <input
                    id="dev-email"
                    type="email"
                    value={devEmail}
                    onChange={(event) => setDevEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    className="input"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="submit"
                  disabled={devLoading}
                  className="btn btn-primary btn-block"
                  aria-busy={devLoading}
                >
                  {devLoading ? 'Masuk...' : t('login.devButton')}
                </button>
              </form>
            </div>
          )}

          <p className="auth-switch">
            {t('login.noAccountNote')}
          </p>
        </div>
      </main>
    </div>
  );
}
