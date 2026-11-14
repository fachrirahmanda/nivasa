import { useSearchParams } from 'react-router';
import { useAuth } from '../auth';
import { WorkspaceSection } from '../components/WorkspaceSection';
import { EmailSection } from '../components/EmailSection';
import { usePrefs } from '../prefs';

export function SettingsPage() {
  const { t } = usePrefs();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const requested = params.get('tab') ?? 'workspace';

  // Gmail is the admin's: members do not see that tab.
  const tabs = [
    { id: 'workspace', label: t('settings.tabWorkspace') },
    ...(user?.isAdmin ? [{ id: 'gmail', label: t('settings.tabGmail') }] : []),
  ];
  const tab = tabs.some((item) => item.id === requested) ? requested : 'workspace';
  const setTab = (id: string) => setParams({ tab: id }, { replace: true });

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{t('settings.title')}</h2>
          <p className="hint">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="tabs settings-tabs" role="tablist" aria-label={t('settings.title')}>
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" className="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'workspace' && <WorkspaceSection />}
      {tab === 'gmail' && <EmailSection />}
    </>
  );
}
