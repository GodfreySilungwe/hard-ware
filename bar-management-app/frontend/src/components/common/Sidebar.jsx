import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartBar, 
  faCashRegister, 
  faBox, 
  faTags, 
  faUsers, 
  faClipboardList,
  faChartPie,
  faClipboardCheck,
  faTruck,
  faShoppingCart,
  faCog,
  faTools,
  faSignOutAlt,
  faWarehouse
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/api';

const Sidebar = ({ isMobileOpen = false, onClose = () => {} }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const getRoleLabel = () => {
    if (user?.role === 'owner') return 'Global Owner';
    if (user?.role === 'hardware-manager') return 'Hardware Manager';
    if (user?.role === 'sales') return 'Sales';
    return 'User';
  };

  useEffect(() => {
    if (user?.role !== 'owner') {
      setPendingCount(0);
      return;
    }

    const fetchPendingCount = async () => {
      try {
        const response = await api.get('/auth/pending-registrations');
        const registrations = Array.isArray(response.data) ? response.data : [];
        setPendingCount(registrations.length);
      } catch (error) {
        setPendingCount(0);
      }
    };

    fetchPendingCount();
    const handleOwnerDataUpdated = () => {
      fetchPendingCount();
    };

    window.addEventListener('owner-data-updated', handleOwnerDataUpdated);
    return () => {
      window.removeEventListener('owner-data-updated', handleOwnerDataUpdated);
    };
  }, [user?.role]);

  const handleLogout = () => {
    logout();
    onClose();
    navigate('/login');
  };
  
  const navItems = {
    owner: [
      { path: '/', label: 'Dashboard', icon: faChartBar },
      { path: '/hardware', label: 'Hardware', icon: faTools },
      { path: '/applications', label: 'Applications', icon: faTools, showBadge: true }
    ],
    'hardware-manager': [
      { path: '/', label: 'Dashboard', icon: faChartBar },
      { path: '/products', label: 'Products', icon: faBox },
      { path: '/categories', label: 'Categories', icon: faTags },
      { path: '/customers', label: 'Customers', icon: faUsers },
      { path: '/orders', label: 'Orders', icon: faClipboardList },
      { path: '/inventory', label: 'Inventory', icon: faWarehouse },
      { path: '/suppliers', label: 'Suppliers', icon: faTruck },
      { path: '/purchase-orders', label: 'Purchase Orders', icon: faShoppingCart },
      { path: '/reports', label: 'Reports', icon: faChartPie },
      { path: '/settings', label: 'Settings', icon: faCog },
      { path: '/sales-team', label: 'Sales Team', icon: faUsers }
    ],
    sales: [
      { path: '/', label: 'Dashboard', icon: faChartBar },
      { path: '/pos', label: 'POS', icon: faCashRegister },
      { path: '/customers', label: 'Customers', icon: faUsers },
      { path: '/orders', label: 'Orders', icon: faClipboardList }
    ]
  };

  const filteredNavItems = (navItems[user?.role] || []).filter(Boolean);

  return (
    <div style={{ ...styles.sidebar, ...(window.innerWidth < 900 ? { transform: isMobileOpen ? 'translateX(0)' : 'translateX(-100%)' } : {}) }}>
      <div style={styles.logo}>
        <div style={styles.logoBadge}>🏢</div>
        <div>
          <div style={styles.logoText}>Enterprise Hub</div>
          <div style={styles.logoSubtext}>Global Owner Console</div>
        </div>
        {window.innerWidth < 900 && (
          <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Close menu">
            ✕
          </button>
        )}
      </div>

      <nav style={styles.nav}>
        {filteredNavItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              ...styles.navLink,
              ...(location.pathname === item.path ? styles.navLinkActive : {})
            }}
            onMouseEnter={(e) => {
              if (location.pathname !== item.path) {
                e.currentTarget.style.backgroundColor = '#2d2d4a';
                e.currentTarget.style.color = 'white';
              }
            }}
            onMouseLeave={(e) => {
              if (location.pathname !== item.path) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#aaa';
              }
            }}
          >
            <FontAwesomeIcon icon={item.icon} style={styles.navIcon} />
            <span>{item.label}</span>
            {item.showBadge && pendingCount > 0 && (
              <span style={styles.badge}>{pendingCount}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* Footer with User Info & Logout */}
      <div style={styles.footer}>
        <div style={styles.userInfo}>
          <div style={styles.userName}>{user?.fullName || 'User'}</div>
          <div style={styles.userRole}>{getRoleLabel()}</div>
        </div>
        <button
          style={styles.logoutBtn}
          onClick={handleLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#c73652';
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#e94560';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <FontAwesomeIcon icon={faSignOutAlt} style={{ marginRight: '8px' }} />
          Logout
        </button>
        <div style={styles.version}>v1.0.0</div>
      </div>
    </div>
  );
};

const styles = {
  sidebar: {
    width: '220px',
    height: '100vh',
    backgroundColor: '#1a1a2e',
    color: 'white',
    position: 'fixed',
    top: 0,
    left: 0,
    overflowY: 'auto',
    padding: '20px 0',
    zIndex: 1000,
    boxShadow: '2px 0 10px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 20px',
    marginBottom: '30px',
    fontSize: '20px',
    fontWeight: 'bold'
  },
  closeButton: {
    marginLeft: 'auto',
    border: 'none',
    background: 'transparent',
    color: 'white',
    fontSize: '18px',
    cursor: 'pointer'
  },
  logoBadge: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #e94560, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px'
  },
  logoText: {
    color: '#fff',
    fontSize: '15px',
    fontWeight: '700'
  },
  logoSubtext: {
    color: '#9ca3af',
    fontSize: '11px',
    marginTop: '2px'
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1
  },
  navLink: {
    color: '#aaa',
    textDecoration: 'none',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'all 0.3s ease',
    fontSize: '15px',
    borderRadius: '0 20px 20px 0',
    marginRight: '10px'
  },
  navLinkActive: {
    color: 'white',
    backgroundColor: '#e94560',
    boxShadow: '0 4px 15px rgba(233, 69, 96, 0.4)'
  },
  navIcon: {
    fontSize: '18px',
    width: '24px'
  },
  badge: {
    marginLeft: 'auto',
    backgroundColor: '#ef4444',
    color: 'white',
    borderRadius: '999px',
    minWidth: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
    padding: '0 6px'
  },
  footer: {
    padding: '15px 20px 10px 20px',
    borderTop: '1px solid #2d2d4a',
    marginTop: 'auto'
  },
  userInfo: {
    padding: '12px',
    marginBottom: '10px',
    textAlign: 'center',
    backgroundColor: '#23233a',
    borderRadius: '12px',
    border: '1px solid #34344f'
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'white',
    marginBottom: '2px'
  },
  userRole: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'capitalize'
  },
  logoutBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '10px'
  },
  version: {
    fontSize: '11px',
    color: '#6b7280',
    textAlign: 'center'
  }
};

export default Sidebar;