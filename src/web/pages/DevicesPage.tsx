import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { usePrefs } from '../prefs';
import { relativeTime } from '../emailHelpers';
import { SkeletonRows } from '../components/Skeleton';

interface DeviceRow {
  name: string;
  count: number;
  unread: number;
  lastAt: string;
}

/** The devices that asked for a request, newest first. Opening one shows its mail in the list. */
export function DevicesPage() {
  const { t, lang } = usePrefs();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get<{ devices: DeviceRow[] }>('/emails/devices')
      .then((res) => setDevices(res.devices))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="devices-page">
      <div className="page-header">
        <div>
          <h2>{t('devices.title')}</h2>
          <p className="hint">{t('devices.subtitle')}</p>
        </div>
      </div>

      {failed && <p className="text-danger">{t('devices.loadFailed')}</p>}
      {!failed && devices === null && <SkeletonRows count={4} />}

      {devices && devices.length === 0 && <p className="text-muted">{t('devices.empty')}</p>}

      {devices && devices.length > 0 && (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.name}>
              <button type="button" className="card device-row" onClick={() => navigate(`/emails?device=${encodeURIComponent(d.name)}`)}>
                <span className="device-name">{d.name}</span>
                <span className="device-meta text-muted">
                  {t('devices.count', { count: d.count })}
                  {d.unread > 0 && <> · {t('devices.unread', { count: d.unread })}</>}
                  {' · '}
                  {relativeTime(d.lastAt, lang)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
