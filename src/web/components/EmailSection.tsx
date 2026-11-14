import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, ApiRequestError } from '../api';
import { formatDate } from '../format';
import { Icon } from './Icon';
import { SkeletonSettingsCard } from './Skeleton';
import { usePrefs } from '../prefs';
import type { MessageKey } from '../i18n';

// Settings: Gmail sync — connect a Gmail account and sync emails with the subject
// "Penting: Cara memperbarui Rumah dengan Akun Netflix-mu". Laid out like DriveSection
// (the Storage page): account badge, connect/sync buttons, result banner from ?email=…

interface EmailStatus {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}

const RESULTS: Record<string, MessageKey> = {
  connected: 'email.connected',
  failed: 'email.connectFailed',
  forbidden: 'email.ownerOnly',
};

export function EmailSection() {
  const { t, lang } = usePrefs();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);
  // How many days a mail stays in the Requests list before it moves to the Archive (0: never). null until loaded.
  const [archiveDays, setArchiveDays] = useState<number | null>(null);
  const [archiveChoices, setArchiveChoices] = useState<number[]>([]);
  const [resetDone, setResetDone] = useState(false);
  const result = params.get('email');

  async function load() {
    try {
      const data = await api.get<EmailStatus>('/email/status');
      setFailed(false);
      setStatus(data);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void load();
    api
      .get<{ archiveAfterDays: number; choices: number[] }>('/email/archive')
      .then((res) => {
        setArchiveDays(res.archiveAfterDays);
        setArchiveChoices(res.choices);
      })
      .catch(() => {});
  }, []);

  // The connect flow comes back here with ?email=…; show the result once, then drop it from the URL.
  useEffect(() => {
    if (!result) return;
    if (result === 'connected') load();
    const next = new URLSearchParams(params);
    next.delete('email');
    setParams(next, { replace: true });
    // Only on arrival: the params are read once.
  }, []);

  async function handleConnect() {
    setError('');
    try {
      const origin = window.location.origin;
      const res = await fetch('/api/email/connect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin }),
      });
      if (!res.ok) throw new Error('Koneksi gagal');
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : t('email.connectFailed'));
    }
  }

  async function handleDisconnect() {
    if (!confirm(t('email.confirmDisconnect'))) return;
    setError('');
    try {
      await api.delete('/email/disconnect');
      setSyncedCount(null);
      load();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : t('email.connectFailed'));
    }
  }

  // Admin only (the server checks too): deletes every synced mail. Gmail stays connected, and a sync brings mail back.
  async function handleReset() {
    if (!confirm(t('email.confirmReset'))) return;
    setError('');
    setResetDone(false);
    try {
      await api.post('/email/reset');
      setSyncedCount(null);
      setResetDone(true);
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : t('email.syncFailed'));
    }
  }

  async function handleArchive(days: number) {
    const previous = archiveDays;
    setArchiveDays(days);
    setError('');
    try {
      await api.put('/email/archive', { archiveAfterDays: days });
    } catch (requestError) {
      setArchiveDays(previous);
      setError(requestError instanceof ApiRequestError ? requestError.message : t('email.syncFailed'));
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncedCount(null);
    try {
      const data = await api.post<{ emailsCount?: number }>('/email/sync');
      setSyncedCount(data.emailsCount ?? 0);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : t('email.syncFailed'));
    } finally {
      setSyncing(false);
    }
  }

  if (status === null) return failed ? null : <SkeletonSettingsCard lines={3} />;

  return (
    <section className="card storage-card">
      <div className="storage-head">
        <span className="storage-logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 52 39" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 39h8.5V18.3L0 9v26c0 2.2 1.8 4 4 4z" fill="#4285f4"></path>
            <path d="M39.5 39H48c2.2 0 4-1.8 4-4V9l-12.5 9.3z" fill="#34a853"></path>
            <path d="M39.5 4v14.3L52 9V5.5C52 2 48 0 45.2 2.1z" fill="#fbbc04"></path>
            <path d="M12.5 18.3V4L26 14l13.5-10v14.3L26 28.3z" fill="#ea4335"></path>
            <path d="M0 5.5V9l12.5 9.3V4L6.8 2.1C4 0 0 2 0 5.5z" fill="#c5221f"></path>
          </svg>
        </span>
        <div className="grow">
          <h2 className="m-0">{t('email.settingsTitle')}</h2>
          {status.connected ? (
            <p className="text-muted m-0">
              {t('email.connectedTo')}: {status.email || '-'}
              {status.connectedAt && <> · {t('email.since', { date: formatDate(status.connectedAt.slice(0, 10), lang) })}</>}
            </p>
          ) : (
            <p className="text-muted m-0">{t('email.notConnectedHint')}</p>
          )}
        </div>
        <span className={`badge ${status.connected ? 'badge-success badge-dot' : 'badge-warning'}`}>
          {status.connected ? t('email.statusConnected') : t('email.statusNot')}
        </span>
      </div>

      <ul className="storage-notes">
        <li>{t('email.note1')}</li>
        <li>{t('email.note2')}</li>
        <li>{t('email.note3')}</li>
      </ul>

      {error && <p className="text-danger">{error}</p>}
      {result && RESULTS[result] && <p className="text-sm text-muted">{t(RESULTS[result])}</p>}
      {resetDone && <p className="hint">{t('email.resetDone')}</p>}
      {syncedCount !== null && result !== 'connected' && (
        <p className="hint">{t('email.synced', { count: syncedCount })}</p>
      )}

      {archiveDays !== null && (
        <div className="archive-schedule">
          <p className="m-0"><strong>{t('email.archiveTitle')}</strong></p>
          <p className="text-muted text-sm m-0">{t('email.archiveHint')}</p>
          <div className="inbox-chips" role="group" aria-label={t('email.archiveTitle')}>
            {archiveChoices.map((days) => (
              <button key={days} type="button" className="inbox-chip" aria-pressed={archiveDays === days} onClick={() => void handleArchive(days)}>
                {days === 0 ? t('email.archiveNever') : t('email.archiveDays', { count: days })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cluster">
        {status.connected ? (
          <>
            <button className="btn btn-primary" disabled={syncing} onClick={handleSync}>
              {syncing ? t('email.syncing') : t('email.syncButton')}
            </button>
            <button type="button" className="btn btn-danger-soft" onClick={() => void handleDisconnect()}>
              {t('email.disconnect')}
            </button>
          </>
        ) : (
          <>
            <a className="btn btn-primary" onClick={(e) => { e.preventDefault(); void handleConnect(); }}>
              <Icon name="link" size={14} />
              {t('email.connect')}
            </a>
          </>
        )}
        <button type="button" className="btn btn-danger-soft" onClick={() => void handleReset()}>
          {t('email.reset')}
        </button>
      </div>
    </section>
  );
}