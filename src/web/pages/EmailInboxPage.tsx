import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { MailIllustration } from '../components/MailIllustration';
import { Bone, SkeletonMailList } from '../components/Skeleton';
import { usePrefs } from '../prefs';
import { type EmailListItem, initialsOf, relativeTime, senderName, stripHtml } from '../emailHelpers';

type Tab = 'all' | 'unread';
type Bucket = 'today' | 'yesterday' | 'week' | 'older';

const PAGE_SIZE = 15;

interface EmailPage {
  items: EmailListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  unreadTotal: number;
  devices: { name: string; count: number }[];
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
/** How long the request link stays valid, in milliseconds. */
const LINK_LIFETIME_MS = 15 * 60_000;

function EmailRow({ email, lang, now, onOpen }: { email: EmailListItem; lang: string; now: number; onOpen: (id: string) => void }) {
  const { t } = usePrefs();
  // The picture comes from the sync, so the list reads no mail bodies.
  const avatarUrl = email.avatar_url || null;
  // The preview is the start of the mail as Gmail gives it, e.g. "Diminta oleh FR dari Apple TV pada 14 November…".
  const preview = stripHtml(email.snippet ?? '').replace(/\s+/g, ' ').trim();
  const unread = !email.read_at;
  const name = email.sender_name || senderName(email.from_email);
  // The request link works for 15 minutes after the mail arrives: the button counts down, then shows it has expired.
  const left = LINK_LIFETIME_MS - (now - new Date(email.received_at).getTime());
  const expired = left <= 0;
  const leftLabel = left >= 60_000 ? t('list.linkLeft', { count: Math.ceil(left / 60_000) }) : t('list.linkUnderMinute');
  return (
    <div className={`mail-item${unread ? ' is-unread' : ''}`}>
      <button
        type="button"
        className={`mail-row${unread ? ' is-unread' : ''}`}
        onClick={() => onOpen(email.id)}
      >
        <span className="mail-avatar" style={{ ['--h' as string]: hueOf(email.from_email) }} aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(email.from_email)}
        </span>
        <span className="mail-row-main">
          <span className="mail-row-top">
            <span className="mail-from">{name}</span>
            <span className="mail-when">
              <span className="mail-age">{relativeTime(email.received_at, lang)}</span>
            </span>
          </span>
          <span className="mail-subject">{email.request_title || email.subject || t('list.noSubject')}</span>
          {email.intro && <span className="mail-intro">{email.intro}</span>}
        </span>
      </button>
      {/* The bottom of the card: the start of the mail on the left, the request card's own button on the right.
          The button opens the link in a new tab and marks the mail read. */}
      {(preview || email.action_url) && (
        <div className="mail-foot">
          {preview && <span className="mail-preview">{preview}</span>}
          {email.action_url && expired && (
            <span className="mail-action is-expired" aria-disabled="true">
              {lang === 'id' ? 'Kedaluwarsa' : 'Expired'}
            </span>
          )}
          {email.action_url && !expired && (
            <a
              className="mail-action"
              href={email.action_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpen(email.id)}
            >
              Ya, Itu Saya
              <span className="mail-action-time">· {leftLabel}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** The Requests list (mail still in the list), or the Archive (mail older than the archive schedule). */
export function EmailInboxPage({ view = 'active' }: { view?: 'active' | 'archived' }) {
  const archived = view === 'archived';
  const { user } = useAuth();
  const { t, lang } = usePrefs();
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
  // A device can come from the Devices page: ?device=… opens the list already filtered.
  const [searchParams] = useSearchParams();
  const [device, setDevice] = useState(searchParams.get('device') ?? '');
  // The clock for the link countdowns: ticks every 30 seconds.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  // Once the Gmail status is known and connected, sync when the page opens.
  useEffect(() => {
    if (gmailConnected && !archived) void syncInBackground();
    // Only when the status arrives: the page syncs on each visit, not on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected]);

  // Loads the page asked for. The page on screen stays until the next one is ready.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), tab });
    if (debouncedQuery) qs.set('q', debouncedQuery);
    if (device) qs.set('device', device);
    if (archived) qs.set('view', 'archived');
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
  }, [page, tab, debouncedQuery, device, reloadKey, archived]);

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

  // Opening the page syncs once, quietly: a failed sync keeps the mail already on screen.
  async function syncInBackground() {
    setSyncing(true);
    try {
      await api.post('/email/sync');
      setReloadKey((k) => k + 1);
    } catch {
      // The list stays as it is; the Sync button still reports errors.
    } finally {
      setSyncing(false);
    }
  }

  // Opening a mail marks it read: the row loses its dot at once, and the server is told.
  function handleOpen(id: string) {
    const email = data?.items.find((e) => e.id === id);
    if (!email || email.read_at) return;
    const now = new Date().toISOString();
    setData((prev) =>
      prev && {
        ...prev,
        unreadTotal: Math.max(0, prev.unreadTotal - 1),
        items: prev.items.map((e) => (e.id === id ? { ...e, read_at: now } : e)),
      },
    );
    api.post(`/emails/${id}/read`).catch(() => setReloadKey((k) => k + 1));
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
    <div className="inbox-page">
      <div className="inbox">
        <section className="inbox-list" aria-label={archived ? t('list.archivedTitle') : t('list.title')}>
          <header className="inbox-list-head">
            <div className="inbox-list-top">
              <div>
                <h2>{archived ? t('list.archivedTitle') : t('list.title')}</h2>
                <p>{unreadCount > 0 ? t('list.unread', { count: unreadCount }) : t('list.allRead')}</p>
              </div>
              <div className="inbox-list-tools">
                <button type="button" className={`icon-btn icon-btn-sm${searching ? ' is-on' : ''}`} onClick={() => setSearching((s) => !s)} aria-label={t('list.search')} aria-expanded={searching} title={t('list.search')}>
                  <Icon name="search" size={16} />
                </button>
                {/* Sync belongs to the Requests list; the Archive only shows older mail. */}
                {archived ? null : gmailConnected === null ? (
                  <Bone w={96} h={28} r={8} />
                ) : gmailConnected ? (
                  <button type="button" className="inbox-sync" onClick={handleSync} disabled={syncing} title={t('list.sync')}>
                    <Icon name="retry" size={14} />
                    <span>{syncing ? t('list.syncing') : t('list.sync')}</span>
                  </button>
                ) : (
                  user.isAdmin ? <a href="/settings?tab=gmail" className="inbox-sync">{t('email.connectGmail')}</a> : null
                )}
              </div>
            </div>

            {searching && (
              <label className="inbox-search">
                <Icon name="search" size={15} />
                <input type="search" placeholder={t('list.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('list.search')} autoFocus />
              </label>
            )}

            {data && data.devices.length > 0 && (
              <div className="inbox-chips" role="group" aria-label={t('list.devices')}>
                <button type="button" className="inbox-chip" aria-pressed={device === ''} onClick={() => { setDevice(''); setPage(1); }}>
                  {t('list.allDevices')}
                </button>
                {data.devices.map((d) => (
                  <button key={d.name} type="button" className="inbox-chip" aria-pressed={device === d.name} onClick={() => { setDevice(d.name); setPage(1); }}>
                    {d.name} <span className="inbox-chip-count">{d.count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="inbox-segment" role="tablist" aria-label={t('list.title')}>
              <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>All</button>
              <button type="button" role="tab" aria-selected={tab === 'unread'} onClick={() => setTab('unread')}>
                Unread
                {unreadCount > 0 && <span className="inbox-count">{unreadCount}</span>}
              </button>
            </div>
          </header>

          {loadFailed && (
            <div className="inbox-error" role="alert">
              <p>{t('list.loadFailed')}</p>
              <button type="button" className="inbox-sync" onClick={() => setReloadKey((k) => k + 1)}>{t('email.retry')}</button>
            </div>
          )}

          {data === null && !loadFailed && <SkeletonMailList count={7} />}

          {data !== null && total === 0 && !loadFailed && (
            <div className="inbox-empty">
              <MailIllustration />
              <p>{debouncedQuery ? t('list.noMatch') : tab === 'unread' ? t('list.noUnread') : archived ? t('list.emptyArchived') : t('list.empty')}</p>
            </div>
          )}

          {items.length > 0 && (
            <div className="inbox-rows" aria-busy={loading}>
              {groups.map((g) => (
                <div key={g.bucket} className="inbox-group">
                  <p className="inbox-group-label">{label(g.bucket)}</p>
                  {g.items.map((email) => (
                    <EmailRow key={email.id} email={email} lang={lang} now={now} onOpen={handleOpen} />
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
      </div>
    </div>
  );
}
