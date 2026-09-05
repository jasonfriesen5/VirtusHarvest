import { Suspense, lazy } from 'react';
import { useT } from './state/PrefsProvider';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthProvider';
import { DataProvider } from './state/DataProvider';
import { ToastProvider } from './state/ToastProvider';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Deliveries from './pages/Deliveries';
import Feedings from './pages/Feedings';
import Pens from './pages/Pens';
import PenDetail from './pages/PenDetail';
import Inventory from './pages/Inventory';
import Today from './pages/Today';
import Operators from './pages/Operators';
import Manage from './pages/Manage';
import Account from './pages/Account';

// Recharts is by far the heaviest dependency and nothing but the dashboard
// needs it, so it loads only when that page does. Matters on a rural link.
const Dashboard = lazy(() => import('./pages/Dashboard'));

export default function App() {
  const t = useT();
  const { session, loading } = useAuth();

  // Without this gate the login form flashes on every reload while
  // getSession() reads the persisted token.
  if (loading) return <Spinner label={t('Verificando la sesión…')} />;

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <DataProvider>
      <ToastProvider>
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
            <Route path="deliveries" element={<Deliveries />} />
            <Route path="feedings" element={<Feedings />} />
            <Route path="pens" element={<Pens />} />
            <Route path="pens/:lotId" element={<PenDetail />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="today" element={<Today />} />
            <Route path="operators" element={<Operators />} />
            <Route path="manage" element={<Manage />} />
            <Route path="account" element={<Account />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </DataProvider>
  );
}
