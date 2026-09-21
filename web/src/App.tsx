import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthProvider';
import { DataProvider } from './state/DataProvider';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Records from './pages/Records';
import Truckloads from './pages/Truckloads';
import Live from './pages/Live';
import Manage from './pages/Manage';
import Account from './pages/Account';

// Recharts and the Google Maps SDK are the two heaviest dependencies, and
// neither is needed to sign in or read the records table. Splitting them out
// keeps the first load small, which matters on a field connection.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MapView = lazy(() => import('./pages/MapView'));

export default function App() {
  const { session, loading } = useAuth();

  // Without this gate the login form flashes for a moment on every reload
  // while getSession() reads the persisted token.
  if (loading) return <Spinner label="Checking your session…" />;

  // A recovery link has to be matched on path, not on session. Supabase
  // consumes the token on load and creates a session, so the checks below would
  // otherwise treat the visitor as signed in and drop them on the dashboard —
  // which is exactly what made the reset email look like it did nothing.
  if (window.location.pathname === '/reset-password') {
    return (
      <Routes>
        <Route path="*" element={<ResetPassword />} />
      </Routes>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={<Spinner />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route path="records" element={<Records />} />
          <Route path="truckloads" element={<Truckloads />} />
          <Route path="live" element={<Live />} />
          <Route
            path="map"
            element={
              <Suspense fallback={<Spinner label="Loading map…" />}>
                <MapView />
              </Suspense>
            }
          />
          <Route path="manage" element={<Manage />} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}
