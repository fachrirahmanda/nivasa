import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { Bone, SkeletonMailList } from '../components/Skeleton';
import { usePrefs } from '../prefs';
import { type EmailItem, extractAvatarFromBody, initialsOf, relativeTime, senderName, snippetOf, stripHtml } from '../emailHelpers';
import { EmailDetailPane } from './EmailDetailPage';

type Tab = 'all' | 'unread';

/** One mail in the list: avatar, sender and age, subject, and a one-line preview. Unread mail is bold, with a dot. */
function EmailRow({ email, selected, lang, onOpen }: { email: EmailItem; selected: boolean; lang: string; onOpen: (id: string) => void }) {
  const avatarUrl = extractAvatarFromBody(email.body);
  const preview = snippetOf(email.body, null).slice(0, 160);
  const unread = !email.read_at;
  const name = senderName(email.from_email);
  return (
    <button
      type="button"
      className={`mail-row${selected ? ' is-selected' : ''}${unread ? ' is-unread' : ''}`}
      onClick={() => onOpen(email.id)}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="mail-avatar" aria-hidden="true">
        {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(email.from_email)}
      </span>
      <span className="mail-row-main">
        <span className="mail-row-top">
          <span className="mail-from">{name}</span>
          <span className="mail-age">{relativeTime(email.received_at, lang)}</span>
        </span>
        <span className="mail-subject">{email.subject || '(no subject)'}</span>
        {preview && <span className="mail-preview">{preview}</span>}
      </span>
      {unread && <span className="mail-dot" aria-label="Unread" />}
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
  // null until the status is known: no 'Connect' button flashes while it loads.
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

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

  const unreadCount = (emails ?? []).filter((e) => !e.read_at).length;

  // Filter by tab, then by the search text (sender, subject, or the start of the body).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (emails ?? []).filter((e) => {
      if (tab === 'unread' && e.read_at) return false;
      if (!q) return true;
      const hay = `${e.from_email} ${e.subject} ${stripHtml(e.body)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [emails, tab, query]);

  if (!user) return null;

  return (
    <div className={`inbox-page${selectedId ? ' has-detail' : ''}`}>
      <div className={`inbox${selectedId ? ' has-detail' : ''}`}>
        <section className="inbox-list" aria-label={t('email.title')}>
          <div className="inbox-list-head">
            <div className="inbox-list-top">
              <h2>{t('email.title')}</h2>
              <div className="inbox-list-tools">
                <button type="button" className={`icon-btn icon-btn-sm${searching ? ' is-on' : ''}`} onClick={() => setSearching((s) => !s)} aria-label="Search" title="Search">
                  <Icon name="search" size={16} />
                </button>
                {gmailConnected === null ? (
                  <Bone w={96} h={28} r={8} />
                ) : gmailConnected ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleSync} disabled={syncing} title={t('email.syncButton')}>
                    <Icon name="retry" size={14} />
                    <span>{syncing ? t('email.syncing') : t('email.syncButton')}</span>
                  </button>
                ) : (
                  <a href="/settings?tab=gmail" className="btn btn-ghost btn-sm">{t('email.connectGmail')}</a>
                )}
              </div>
            </div>
            {searching && (
              <input className="input inbox-search" type="search" placeholder="Search emails" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search emails" autoFocus />
            )}
            <div className="inbox-tabs" role="tablist" aria-label={t('email.title')}>
              <button type="button" role="tab" aria-selected={tab === 'all'} className="inbox-tab" onClick={() => setTab('all')}>All</button>
              <button type="button" role="tab" aria-selected={tab === 'unread'} className="inbox-tab" onClick={() => setTab('unread')}>
                Unread{unreadCount > 0 && <span className="count">{unreadCount}</span>}
              </button>
            </div>
          </div>

          {emails === null && <SkeletonMailList count={7} />}
          {emails !== null && emails.length === 0 && (
            <div className="inbox-empty"><p>{t('email.empty')}</p></div>
          )}
          {emails !== null && emails.length > 0 && visible.length === 0 && (
            <div className="inbox-empty"><p>{tab === 'unread' ? 'No unread emails.' : 'No emails match.'}</p></div>
          )}
          {visible.length > 0 && (
            <div className="inbox-rows">
              {visible.map((email) => (
                <EmailRow key={email.id} email={email} selected={email.id === selectedId} lang={lang} onOpen={(id) => navigate(`/emails/${id}`)} />
              ))}
            </div>
          )}
        </section>

        <section className="inbox-detail" aria-label={t('email.title')}>
          {selectedId ? (
            <EmailDetailPane key={selectedId} id={selectedId} onBack={() => navigate('/emails')} />
          ) : (
            <div className="inbox-empty"><p>{t('email.pickOne')}</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
