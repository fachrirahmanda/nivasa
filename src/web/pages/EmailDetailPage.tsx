import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../auth';
import { usePrefs } from '../prefs';
import { Icon } from '../components/Icon';
import { SkeletonRows } from '../components/Skeleton';
import { type EmailItem, extractAvatarFromBody, initialsOf, senderAddress, senderName } from '../emailHelpers';

/** The open email, read-only, in the pane beside the list (full width on phones, with a back button). */
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

  const back = (
    <button type="button" className="btn btn-ghost btn-sm inbox-back" onClick={onBack}>
      <Icon name="chevron-left" size={16} />
      <span>{t('email.back')}</span>
    </button>
  );

  if (error) {
    return (
      <div className="mail-reader">
        {back}
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="mail-reader">
        {back}
        <SkeletonRows count={3} />
      </div>
    );
  }

  const avatarUrl = extractAvatarFromBody(email.body);
  const date = new Date(email.received_at).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="mail-reader">
      {back}
      <header className="mail-reader-head">
        <div className="mail-sender">
          <span className="mail-avatar mail-avatar-lg" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(email.from_email)}
          </span>
          <div>
            <strong>{senderName(email.from_email)}</strong>
            <span>{senderAddress(email.from_email)}</span>
          </div>
        </div>
        <time className="mail-reader-date" dateTime={email.received_at}>{date}</time>
      </header>

      <h2 className="mail-reader-subject">{email.subject || '(no subject)'}</h2>
      <div className="mail-reader-body email-detail-body" dangerouslySetInnerHTML={{ __html: email.body }} />
    </article>
  );
}
