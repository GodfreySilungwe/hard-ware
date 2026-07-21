import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  faSignOutAlt
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: faChartBar },
    { path: '/pos', label: 'POS', icon: faCashRegister },
    { path: '/products', label: 'Hardware', icon: faTools },
    { path: '/categories', label: 'Categories', icon: faTags },
    { path: '/customers', label: 'Customers', icon: faUsers },
    { path: '/orders', label: 'Orders', icon: faClipboardList },
    { path: '/reports', label: 'Reports', icon: faChartPie },
    { path: '/inventory', label: 'Inventory', icon: faClipboardCheck },
    { path: '/suppliers', label: 'Suppliers', icon: faTruck },
    { path: '/purchase-orders', label: 'Purchase Orders', icon: faShoppingCart },
    { path: '/settings', label: 'Settings', icon: faCog }
  ];

  // Filter nav items based on role
  const filteredNavItems = navItems.filter(item => {
    // Sales can only see: Dashboard, POS, Customers, Orders
    if (user?.role === 'sales') {
      const salesAccess = ['/', '/pos', '/customers', '/orders'];
      return salesAccess.includes(item.path);
    }
    // Owner sees everything
    return true;
  });

  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>🔩</span>
        <span style={styles.logoText}>Hardware Manager</span>
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
          </Link>
        ))}
      </nav>

      {/* Footer with User Info & Logout */}
      <div style={styles.footer}>
        <div style={styles.userInfo}>
          <div style={styles.userName}>{user?.fullName || 'User'}</div>
          <div style={styles.userRole}>{user?.role || 'Staff'}</div>
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
  logoIcon: {
    fontSize: '28px'
  },
  logoText: {
    color: '#e94560'
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
  footer: {
    padding: '15px 20px 10px 20px',
    borderTop: '1px solid #2d2d4a',
    marginTop: 'auto'
  },
  userInfo: {
    padding: '8px 0',
    marginBottom: '10px',
    textAlign: 'center'
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
    color: '#555',
    textAlign: 'center'
  }
};

export default Sidebar;