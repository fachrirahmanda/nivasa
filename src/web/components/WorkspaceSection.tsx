import { useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../auth';
import { useWorkspace } from '../data';
import { usePrefs } from '../prefs';
import { formatDate, localeOf } from '../format';
import { isActive } from '../../shared/types';
import { Icon } from './Icon';
import { SkeletonSettingsCard } from './Skeleton';

/** The admin creates an account for a member: username, email, name and a password. The owner then invites
 *  that email from the same tab, and the member signs in with the username and password. */
function CreateMemberCard() {
  const { t } = usePrefs();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      await api.post('/members', form);
      setMessage(t('members.created', { username: form.username }));
      setForm({ name: '', username: '', email: '', password: '' });
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : t('members.createFailed'));
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  const ready = form.name && form.username && form.email && form.password;

  return (
    <div className="card ws-card">
      <div className="ws-card-head">
        <h4 className="m-0">{t('members.createTitle')}</h4>
        <p className="hint m-0">{t('members.createHint')}</p>
      </div>
      <form className="ws-invite" onSubmit={(event) => void create(event)} noValidate>
        <input className="input grow" value={form.name} onChange={set('name')} placeholder={t('members.fieldName')} aria-label={t('members.fieldName')} required />
        <input className="input grow" value={form.username} onChange={set('username')} placeholder={t('members.fieldUsername')} aria-label={t('members.fieldUsername')} required />
        <input className="input grow" type="email" value={form.email} onChange={set('email')} placeholder={t('members.fieldEmail')} aria-label={t('members.fieldEmail')} required />
        <input className="input grow" type="password" value={form.password} onChange={set('password')} placeholder={t('members.fieldPassword')} aria-label={t('members.fieldPassword')} required />
        <button type="submit" className="btn btn-primary" disabled={saving || !ready}>{t('members.createButton')}</button>
      </form>
      {message && <p className="text-sm m-0">{message}</p>}
      {error && <p className="text-danger text-sm m-0" role="alert">{error}</p>}
    </div>
  );
}

/** "Active now" with a green dot, or when they were last active ("Active 5 minutes ago"). */
function Presence({ lastSeenAt }: { lastSeenAt?: string | null }) {
  const { t, lang } = usePrefs();
  if (isActive(lastSeenAt)) {
    return (
      <span className="presence is-active">
        <i aria-hidden="true" />
        {t('presence.active')}
      </span>
    );
  }
  if (!lastSeenAt) return <span className="presence">{t('presence.never')}</span>;
  const seconds = (Date.now() - new Date(`${lastSeenAt.replace(' ', 'T')}Z`).getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
  const ago =
    seconds < 3600
      ? format.format(-Math.max(1, Math.round(seconds / 60)), 'minute')
      : seconds < 86_400
        ? format.format(-Math.round(seconds / 3600), 'hour')
        : format.format(-Math.round(seconds / 86_400), 'day');
  return (
    <span className="presence">
      <i aria-hidden="true" />
      {t('presence.lastSeen', { ago })}
    </span>
  );
}

// Settings → Workspace: whose data this is, who shares it, the invitations waiting on each side. People
// show with their photo; actions are icon buttons with their names kept as tooltips.

/** A person's photo, or their initials on a soft circle when there is no photo. */
function PersonAvatar({ name, email, avatarUrl, size = 40 }: { name: string; email: string; avatarUrl?: string | null; size?: number }) {
  const source = name.trim() || email.split('@')[0];
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  return (
    <span className="ws-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

/** Settings section: the shared data set, its members, invitations sent, and invitations received. */
/** view: 'data' is your data and pending invitations; 'members' is who is in it and inviting people. */
export function WorkspaceSection({ view = 'data' }: { view?: 'data' | 'members' }) {
  const { user } = useAuth();
  const { t, lang } = usePrefs();
  const { state, reload, failed } = useWorkspace();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  if (state === null) {
    return failed ? null : <SkeletonSettingsCard lines={3} />;
  }
  const { workspace, invitations } = state;
  const isOwner = workspace.role === 'owner';
  const ownerName = workspace.ownerName || workspace.ownerEmail;

  // Joining or leaving a data set changes everything on screen, so the app reloads after it.
  async function run(action: () => Promise<unknown>, done: string, reloadApp = false) {
    setError('');
    try {
      await action();
      window.DS?.toast(done, { variant: 'success' });
      if (reloadApp) {
        window.location.reload();
        return;
      }
      await reload();
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : t('common.error.network'));
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const address = email.trim();
    await run(() => api.post('/workspace/invites', { email: address }), t('ws.inviteSent', { email: address }));
    setEmail('');
    setSending(false);
  }

  return (
    <section className="settings-section ws" aria-labelledby="settings-workspace">
      <div className="settings-section-head">
        <h3 id="settings-workspace">{view === 'members' ? t('members.title') : t('ws.yourData')}</h3>
        <p className="hint">{view === 'members' ? t('members.subtitle') : t('ws.subtitle')}</p>
      </div>

      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}

      {view === 'data' && invitations.length > 0 && (
        <div className="card ws-card">
          <div className="ws-card-head">
            <h4 className="m-0">{t('ws.incoming')}</h4>
            <p className="hint m-0">{t('ws.incomingHint')}</p>
          </div>
          {invitations.map((invitation) => {
            const from = invitation.ownerName || invitation.ownerEmail;
            return (
              <div key={invitation.id} className="ws-row">
                <PersonAvatar name={from} email={invitation.ownerEmail} />
                <div className="grow ws-row-text">
                  <strong className="truncate">{from}</strong>
                  <span className="text-sm text-muted">{t('ws.invitedOn', { date: formatDate(invitation.createdAt.slice(0, 10), lang) })}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn icon-btn-plain"
                  aria-label={t('ws.decline')}
                  title={t('ws.decline')}
                  onClick={() => void run(() => api.post(`/workspace/invites/${invitation.id}/decline`), t('ws.decline'))}
                >
                  <Icon name="x" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-plain ws-accept"
                  aria-label={t('ws.accept')}
                  title={t('ws.accept')}
                  onClick={() =>
                    void run(() => api.post(`/workspace/invites/${invitation.id}/accept`), t('ws.joined', { owner: from }), true)
                  }
                >
                  <Icon name="check" size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {view === 'data' && (
      <div className="card ws-card ws-hero">
        <PersonAvatar name={workspace.ownerName} email={workspace.ownerEmail} avatarUrl={workspace.ownerAvatarUrl} size={52} />
        <div className="grow ws-row-text">
          <strong className="truncate">{isOwner ? t('ws.yourData') : ownerName}</strong>
          <span className="text-sm text-muted truncate">{isOwner ? workspace.ownerEmail : t('ws.memberOf', { owner: ownerName })}</span>
        </div>
        <span className={`badge ${isOwner ? 'badge-success' : ''}`}>{isOwner ? t('ws.owner') : t('ws.member')}</span>
        {!isOwner && (
          <button
            type="button"
            className="icon-btn icon-btn-plain"
            aria-label={t('ws.leave')}
            title={t('ws.leave')}
            onClick={() => {
              if (!window.confirm(t('ws.confirmLeave', { owner: ownerName }))) return;
              void run(() => api.post('/workspace/leave'), t('ws.leave'), true);
            }}
          >
            <Icon name="logout" size={16} />
          </button>
        )}
      </div>

      )}

      {view === 'members' && user?.isAdmin && <CreateMemberCard />}

      {view === 'members' && isOwner && (
        <div className="card ws-card">
          <div className="ws-card-head">
            <h4 className="m-0">{t('ws.members')}</h4>
            <p className="hint m-0">{t('ws.ownData')}</p>
          </div>
          <div className="ws-members">
            {workspace.members.map((member) => (
              <div key={member.userId} className="ws-person">
                <PersonAvatar name={member.name} email={member.email} avatarUrl={member.avatarUrl} />
                <div className="grow ws-row-text">
                  <strong className="truncate">{member.name || member.email}</strong>
                  <span className="text-sm text-muted truncate">{member.email}</span>
                  <Presence lastSeenAt={member.lastSeenAt} />
                </div>
                {member.role === 'owner' ? (
                  <span className="badge badge-success">{t('ws.owner')}</span>
                ) : (
                  <button
                    type="button"
                    className="icon-btn icon-btn-soft text-danger"
                    aria-label={t('ws.remove')}
                    title={t('ws.remove')}
                    onClick={() => {
                      if (!window.confirm(t('ws.confirmRemove', { name: member.name || member.email }))) return;
                      void run(() => api.delete(`/workspace/members/${member.userId}`), t('ws.remove'));
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {workspace.members.length <= 1 && <p className="hint m-0">{t('ws.onlyYou')}</p>}
        </div>
      )}

      {view === 'members' && isOwner && (
        <div className="card ws-card">
          <div className="ws-card-head">
            <h4 className="m-0">{t('ws.invite')}</h4>
          </div>
          <form className="ws-invite" onSubmit={(event) => void invite(event)} noValidate>
            <input
              type="email"
              className="input grow"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              aria-label={t('ws.invite')}
              required
            />
            <button type="submit" className="ws-send" disabled={sending || !email.trim()} aria-label={t('ws.inviteButton')} title={t('ws.inviteButton')}>
              <Icon name="send" size={16} />
            </button>
          </form>

          {workspace.invites.length > 0 && (
            <div className="ws-chips">
              <span className="text-sm text-muted">{t('ws.pending')}</span>
              {workspace.invites.map((invite) => (
                <span key={invite.id} className="ws-chip" title={t('ws.invitedOn', { date: formatDate(invite.createdAt.slice(0, 10), lang) })}>
                  <Icon name="mail" size={14} />
                  <span className="truncate">{invite.email}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm icon-btn-plain"
                    aria-label={t('ws.revoke')}
                    title={t('ws.revoke')}
                    onClick={() => void run(() => api.delete(`/workspace/invites/${invite.id}`), t('ws.revoke'))}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
