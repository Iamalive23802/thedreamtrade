import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import LeadsPage from './pages/LeadsPage';
import TeamsPage from './pages/TeamsPage';
import AssignTeamPage from './pages/AssignTeamPage';
import LoginPage from './pages/LoginPage';
import OfficeOnlyPage from './pages/OfficeOnlyPage';
import ClientsPage from './pages/Clientpage';
import AllClientsPage from './pages/AllClientsPage';
import TestMetaleadsPage from './pages/TestMetaleadsPage';
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingScreen from './components/LoadingScreen';
import { useAuthStore } from './stores/authStore';
import { checkNetworkAccess } from './utils/networkAccess';

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
      <Routes>
        <Route path="/office-only" element={<OfficeOnlyPage />} />
      </Routes>
    );
  }

  if (!networkAllowed && isAuthenticated && !isSuperAdmin) {
    return (
      <Routes>
        <Route path="*" element={<OfficeOnlyPage />} />
      </Routes>
    );
  }

  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
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
            <ProtectedRoute allowedRoles={['financial_manager']}>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
