import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { Icon } from '../components/Icon';
import { SkeletonRows } from '../components/Skeleton';
import { type EmailItem, extractAvatarFromBody, initialsOf, detectActionButton } from '../emailHelpers';

/** The open email, shown in the pane beside the inbox list (full width on phones, with a back button). */
export function EmailDetailPane({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, lang } = usePrefs();
  const { user } = useAuth();
  const [email, setEmail] = useState<EmailItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setEmail(null);
    setError('');
    (async () => {
      try {
        // Fetched from Gmail for this view; the body is not stored in the database.
        const data = await api.get<EmailItem>(`/emails/${id}/full`);
        if (cancelled) return;
        setEmail(data);
        void api.post(`/emails/${id}/read`).catch(() => {});
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'Gagal memuat email');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!user) return null;

  if (error) {
    return (
      <div className="inbox-detail-body">
        <button type="button" className="btn btn-ghost btn-sm inbox-back" onClick={onBack}>
          <Icon name="chevron-left" size={16} />
          <span>{t('email.back')}</span>
        </button>
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="inbox-detail-body">
        <SkeletonRows count={3} />
      </div>
    );
  }

  const avatarUrl = extractAvatarFromBody(email.body);
  const action = detectActionButton(email.body);
  const date = new Date(email.received_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <article className="inbox-detail-body">
      <button type="button" className="btn btn-ghost btn-sm inbox-back" onClick={onBack}>
        <Icon name="chevron-left" size={16} />
        <span>{t('email.back')}</span>
      </button>

      <header className="inbox-detail-head">
        <h2>{email.subject}</h2>
        <div className="inbox-detail-meta">
          <span className="inbox-avatar" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(email.from_email)}
          </span>
          <div>
            <strong>{email.from_email}</strong>
            <span>{date}</span>
          </div>
        </div>
        <div className="inbox-detail-actions">
          {action && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => console.log('Action clicked:', email.id, action)}>
              {action}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void api.post(`/emails/${email.id}/read`).catch(() => {})}>
            <Icon name="check" size={14} />
            <span>{t('email.markRead')}</span>
          </button>
        </div>
      </header>

      <div className="inbox-detail-content email-detail-body" dangerouslySetInnerHTML={{ __html: email.body }} />
    </article>
  );
}
