import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Target,
  Users2,
  LogOut,
  Trophy,
  FlaskConical,
  MessageCircle,
  CreditCard,
  UserPlus,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role, logout, displayName } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);

  const handleLogout = () => {
    logout();
    addToast('Logged out', 'success');
    onNavigate?.();
  };

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: <LayoutDashboard size={18} />,
      roles: ['super_admin', 'admin'],
    },
    {
      label: 'Users',
      path: '/users',
      icon: <Users size={18} />,
      roles: ['super_admin', 'admin', 'team_leader'],
    },
    {
      label: 'Leads',
      path: '/leads',
      icon: <Target size={18} />,
      roles: ['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager'],
    },
    {
      label: 'Teams',
      path: '/teams',
      icon: <Users2 size={18} />,
      roles: ['super_admin', 'admin'],
    },
    {
      label: 'Assign Team',
      path: '/assign-team',
      icon: <UserPlus size={18} />,
      roles: ['super_admin'],
    },
    {
      label: role === 'financial_manager' ? 'Payments Awaiting Approval' : 'Payments',
      path: '/clients',
      icon: <CreditCard size={18} />,
      roles: ['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager'],
    },
    {
      label: 'Clients',
      path: '/all-clients',
      icon: <Trophy size={18} />,
      roles: ['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager'],
    },
    {
      label: 'WhatsApp',
      path: '/whatsapp',
      icon: <MessageCircle size={18} />,
      roles: ['super_admin'],
    },
    {
      label: 'TestMetaleads',
      path: '/test-metaleads',
      icon: <FlaskConical size={18} />,
      roles: ['super_admin'],
    },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-line bg-shell">
      <div className="border-b border-line px-5 py-5">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">CRM</p>
        <h1 className="text-lg font-semibold tracking-tight text-white">Dream Trade</h1>
      </div>
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main">
        <ul>
          {menuItems
            .filter((item) => item.roles.includes(role))
            .map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
                  }
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium capitalize">{displayName || 'User'}</p>
            <p className="truncate text-sm capitalize text-gray-400">{role.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-ghost mt-3 w-full"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
