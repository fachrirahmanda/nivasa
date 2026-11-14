/** A small illustration for the empty mail list: an envelope with a letter coming out, in the app's colours. */
export function MailIllustration() {
  return (
    <svg className="mail-illustration" viewBox="0 0 200 150" role="img" aria-hidden="true">
      <circle cx="100" cy="75" r="64" fill="var(--accent-soft)" />
      {/* the letter, half out of the envelope */}
      <rect x="66" y="34" width="68" height="50" rx="7" fill="var(--surface)" stroke="var(--card-edge)" strokeWidth="2" />
      <rect x="78" y="48" width="44" height="5" rx="2.5" fill="var(--fill-strong)" />
      <rect x="78" y="60" width="30" height="5" rx="2.5" fill="var(--fill-strong)" />
      {/* the envelope */}
      <rect x="48" y="58" width="104" height="70" rx="11" fill="var(--surface)" stroke="var(--card-edge)" strokeWidth="2" />
      <path d="M54 66 L100 98 L146 66" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* sparkles */}
      <path d="M152 30 L154.5 37.5 L162 40 L154.5 42.5 L152 50 L149.5 42.5 L142 40 L149.5 37.5 Z" fill="var(--accent-fill)" />
      <circle cx="40" cy="44" r="3.5" fill="var(--accent-fill)" opacity="0.6" />
      <circle cx="166" cy="104" r="4" fill="var(--accent-fill)" opacity="0.5" />
    </svg>
  );
}
