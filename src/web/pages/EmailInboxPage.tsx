import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { Bone, SkeletonMailList } from '../components/Skeleton';
import { usePrefs } from '../prefs';
import { type EmailItem, extractAvatarFromBody, initialsOf, relativeTime, senderName, snippetOf } from '../emailHelpers';
import { EmailDetailPane } from './EmailDetailPage';

type Tab = 'all' | 'unread';
type Bucket = 'today' | 'yesterday' | 'week' | 'older';

const PAGE_SIZE = 20;

interface EmailPage {
  items: EmailItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  unreadTotal: number;
}

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
  // The page of mail on screen. null until the first page arrives.
  const [data, setData] = useState<EmailPage | null>(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // null until the status is known: no 'Connect' button flashes while it loads.
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Typing in search waits a moment, then asks the server; every new search starts again at page 1.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    checkGmailStatus();
  }, []);

  // Loads the page asked for. The page on screen stays until the next one is ready.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), tab });
    if (debouncedQuery) qs.set('q', debouncedQuery);
    api
      .get<EmailPage>(`/emails?${qs.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, tab, debouncedQuery, reloadKey]);

  async function checkGmailStatus() {
    try {
      const status = await api.get<{ connected: boolean }>('/email/status');
      setGmailConnected(status.connected);
    } catch {
      setGmailConnected(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/email/sync');
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Sinkronisasi gagal');
    } finally {
      setSyncing(false);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadTotal ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The page of mail in day groups, newest first, each with its heading.
  const groups = useMemo(() => {
    const order: Bucket[] = ['today', 'yesterday', 'week', 'older'];
    return order.map((b) => ({ bucket: b, items: items.filter((e) => bucketOf(e.received_at) === b) })).filter((g) => g.items.length > 0);
  }, [items]);

  if (!user) return null;

  const label = (b: Bucket) => (lang === 'id' ? BUCKET_LABEL[b].id : BUCKET_LABEL[b].en);
  const pageLabel = lang === 'id' ? `${from}–${to} dari ${total}` : `${from}–${to} of ${total}`;

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

          {loadFailed && (
            <div className="inbox-error" role="alert">
              <p>{t('email.loadFailed')}</p>
              <button type="button" className="inbox-sync" onClick={() => setReloadKey((k) => k + 1)}>{t('email.retry')}</button>
            </div>
          )}

          {data === null && !loadFailed && <SkeletonMailList count={7} />}

          {data !== null && total === 0 && !loadFailed && (
            <div className="inbox-empty">
              <span className="inbox-empty-icon" aria-hidden="true"><Icon name={debouncedQuery || tab === 'unread' ? 'search' : 'mail'} size={22} /></span>
              <p>{debouncedQuery ? 'No emails match.' : tab === 'unread' ? 'No unread emails.' : t('email.empty')}</p>
            </div>
          )}

          {items.length > 0 && (
            <div className="inbox-rows" aria-busy={loading}>
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

          {total > 0 && (
            <nav className="inbox-pager" aria-label="Pages">
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} aria-label="Previous page" title="Previous page">
                <Icon name="chevron-left" size={16} />
              </button>
              <span className="inbox-pager-label">{pageLabel}</span>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page >= lastPage || loading} aria-label="Next page" title="Next page">
                <Icon name="chevron-right" size={16} />
              </button>
            </nav>
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
