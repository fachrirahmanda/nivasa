import type { CSSProperties, ReactNode } from 'react';
import { usePrefs } from '../prefs';

// Placeholders that match each screen's layout, so content does not jump when it arrives.
// Built on Basis's .bone shimmer. Screen readers hear one "Loading" status per placeholder.

export function Bone({ w = '100%', h = 12, r, circle, style }: { w?: number | string; h?: number; r?: number; circle?: boolean; style?: CSSProperties }) {
  return <span className="bone" style={{ width: w, height: h, borderRadius: circle ? '50%' : r, ...style }} aria-hidden="true" />;
}

function Busy({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = usePrefs();
  return (
    <div className={className} role="status" aria-busy="true" aria-label={t('common.loading')}>
      {children}
    </div>
  );
}

/** A list of rows: a round badge, two text lines, and an amount on the right. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <Busy className="skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Bone w={32} h={32} circle />
          <span className="skeleton-row-lines">
            <Bone w={`${62 - (i % 3) * 8}%`} h={12} />
            <Bone w={`${36 + (i % 2) * 12}%`} h={9} />
          </span>
          <Bone w={64} h={12} />
        </div>
      ))}
    </Busy>
  );
}

/** The mail list while it loads: the same rows as the inbox (avatar, sender and age, subject, preview). */
export function SkeletonMailList({ count = 7 }: { count?: number }) {
  return (
    <Busy className="skeleton-mail-list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-mail-row">
          <Bone w={36} h={36} circle />
          <span className="skeleton-mail-lines">
            <span className="skeleton-mail-top">
              <Bone w={`${40 + (i % 3) * 10}%`} h={11} />
              <Bone w={28} h={10} />
            </span>
            <Bone w={`${70 - (i % 2) * 14}%`} h={12} />
            <Bone w={`${86 - (i % 3) * 12}%`} h={10} />
          </span>
        </div>
      ))}
    </Busy>
  );
}

/** The open mail while it loads: sender row, title, and the body lines. */
export function SkeletonMailReader() {
  return (
    <Busy className="skeleton-reader">
      <div className="skeleton-reader-head">
        <span className="skeleton-reader-sender">
          <Bone w={44} h={44} circle />
          <span className="skeleton-mail-lines">
            <Bone w={140} h={12} />
            <Bone w={220} h={10} />
          </span>
        </span>
        <Bone w={150} h={10} />
      </div>
      <Bone w="72%" h={22} />
      <div className="skeleton-reader-body">
        {[100, 96, 88, 100, 62, 92, 80].map((w, i) => (
          <Bone key={i} w={`${w}%`} h={11} />
        ))}
      </div>
    </Busy>
  );
}

/** Dashboard placeholder: three stat cards, then two panels. */
export function SkeletonDashboard() {
  return (
    <Busy className="skeleton-dashboard">
      <div className="stat-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stat">
            <Bone w="40%" h={10} />
            <Bone w="62%" h={26} />
          </div>
        ))}
      </div>
      <div className="dash-grid">
        {[0, 1].map((i) => (
          <div key={i} className="dash-panel">
            <Bone w="38%" h={14} />
            <SkeletonRows count={4} />
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** Transaction form placeholder: the amount box, chips, and the category grid. */
export function SkeletonForm() {
  return (
    <Busy className="skeleton-form">
      <div className="tx-amount" style={{ boxShadow: 'inset 0 0 0 1px var(--separator)' }}>
        <Bone w="22%" h={10} />
        <Bone w="48%" h={40} />
      </div>
      <div className="chip-row">
        {[70, 56, 64, 60].map((w, i) => (
          <Bone key={i} w={w} h={34} r={999} />
        ))}
      </div>
      <div className="category-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} h={52} r={12} />
        ))}
      </div>
    </Busy>
  );
}

/** A settings card while its data loads: a title, a few text lines and two buttons. */
export function SkeletonSettingsCard({ lines = 2 }: { lines?: number }) {
  return (
    <Busy className="card skeleton-settings-card">
      <div className="card-body stack">
        <Bone w="30%" h={16} />
        {Array.from({ length: lines }, (_, i) => (
          <Bone key={i} w={`${82 - i * 18}%`} h={10} />
        ))}
        <div className="cluster">
          <Bone w={130} h={34} r={8} />
          <Bone w={96} h={34} r={8} />
        </div>
      </div>
    </Busy>
  );
}
