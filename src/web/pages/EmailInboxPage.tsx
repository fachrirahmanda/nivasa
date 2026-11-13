import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { SkeletonRows } from '../components/Skeleton';
import { usePrefs } from '../prefs';
import { type EmailItem, extractAvatarFromBody, initialsOf, snippetOf, detectActionButton } from '../emailHelpers';
import { EmailDetailPane } from './EmailDetailPage';

/** One email in the list: sender and avatar, subject, a short preview and the date. */
function EmailRow({ email, selected, lang, onOpen }: { email: EmailItem; selected: boolean; lang: string; onOpen: (id: string) => void }) {
  const avatarUrl = extractAvatarFromBody(email.body);
  const preview = snippetOf(email.body, detectActionButton(email.body));
  const date = new Date(email.received_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' });
  return (
    <button type="button" className={`inbox-row${selected ? ' is-selected' : ''}`} onClick={() => onOpen(email.id)} aria-current={selected ? 'true' : undefined}>
      <span className="inbox-avatar" aria-hidden="true">
        {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(email.from_email)}
      </span>
      <span className="inbox-row-main">
        <span className="inbox-row-top">
          <span className="inbox-from">{email.from_email}</span>
          <span className="inbox-date">{date}</span>
        </span>
        <span className="inbox-subject">{email.subject}</span>
        {preview && <span className="inbox-snippet">{preview}</span>}
      </span>
    </button>
  );
}

export function EmailInboxPage() {
  const { user } = useAuth();
  const { t, lang } = usePrefs();
  const navigate = useNavigate();
  const { id: selectedId } = useParams<{ id?: string }>();
  const [emails, setEmails] = useState<EmailItem[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    fetchEmails();
    checkGmailStatus();
  }, []);

  async function fetchEmails() {
    try {
      setEmails(await api.get<EmailItem[]>('/emails'));
    } catch {
      setEmails([]);
    }
  }

  async function checkGmailStatus() {
    try {
      const data = await api.get<{ connected: boolean }>('/email/status');
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
      alert(err instanceof Error ? err.message : 'Sinkronisasi gagal');
    } finally {
      setSyncing(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page inbox-page">
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

      <div className={`inbox${selectedId ? ' has-detail' : ''}`}>
        <section className="inbox-list" aria-label={t('email.title')}>
          {emails === null && <SkeletonRows count={6} />}
          {emails !== null && emails.length === 0 && (
            <div className="inbox-empty">
              <p>{t('email.empty')}</p>
            </div>
          )}
          {emails !== null && emails.length > 0 && (
            <div className="inbox-rows">
              {emails.map((email) => (
                <EmailRow key={email.id} email={email} selected={email.id === selectedId} lang={lang} onOpen={(id) => navigate(`/emails/${id}`)} />
              ))}
            </div>
          )}
        </section>

        <section className="inbox-detail" aria-label={t('email.title')}>
          {selectedId ? (
            <EmailDetailPane key={selectedId} id={selectedId} onBack={() => navigate('/emails')} />
          ) : (
            <div className="inbox-empty">
              <p>{t('email.pickOne')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
