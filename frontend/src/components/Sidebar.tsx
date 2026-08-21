import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Target,
  Users2,
  LogOut,
  Trophy,
  FlaskConical,
  MessageCircle
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

function Sidebar() {
  const { role, logout, displayName } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);

  const handleLogout = () => {
    logout();
    addToast('Logged out', 'success');
  };

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: <LayoutDashboard size={18} className="mr-2" />,
      roles: ['super_admin', 'admin', 'team_leader'],
    },
    {
      label: 'Users',
      path: '/users',
      icon: <Users size={18} className="mr-2" />,
      roles: ['super_admin', 'admin', 'team_leader'],
    },
    {
      label: 'Leads',
      path: '/leads',
      icon: <Target size={18} className="mr-2" />,
      roles: ['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager'],
    },
    {
      label: 'Teams',
      path: '/teams',
      icon: <Users2 size={18} className="mr-2" />,
      roles: ['super_admin', 'admin'],
    },
    {
      label: role === 'financial_manager' ? 'Clients Awaiting Approval' : 'Clients',
      path: '/clients',
      icon: <Trophy size={18} className="mr-2" />,
      roles: ['super_admin', 'admin', 'team_leader', 'relationship_mgr', 'financial_manager'],
    },
    {
      label: 'Clients',
      path: '/all-clients',
      icon: <Trophy size={18} className="mr-2" />,
      roles: ['financial_manager'],
    },
    {
      label: 'WhatsApp',
      path: '/whatsapp',
      icon: <MessageCircle size={18} className="mr-2" />,
      roles: ['super_admin'],
    },
    {
      label: 'TestMetaleads',
      path: '/test-metaleads',
      icon: <FlaskConical size={18} className="mr-2" />,
      roles: ['super_admin'],
    },
  ];

  return (
    <aside className="w-64 bg-gray-900 min-h-screen flex flex-col border-r border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white">Dream Trade</h1>
      </div>
      <nav className="flex-1">
        <ul>
          {menuItems
            .filter((item) => item.roles.includes(role))
            .map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-link flex items-center ${
                      isActive ? 'sidebar-link-active' : ''
                    }`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="btn btn-primary w-full flex items-center justify-center"
        >
          <LogOut size={18} className="mr-2" />
          Logout
        </button>
      </div>
      <div className="p-4 border-t border-gray-800 flex items-center">
        <div className="w-10 h-10 rounded-full bg-gray-700 mr-3 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center bg-blue-500 text-white">
            {displayName?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
        <div>
          <p className="font-medium capitalize">{displayName || '[User]'}</p>
          <p className="text-sm text-gray-400">{role.replace('_', ' ')}</p>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
