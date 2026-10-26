import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingScreen from './components/LoadingScreen';
import { useAuthStore } from './stores/authStore';
import { checkNetworkAccess } from './utils/networkAccess';
import { homePathForRole } from './utils/homePath';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const AssignTeamPage = lazy(() => import('./pages/AssignTeamPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const OfficeOnlyPage = lazy(() => import('./pages/OfficeOnlyPage'));
const ClientsPage = lazy(() => import('./pages/Clientpage'));
const AllClientsPage = lazy(() => import('./pages/AllClientsPage'));
const TestMetaleadsPage = lazy(() => import('./pages/TestMetaleadsPage'));
const WhatsAppInboxPage = lazy(() => import('./pages/WhatsAppInboxPage'));

function App() {
  const { isAuthenticated, loading, checkAuth } = useAuthStore();
  const [appReady, setAppReady] = useState(false);
  const [networkAllowed, setNetworkAllowed] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const init = async () => {
      try {
        const [networkResult] = await Promise.all([
          checkNetworkAccess(),
          Promise.resolve(checkAuth())
        ]);
        setNetworkAllowed(!networkResult.restrictionEnabled || networkResult.allowed);
      } catch {
        setNetworkAllowed(true);
      } finally {
        setAppReady(true);
      }
    };
    init();
  }, [checkAuth]);

  const role = (sessionStorage.getItem('role') || '').toLowerCase();
  const isSuperAdmin = role === 'super_admin';

  if (!appReady || loading) {
    return <LoadingScreen />;
  }

  if (location.pathname === '/office-only') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/office-only" element={<OfficeOnlyPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (!networkAllowed && isAuthenticated && !isSuperAdmin) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="*" element={<OfficeOnlyPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={homePathForRole(role)} replace />
          ) : (
            <Suspense fallback={<LoadingScreen />}>
              <LoginPage />
            </Suspense>
          )
        }
      />
      <Route path="/" element={<Layout />}>
        <Route
          index
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin', 'team_leader']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="leads"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager']}>
              <LeadsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teams"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
              <TeamsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="assign-team"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <AssignTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="clients"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager']}>
              <ClientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="all-clients"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager']}>
              <AllClientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="whatsapp"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <WhatsAppInboxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="test-metaleads"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <TestMetaleadsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={homePathForRole(role)} replace />} />
      </Route>
    </Routes>
  );
}

export default App;
