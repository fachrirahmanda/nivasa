  import { Navigate, Route, Routes } from 'react-router';
  import { AuthProvider, RequireAuth } from './auth';
  import { Layout } from './components/Layout';
  import { PrefsProvider } from './prefs';
  import { LoginPage } from './pages/LoginPage';
  import { SettingsPage } from './pages/SettingsPage';
  import { EmailInboxPage } from './pages/EmailInboxPage';
  import { EmailDetailPage } from './pages/EmailDetailPage';
  import { ProfilePage } from './pages/ProfilePage';
  
  export function App() {
    return (
      <PrefsProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/masuk" element={<Navigate to="/login" replace />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/emails" replace />} />
                <Route path="emails" element={<EmailInboxPage />} />
                <Route path="emails/:id" element={<EmailDetailPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/emails" replace />} />
          </Routes>
        </AuthProvider>
      </PrefsProvider>
    );
  }
