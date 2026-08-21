import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ToastContainer from './ToastContainer';
import NewLeadsAssignedModal from './modals/NewLeadsAssignedModal';
import FreeTrialAlertModal, { type FreeTrialAlert } from './modals/FreeTrialAlertModal';
import { useAuthStore } from '../stores/authStore';
import axiosInstance from '../utils/axiosConfig';

const ACK_FREE_TRIAL_KEY = 'acknowledgedFreeTrialLeads';

function loadAcknowledgedFreeTrial(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ACK_FREE_TRIAL_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveAcknowledgedFreeTrial(ids: Set<string>) {
  sessionStorage.setItem(ACK_FREE_TRIAL_KEY, JSON.stringify([...ids]));
}

function Layout() {
  const { role, userId, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isWhatsAppInbox = location.pathname.startsWith('/whatsapp');
  const isRM = role === 'relationship_mgr';
  const isAdmin = role === 'super_admin' || role === 'admin';

  const [showNewLeadsModal, setShowNewLeadsModal] = useState(false);
  const [newLeadsPopupCount, setNewLeadsPopupCount] = useState(0);
  const [freeTrialQueue, setFreeTrialQueue] = useState<FreeTrialAlert[]>([]);
  const currentFreeTrialAlert = freeTrialQueue[0] ?? null;

  const lastCheckedCount = useRef<number>(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const freeTrialIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const acknowledgedFreeTrial = useRef<Set<string>>(loadAcknowledgedFreeTrial());
  const queuedFreeTrialIds = useRef<Set<string>>(new Set());

  const openNewLeadsPopup = (count: number) => {
    if (count <= 0) return;
    setNewLeadsPopupCount(count);
    setShowNewLeadsModal(true);
  };

  const closeNewLeadsPopup = () => {
    setShowNewLeadsModal(false);
    setNewLeadsPopupCount(0);
  };

  const handleViewLeads = () => {
    closeNewLeadsPopup();
    navigate('/leads');
  };

  const enqueueFreeTrialAlerts = useCallback((alerts: FreeTrialAlert[]) => {
    if (!alerts.length) return;
    setFreeTrialQueue((prev) => {
      const next = [...prev];
      for (const alert of alerts) {
        if (acknowledgedFreeTrial.current.has(alert.id)) continue;
        if (queuedFreeTrialIds.current.has(alert.id)) continue;
        if (next.some((item) => item.id === alert.id)) continue;
        next.push(alert);
        queuedFreeTrialIds.current.add(alert.id);
      }
      return next;
    });
  }, []);

  const acknowledgeFreeTrial = (leadId: string) => {
    acknowledgedFreeTrial.current.add(leadId);
    saveAcknowledgedFreeTrial(acknowledgedFreeTrial.current);
    queuedFreeTrialIds.current.delete(leadId);
  };

  const dismissCurrentFreeTrial = () => {
    if (!currentFreeTrialAlert) return;
    acknowledgeFreeTrial(currentFreeTrialAlert.id);
    setFreeTrialQueue((prev) => prev.filter((item) => item.id !== currentFreeTrialAlert.id));
  };

  const handleCheckNowFreeTrial = () => {
    if (!currentFreeTrialAlert) return;
    const alert = currentFreeTrialAlert;
    acknowledgeFreeTrial(alert.id);
    setFreeTrialQueue((prev) => prev.filter((item) => item.id !== alert.id));
    const params = new URLSearchParams({
      status: 'Free Trial',
      leadId: alert.id,
      name: alert.fullName,
    });
    navigate(`/leads?${params.toString()}`);
  };

  useEffect(() => {
    if (!isAuthenticated || !isRM) return;
    const shouldShow = sessionStorage.getItem('showNewLeadsPopup') === 'true';
    const countStr = sessionStorage.getItem('newLeadsCount');
    const count = countStr ? parseInt(countStr, 10) : 0;
    sessionStorage.removeItem('showNewLeadsPopup');
    sessionStorage.removeItem('newLeadsCount');
    if (shouldShow && count > 0) {
      openNewLeadsPopup(count);
      lastCheckedCount.current = count;
    }
  }, [isAuthenticated, isRM]);

  useEffect(() => {
    if (!isAuthenticated || !isRM) return;
    const checkNewLeads = async () => {
      try {
        const res = await axiosInstance.get('/leads/new-count');
        const count = Number(res.data.newLeadsCount) || 0;
        if (count > lastCheckedCount.current) {
          openNewLeadsPopup(count - lastCheckedCount.current);
        }
        lastCheckedCount.current = count;
      } catch (err) {
        console.error('Failed to check new leads:', err);
      }
    };
    checkNewLeads();
    checkIntervalRef.current = setInterval(checkNewLeads, 30000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [isAuthenticated, isRM, userId]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    const checkFreeTrialAlerts = async () => {
      try {
        const res = await axiosInstance.get('/leads/free-trial-alerts');
        enqueueFreeTrialAlerts(res.data.alerts || []);
      } catch (err) {
        console.error('Failed to check free trial alerts:', err);
      }
    };
    checkFreeTrialAlerts();
    freeTrialIntervalRef.current = setInterval(checkFreeTrialAlerts, 30000);
    return () => {
      if (freeTrialIntervalRef.current) clearInterval(freeTrialIntervalRef.current);
    };
  }, [isAuthenticated, isAdmin, userId, enqueueFreeTrialAlerts]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-900 text-white">
      <div className="flex-shrink-0 w-64 h-full">
        <Sidebar />
      </div>
      <main className={isWhatsAppInbox ? 'flex-1 overflow-hidden p-0' : 'flex-1 overflow-y-auto p-6'}>
        <Outlet />
      </main>
      <ToastContainer />
      {isRM && (
        <NewLeadsAssignedModal
          isOpen={showNewLeadsModal}
          count={newLeadsPopupCount}
          onClose={closeNewLeadsPopup}
          onViewLeads={handleViewLeads}
        />
      )}
      {isAdmin && (
        <FreeTrialAlertModal
          alert={currentFreeTrialAlert}
          queueTotal={freeTrialQueue.length}
          onCheckNow={handleCheckNowFreeTrial}
          onDismiss={dismissCurrentFreeTrial}
        />
      )}
    </div>
  );
}

export default Layout;
