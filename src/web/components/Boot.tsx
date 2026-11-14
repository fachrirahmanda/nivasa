import { usePrefs } from '../prefs';

/** The Nivasa icon (the family in a TV, the same artwork as favicon.svg), shown while the app starts or the session
 *  is checked. Same drawing as the preloader in index.html, and its animation comes from the rules there, so the
 *  hand-over from the first paint to React is seamless. */
export function Boot() {
  const { t } = usePrefs();
  return (
    <div className="boot" role="status" aria-label={t('common.loading')}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="boot-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3d2a20" />
            <stop offset="1" stopColor="#2a1a12" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#boot-g)" />
        <rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="none" stroke="#fff" strokeOpacity=".14" />
        <rect x="3.5" y="5" width="25" height="18" rx="3.5" fill="none" stroke="#f5f0e6" strokeWidth="2" />
        <rect className="boot-screen" x="6" y="7.5" width="20" height="13" rx="1.5" fill="#f5f0e6" fillOpacity=".08" />
        <path d="M12 23v3.5M20 23v3.5M9 26.5h14" fill="none" stroke="#f5f0e6" strokeWidth="2" strokeLinecap="round" />
        <g transform="translate(8 6) scale(0.5)">
          <g className="boot-person boot-person-1">
            <circle cx="9.5" cy="12" r="3" fill="#f5f0e6" />
            <path d="M3.5 25V21.5Q3.5 16.5 8 16.5H11Q15.5 16.5 15.5 21.5V25Z" fill="#f5f0e6" />
          </g>
          <g className="boot-person boot-person-2">
            <circle cx="22.5" cy="12" r="3" fill="#f5f0e6" />
            <path d="M16.5 25V21.5Q16.5 16.5 21 16.5H24Q28.5 16.5 28.5 21.5V25Z" fill="#f5f0e6" />
          </g>
          <path className="boot-heart" d="M16 13.2c-.9-1.6-3.6-1.2-3.6.9 0 1.6 3.6 3.6 3.6 3.6s3.6-2 3.6-3.6c0-2.1-2.7-2.5-3.6-.9z" fill="#ff5f1f" />
        </g>
      </svg>
    </div>
  );
}
