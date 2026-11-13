import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { SkeletonRows } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { usePrefs } from '../prefs';

interface EmailItem {
  id: string;
  subject: string;
  from_email: string;
  to_email: string;
  body: string;
  received_at: string;
  created_at: string;
}

function initialsOf(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[.\-_]/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function extractAvatarFromBody(body: string): string | null {
  const match = body.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function detectActionButton(body: string): string | null {
  const plain = stripHtml(body);
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  const actionKeywords = [
    'ya, itu saya',
    'ya, itu ada',
    'konfirmasi',
    'verifikasi',
    'aktifkan',
    'setujui',
    'terima',
  ];
  for (const line of lines) {
    const upper = line.toUpperCase();
    // Action button text: short line (2-40 chars), all uppercase or contains action keywords
    if (
      line.length > 1 &&
      line.length < 40 &&
      (upper === line ||
        actionKeywords.some((kw) => upper.includes(kw.toUpperCase())))
    ) {
      return line;
    }
  }
  return null;
}

function EmailItemCard({ email, t, lang }: { email: EmailItem; t: any; lang: string }) {
  const navigate = useNavigate();
  const avatarUrl = extractAvatarFromBody(email.body);
  const plainBody = stripHtml(email.body);
  const actionBtn = detectActionButton(plainBody);
  const bodyLines = plainBody.split('\n').map((l) => l.trim()).filter(Boolean);
  const bodyText = bodyLines.filter((l) => l !== actionBtn).join(' ');

  function handleClick() {
    navigate(`/emails/${email.id}`, { state: { email } });
  }

  return (
    <article key={email.id} className="email-item" onClick={handleClick} style={{ cursor: 'pointer' }}>
      <div className="email-item-head">
        {avatarUrl ? (
          <img className="email-avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="email-avatar">{initialsOf(email.from_email)}</span>
        )}
        <div className="email-meta">
          <div className="email-from">{email.from_email}</div>
          <div className="email-subject">{email.subject}</div>
          <div className="email-date">
            {new Date(email.received_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>
        {actionBtn && (
          <button
            type="button"
            className="btn btn-primary email-action-btn"
            onClick={(e) => { e.stopPropagation(); void handleAction(email.id, actionBtn); }}
          >
            {actionBtn}
          </button>
        )}
      </div>
      {bodyText && <p className="email-body">{bodyText}</p>}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={(e) => { e.stopPropagation(); void handleMarkRead(email.id); }}
        aria-label={t('email.markRead')}
      >
        <Icon name="check" size={14} />
      </button>
    </article>
  );

  async function handleAction(id: string, actionText: string) {
    console.log('Action clicked:', id, actionText);
  }

  async function handleMarkRead(id: string) {
    try {
      await api.post(`/emails/${id}/read`);
    } catch (err) {
      console.error('Mark read failed', err);
    }
  }
}

export function EmailInboxPage() {
  const { user } = useAuth();
  const { t, lang } = usePrefs();
  const [emails, setEmails] = useState<EmailItem[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  if (!user) return null;

  useEffect(() => {
    fetchEmails();
    checkGmailStatus();
  }, []);

  async function fetchEmails() {
    try {
      const data = await api.get<EmailItem[]>('/emails');
      setEmails(data);
    } catch {
      setEmails([]);
    }
  }

  async function checkGmailStatus() {
    try {
      const data = await api.get<{ connected: boolean; email: string | null; connectedAt: string | null }>('/email/status');
      setGmailConnected(data.connected);
    } catch {
      setGmailConnected(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/email/sync');
      await fetchEmails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sinkronisasi gagal';
      alert(msg);
    } finally {
      setSyncing(false);
    }
  }

  const list = emails ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t('email.title')}</h2>
          <p className="hint">{t('email.subtitle')}</p>
        </div>
        <div className="page-actions">
          {gmailConnected ? (
            <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
              {syncing ? t('email.syncing') : t('email.syncButton')}
            </button>
          ) : (
            <a href="/settings?tab=gmail" className="btn btn-primary">
              {t('email.connectGmail')}
            </a>
          )}
        </div>
      </div>

      <section className="settings-section" aria-labelledby="emails-list">
        {emails === null && (
          <div className="card">
            <SkeletonRows count={3} />
          </div>
        )}
      {emails !== null && emails.length === 0 && (
        <div className="card">
          <div className="empty">
            <p className="empty-title">{t('email.empty')}</p>
          </div>
        </div>
      )}
      {emails !== null && emails.length > 0 && (
        <div className="email-grid">
          {list.map((email) => (
            <EmailItemCard key={email.id} email={email} t={t} lang={lang} />
          ))}
        </div>
      )}
      </section>
    </div>
  );
}