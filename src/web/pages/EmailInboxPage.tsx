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
type Bucket = 'today' | 'yesterday' | 'week' | 'older';

/** Which day group a mail belongs to, for the list headings. */
function bucketOf(iso: string, now = Date.now()): Bucket {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const at = new Date(iso).getTime();
  if (at >= start.getTime()) return 'today';
  if (at >= start.getTime() - day) return 'yesterday';
  if (at >= start.getTime() - 6 * day) return 'week';
  return 'older';
}

const BUCKET_LABEL: Record<Bucket, { en: string; id: string }> = {
  today: { en: 'Today', id: 'Hari ini' },
  yesterday: { en: 'Yesterday', id: 'Kemarin' },
  week: { en: 'This week', id: 'Minggu ini' },
  older: { en: 'Earlier', id: 'Lebih lama' },
};

/** A stable hue per sender, so every person keeps the same avatar colour. */
function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

/** One mail in the list: colour avatar, sender and age, subject, and a one-line preview. Unread mail is bold, with a dot. */
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
      <span className="mail-avatar" style={{ ['--h' as string]: hueOf(email.from_email) }} aria-hidden="true">
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
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetchEmails();
    checkGmailStatus();
  }, []);

  // A failed load says so, and keeps the mail already on screen: it is not shown as an empty inbox.
  async function fetchEmails() {
    try {
      setEmails(await api.get<EmailItem[]>('/emails'));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      setEmails((prev) => prev ?? []);
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

  // Filter by tab, then by the search text (sender, subject, or the body).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (emails ?? []).filter((e) => {
      if (tab === 'unread' && e.read_at) return false;
      if (!q) return true;
      return `${e.from_email} ${e.subject} ${stripHtml(e.body)}`.toLowerCase().includes(q);
    });
  }, [emails, tab, query]);

  // The list in day groups, newest first, each with its heading.
  const groups = useMemo(() => {
    const order: Bucket[] = ['today', 'yesterday', 'week', 'older'];
    return order
      .map((b) => ({ bucket: b, items: visible.filter((e) => bucketOf(e.received_at) === b) }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  if (!user) return null;

  const label = (b: Bucket) => (lang === 'id' ? BUCKET_LABEL[b].id : BUCKET_LABEL[b].en);

  return (
    <div className={`inbox-page${selectedId ? ' has-detail' : ''}`}>
      <div className={`inbox${selectedId ? ' has-detail' : ''}`}>
        <section className="inbox-list" aria-label={t('email.title')}>
          <header className="inbox-list-head">
            <div className="inbox-list-top">
              <div>
                <h2>{t('email.title')}</h2>
                <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
              </div>
              <div className="inbox-list-tools">
                <button type="button" className={`icon-btn icon-btn-sm${searching ? ' is-on' : ''}`} onClick={() => setSearching((s) => !s)} aria-label="Search" aria-expanded={searching} title="Search">
                  <Icon name="search" size={16} />
                </button>
                {gmailConnected === null ? (
                  <Bone w={96} h={28} r={8} />
                ) : gmailConnected ? (
                  <button type="button" className="inbox-sync" onClick={handleSync} disabled={syncing} title={t('email.syncButton')}>
                    <Icon name="retry" size={14} />
                    <span>{syncing ? t('email.syncing') : t('email.syncButton')}</span>
                  </button>
                ) : (
                  <a href="/settings?tab=gmail" className="inbox-sync">{t('email.connectGmail')}</a>
                )}
              </div>
            </div>

            {searching && (
              <label className="inbox-search">
                <Icon name="search" size={15} />
                <input type="search" placeholder="Search emails" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search emails" autoFocus />
              </label>
            )}

            <div className="inbox-segment" role="tablist" aria-label={t('email.title')}>
              <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>All</button>
              <button type="button" role="tab" aria-selected={tab === 'unread'} onClick={() => setTab('unread')}>
                Unread
                {unreadCount > 0 && <span className="inbox-count">{unreadCount}</span>}
              </button>
            </div>
          </header>

          {emails === null && <SkeletonMailList count={7} />}
          {loadFailed && (
            <div className="inbox-error" role="alert">
              <p>{t('email.loadFailed')}</p>
              <button type="button" className="inbox-sync" onClick={() => void fetchEmails()}>{t('email.retry')}</button>
            </div>
          )}
          {emails !== null && emails.length === 0 && !loadFailed && (
            <div className="inbox-empty">
              <span className="inbox-empty-icon" aria-hidden="true"><Icon name="mail" size={22} /></span>
              <p>{t('email.empty')}</p>
            </div>
          )}
          {emails !== null && emails.length > 0 && visible.length === 0 && (
            <div className="inbox-empty">
              <span className="inbox-empty-icon" aria-hidden="true"><Icon name={tab === 'unread' ? 'check' : 'search'} size={22} /></span>
              <p>{tab === 'unread' ? 'No unread emails.' : 'No emails match.'}</p>
            </div>
          )}
          {groups.length > 0 && (
            <div className="inbox-rows">
              {groups.map((g) => (
                <div key={g.bucket} className="inbox-group">
                  <p className="inbox-group-label">{label(g.bucket)}</p>
                  {g.items.map((email) => (
                    <EmailRow key={email.id} email={email} selected={email.id === selectedId} lang={lang} onOpen={(id) => navigate(`/emails/${id}`)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="inbox-detail" aria-label={t('email.title')}>
          {selectedId ? (
            <EmailDetailPane key={selectedId} id={selectedId} onBack={() => navigate('/emails')} />
          ) : (
            <div className="inbox-empty">
              <span className="inbox-empty-icon" aria-hidden="true"><Icon name="mail" size={22} /></span>
              <p>{t('email.pickOne')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
