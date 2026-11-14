import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth';
import type { MessageKey } from '../i18n';
import { useWorkspace } from '../data';
import { usePrefs } from '../prefs';
import { ThemeSwitch } from './ThemeSwitch';
import { Icon } from './Icon';
import { UserMenu } from './UserMenu';
import { Dialog } from './Dialog';
import { SideSlotContext, usePhone } from './SidePanel';
import { AddPanel, type AddKind } from './AddPanel';

/** Two letters for an avatar without a picture: from the name, or the start of the email address. */
function initialsOf(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0];
  const parts = source.split(/[s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const ICON = {
  dashboard: <Icon name="home" size={18} />,
  add: <Icon name="plus" size={18} />,
  transactions: <Icon name="list" size={18} />,
  split: <Icon name="receipt" size={18} />,
  calculator: <Icon name="calculator" size={18} />,
  bills: <Icon name="note" size={18} />,
  recurring: <Icon name="sprint" size={18} />,
  reports: <Icon name="chart" size={18} />,
  settings: <Icon name="settings" size={18} />,
  profile: <Icon name="user" size={18} />,
  archive: <Icon name="folder" size={18} />,
  devices: <Icon name="storage" size={18} />,
  ask: <Icon name="comment" size={18} />,
  budgets: <Icon name="target" size={18} />,
  loans: <Icon name="coins" size={18} />,
  categories: <Icon name="tag" size={18} />,
  wallets: <Icon name="wallet" size={18} />,
  creditCard: <Icon name="card" size={18} />,
  mail: <Icon name="mail" size={18} />,
  more: <Icon name="more" size={18} />,
};

interface Tab {
  to: string;
  label: MessageKey;
  icon: ReactNode;
  group: 'home' | 'account';
  /** Shown in the phone bar. The rest sit behind "More". */
  primary: boolean;
  /** Listed in the desktop sidebar. False keeps it in the phone bar only. */
  sidebar?: boolean;
}

const BOTTOM_PATHS = ['/dashboard', '/reports', '/add', '/transactions'];

const TABS: Tab[] = [
  { to: '/emails', label: 'nav.inbox', icon: ICON.mail, group: 'home', primary: true },
  { to: '/archived', label: 'nav.archived', icon: ICON.archive, group: 'home', primary: false },
  { to: '/devices', label: 'nav.devices', icon: ICON.devices, group: 'home', primary: false },
  { to: '/settings', label: 'nav.settings', icon: ICON.settings, group: 'account', primary: true },
  { to: '/profile', label: 'nav.profile', icon: ICON.profile, group: 'account', primary: false },
];

const GROUP_LABELS: Record<Tab['group'], MessageKey> = {
  home: 'nav.groupHome',
  account: 'nav.groupAccount',
};

const GROUP_ORDER: Tab['group'][] = ['home', 'account'];


const COLLAPSED_KEY = 'neraca.sidebar';

export function Layout() {
  const { user, signOut } = useAuth();
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const invitations = state?.invitations ?? [];
  const [more, setMore] = useState(false);
  const [drawer, setDrawer] = useState(false);
  // The bottom bar's Add: a popup on phones, with the tab for the kind of thing to add last used.
  const phone = usePhone();
  const [adding, setAdding] = useState(false);
  // The panel mounts on first use, so pages do not load categories and sources until someone adds something.
  const [addUsed, setAddUsed] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('expense');
  const [account, setAccount] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  // Phones: the sidebar drawer closes after a page is opened.
  useEffect(() => setDrawer(false), [location.pathname, location.search]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        // Storage can be blocked; the sidebar then simply starts expanded next time.
      }
      return next;
    });
  }

  // The phone bar: Home, Reports, Add (in the middle), Transactions, and More for everything else.
  const primaryTabs = BOTTOM_PATHS.map((path) => TABS.find((tab) => tab.to === path)).filter((tab): tab is Tab => tab !== undefined);
  const moreTabs = TABS.filter((tab) => !BOTTOM_PATHS.includes(tab.to));

  const [sideSlot, setSideSlot] = useState<HTMLElement | null>(null);
  return (
    <div className={`app${collapsed ? ' is-collapsed' : ''}${drawer ? ' drawer-open' : ''}`}>
      <aside className="sidebar" aria-label={t('nav.menu')}>
        <div className="sidebar-head">
          <NavLink to="/dashboard" className="sidebar-brand">
            <img src="/favicon.svg" alt="" width="32" height="32" />
            <span className="sidebar-text">Nivasa</span>
          </NavLink>
          <div className="sidebar-head-actions">
            <button type="button" className="icon-btn icon-btn-sm icon-btn-plain sidebar-close" onClick={() => setDrawer(false)} aria-label={t('nav.menu')} title={t('nav.menu')}>
              <Icon name="sidebar-close" size={16} />
            </button>
            <button type="button" className="icon-btn icon-btn-sm icon-btn-plain sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? t('nav.expand') : t('nav.collapse')} title={collapsed ? t('nav.expand') : t('nav.collapse')}>
              <Icon name={collapsed ? 'sidebar-open' : 'sidebar-close'} size={16} />
            </button>
          </div>
        </div>

        <div className="sidebar-scroller"><nav className="sidebar-nav" aria-label={t('nav.menu')}>
          {GROUP_ORDER.map((group) => (
            <div key={group} className="sidebar-group">
              <p className="sidebar-label">{t(GROUP_LABELS[group])}</p>
              <div>
                {TABS.filter((tab) => tab.group === group && tab.sidebar !== false).map((tab) => (
                  <NavLink key={tab.label} to={tab.to} className="side-link" title={t(tab.label)}>
                    {tab.icon}
                    <span className="sidebar-text">{t(tab.label)}</span>

                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav></div>

        <div className="sidebar-foot">
          <ThemeSwitch />
          {user && (
            <UserMenu
              name={user.name}
              email={user.email}
              initials={initialsOf(user.name, user.email)}
              avatarUrl={user.avatarUrl}
              onProfile={() => navigate('/profile')}
              onSignOut={() => void signOut()}
            />
          )}
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />

      <div className="app-content"><div className="app-scroll"><header className="mobile-bar">
        <button type="button" className="icon-btn icon-btn-plain" onClick={() => setDrawer(true)} aria-label={t('nav.menu')} aria-expanded={drawer}>
          <Icon name="menu" size={18} />
        </button>
        <NavLink to="/dashboard" className="sidebar-brand">
          <img src="/favicon.svg" alt="" width="26" height="26" />
          <span>Nivasa</span>
        </NavLink>
        {user && (
          <button type="button" className="mobile-avatar" onClick={() => setAccount(true)} aria-label={t('nav.account')}>
            <span className="avatar avatar-sm" aria-hidden="true">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(user.name, user.email)}
            </span>
          </button>
        )}
      </header>

      <main className="app-main">
        <div className="container page">
        {invitations.length > 0 && (
          <div className="alert alert-info invite-banner" role="status">
            <div className="alert-content">
              <p>{t('ws.banner', { owner: invitations[0].ownerName || invitations[0].ownerEmail })}</p>
            </div>
            <NavLink to="/settings" className="dash-link">
              {t('ws.bannerLink')}
            </NavLink>
          </div>
        )}
        <SideSlotContext value={sideSlot}>
          <Outlet />
        </SideSlotContext>
        </div>
        <div className="app-side" ref={setSideSlot} />
      </main>
      </div></div>

      <Dialog open={account} onClose={() => setAccount(false)} title={user?.name || user?.email || ''} className="ds-sheet">
        {user && <p className="text-sm text-muted">{user.email}</p>}
        <nav className="more-list" aria-label={t('nav.account')}>
          <button type="button" className="more-item" onClick={() => { setAccount(false); navigate('/profile'); }}>
            <span className="more-icon"><Icon name="user" size={18} /></span>
            {t('nav.profile')}
            <Icon name="chevron-right" size={16} className="more-chevron" />
          </button>
          <button type="button" className="more-item" onClick={() => { setAccount(false); void signOut(); }}>
            <span className="more-icon"><Icon name="logout" size={18} /></span>
            {t('nav.signOut')}
          </button>
        </nav>
      </Dialog>

      {phone && addUsed && <AddPanel open={adding} onClose={() => setAdding(false)} kind={addKind} onKindChange={setAddKind} onSaved={() => setAdding(false)} />}

      <Dialog open={more} onClose={() => setMore(false)} title={t('nav.more')} className="ds-sheet">
        <nav className="more-list" aria-label={t('nav.more')}>
          {GROUP_ORDER.filter((group) => moreTabs.some((tab) => tab.group === group)).map((group) => (
            <div key={group} className="more-group">
              <p className="more-group-label">{t(GROUP_LABELS[group])}</p>
              {moreTabs
                .filter((tab) => tab.group === group)
                .map((tab) => (
                  <NavLink key={tab.label} to={tab.to} className="more-item" onClick={() => setMore(false)}>
                    <span className="more-icon">{tab.icon}</span>
                    {t(tab.label)}
                    <Icon name="chevron-right" size={16} className="more-chevron" />
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
      </Dialog>

      <nav className="bottom-nav" aria-label={t('nav.menu')}>
        {primaryTabs.map((tab) =>
          tab.to === '/add' ? (
            // Add opens the Add form in a popup instead of going to one page.
            <button
              key={tab.to}
              type="button"
              className="fab"
              aria-haspopup="dialog"
              onClick={() => {
                setAddUsed(true);
                setAdding(true);
              }}
            >
              {tab.icon}
              <span className="visually-hidden">{t(tab.label)}</span>
            </button>
          ) : (
            <NavLink key={tab.to} to={tab.to} className="bottom-nav-item">
              <span>{tab.icon}</span>
              <span>{t(tab.label)}</span>
            </NavLink>
          ),
        )}
        {moreTabs.length > 0 && (
          <button
            type="button"
            className={`bottom-nav-item${more || moreTabs.some((tab) => tab.to === location.pathname) ? ' active' : ''}`}
            aria-expanded={more}
            onClick={() => setMore((open) => !open)}
          >
            {ICON.more}
            <span>{t('nav.more')}</span>
          </button>
        )}
      </nav>
    </div>
  );
}
