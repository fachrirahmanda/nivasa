import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { Icon } from '../components/Icon';

interface EmailItem {
  id: string;
  subject: string;
  from_email: string;
  to_email: string;
  body: string;
  received_at: string;
  created_at: string;
}

export function EmailDetailPage() {
  const { t, lang } = usePrefs();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState<EmailItem | null>(null);
  const [error, setError] = useState('');

  const urlId = location.pathname.split('/').pop();

  if (!user) return null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!urlId) {
          setError('Email tidak ditemukan');
          return;
        }

        // Ambil langsung dari Gmail API (jangan simpan ke database)
        // Hanya fetch sekali; jika email sudah ada (dari route state atau fetch sebelumnya),
        // jangan meminta ulang ke server untuk mencegah request berulang.
        if (email) return;

        const data = await api.get<EmailItem>(`/emails/${urlId}/full`);
        if (!cancelled) setEmail(data);
        void api.post(`/emails/${data.id}/read`).catch(() => {});
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Gagal memuat email');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [urlId, email]);

  function handleBack() {
    navigate('/emails');
  }

  if (!email) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h2>{t('email.title')}</h2>
          </div>
        </div>
        {error && <p className="text-danger">{error}</p>}
      </div>
    );
  }

  const avatarUrl = (() => {
    const match = email.body.match(/<img[^>]+src="([^"]+)"/i);
    return match ? match[1] : null;
  })();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleBack}
            aria-label="Kembali"
            style={{ marginBottom: '8px' }}
          >
            <Icon name="chevron-left" size={16} />
            <span>Kembali</span>
          </button>
          <h2>{email.subject}</h2>
          <p className="hint">{email.from_email}</p>
        </div>

      </div>

      <section className="settings-section" aria-labelledby="email-detail">
        <div className="card">
          <div className="card-body">
            <div className="email-detail-head">
              <span className="email-avatar">
                {avatarUrl ? (
                  <img className="email-avatar-img" src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="email-avatar-text">{initialsOf(email.from_email)}</span>
                )}
              </span>
              <div className="email-detail-meta">
                <div className="email-detail-from">{email.from_email}</div>
                <div className="email-detail-date">
                  {new Date(email.received_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>

            <div className="email-detail-body" dangerouslySetInnerHTML={{ __html: email.body }} />
          </div>
        </div>
      </section>
    </div>
  );
}

function initialsOf(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[.\-_]/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}