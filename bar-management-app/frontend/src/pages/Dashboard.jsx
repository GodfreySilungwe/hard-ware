import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartLine, 
  faUsers,
  faClock,
  faTools,
  faClipboardCheck,
  faWarehouse
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/api';
import StatsCard from '../components/common/StatsCard';
import UnifiedCard from '../components/common/UnifiedCard';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const [stats, setStats] = useState({
    pendingApprovals: 0,
    activeBars: 0,
    hardwareManagers: 0,
    totalProducts: 0,
    totalCustomers: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      let summary = {};
      try {
        const summaryRes = await api.get('/auth/tenant-summary');
        summary = summaryRes.data || {};
      } catch (err) {
        console.log('No summary available:', err.message);
      }
      
      let products = [];
      try {
        const productsRes = await api.get('/products');
        products = productsRes.data;
      } catch (err) {
        console.log('No products:', err.message);
      }
      
      let customers = [];
      try {
        const customersRes = await api.get('/customers');
        customers = customersRes.data;
      } catch (err) {
        console.log('No customers:', err.message);
      }

      let orders = [];
      try {
        const ordersRes = await api.get('/orders');
        orders = Array.isArray(ordersRes.data)
          ? ordersRes.data
          : Array.isArray(ordersRes.data?.orders)
            ? ordersRes.data.orders
            : [];
      } catch (err) {
        console.log('No orders:', err.message);
      }

      const today = new Date();
      const todaysOrders = orders.filter((order) => {
        const timestamp = order.createdAt || order.created_at || order.date || order.updatedAt || order.updated_at || null;
        const orderDate = timestamp ? new Date(timestamp) : new Date(0);
        return !Number.isNaN(orderDate.getTime()) &&
          orderDate.getFullYear() === today.getFullYear() &&
          orderDate.getMonth() === today.getMonth() &&
          orderDate.getDate() === today.getDate();
      });
      const todaySales = todaysOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const todayProfit = todaysOrders.reduce((sum, order) => sum + Number(order.profit || 0), 0);
      const reversedOrders = todaysOrders.filter((order) => order.status === 'reversed').length;
      
      setStats({
        pendingApprovals: summary.pendingTenants || 0,
        activeBars: summary.activeTenants || 0,
        hardwareManagers: summary.hardwareManagers || 0,
        totalProducts: products.length || 0,
        totalCustomers: customers.length || 0,
        todayOrders: todaysOrders.length,
        todaySales,
        todayProfit,
        reversedOrders,
        averageOrderValue: todaysOrders.length > 0 ? todaySales / todaysOrders.length : 0
      });
      setTodayOrders(todaysOrders.slice(0, 5));
      setLastUpdated(new Date().toLocaleTimeString());
      
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Could not load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const role = user?.role;
  const isOwnerRole = role === 'owner';
  const isHardwareManagerRole = role === 'hardware-manager';
  const isSalesRole = role === 'sales';

  const heroTitle = isOwnerRole
    ? 'Global owner control center'
    : isHardwareManagerRole
      ? 'Hardware manager operations center'
      : isSalesRole
        ? 'Sales command center'
        : 'Workspace dashboard';

  const heroSubtitle = isOwnerRole
    ? 'Approve new hardware applications, manage global accounts, and monitor your hardware network from one place.'
    : isHardwareManagerRole
      ? 'Review today’s sales activity, track daily orders, and keep hardware operations moving.'
      : isSalesRole
        ? 'Focus on point-of-sale activity, customer service, and daily orders from one view.'
        : 'Review recent activity and stay on top of your work.';

  const visibleStats = isOwnerRole
    ? [
        { title: 'Pending approvals', value: stats.pendingApprovals, icon: faClipboardCheck, color: '#f39c12' },
        { title: 'Active hardwares', value: stats.activeBars, icon: faWarehouse, color: '#2ecc71' },
        { title: 'Hardware managers', value: stats.hardwareManagers, icon: faTools, color: '#3498db' }
      ]
    : isHardwareManagerRole
      ? [
          { title: 'Today sales', value: formatPriceMK(stats.todaySales), icon: faChartLine, color: '#2ecc71' },
          { title: 'Today profit', value: formatPriceMK(stats.todayProfit), icon: faChartLine, color: '#3498db' },
          { title: 'Today orders', value: stats.todayOrders, icon: faClipboardCheck, color: '#e94560' },
          { title: 'Products', value: stats.totalProducts, icon: faTools, color: '#9b59b6' }
        ]
      : [
          { title: 'Products', value: stats.totalProducts, icon: faChartLine, color: '#9b59b6' },
          { title: 'Customers', value: stats.totalCustomers, icon: faUsers, color: '#1abc9c' },
          { title: 'Orders', value: stats.todayOrders || 0, icon: faClipboardCheck, color: '#e94560' }
        ];

  if (loading) {
    return (
      <PageContainer title="📊 Dashboard">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading your dashboard...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="📊 Dashboard">
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>{error}</h2>
          <p style={styles.errorSubtitle}>Please check your connection and try again</p>
          <button style={styles.retryBtn} onClick={fetchDashboardData}>Retry</button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📊 Dashboard">
      {/* Executive Welcome Section */}
      <div style={styles.welcomeSection}>
        <div style={styles.heroPanel}>
          <div>
            <p style={styles.eyebrow}>Executive overview</p>
            <h2 style={styles.heroTitle}>{heroTitle}</h2>
            <p style={styles.subtitle}>{heroSubtitle}</p>
            {lastUpdated && (
              <p style={styles.lastUpdated}>
                <FontAwesomeIcon icon={faClock} style={{ marginRight: '6px' }} />
                Last updated: {lastUpdated}
              </p>
            )}
          </div>
          <button style={styles.refreshBtn} onClick={fetchDashboardData}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        {visibleStats.map((stat, index) => (
          <div key={stat.title} className={`fade-in delay-${index + 1}`} style={styles.statItem}>
            <StatsCard
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              isCurrency={stat.title.includes('sales')}
            />
          </div>
        ))}
      </div>

      {isHardwareManagerRole && (
        <div className="fade-in" style={styles.ordersPanel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Today’s snapshot</h3>
            <span style={styles.panelHint}>Revenue, profit, and recent activity at a glance</span>
          </div>
          <div style={styles.snapshotGrid}>
            <div style={{...styles.snapshotCard, borderColor: '#2ecc71'}}>
              <div style={styles.snapshotLabel}>Revenue</div>
              <div style={styles.snapshotValue}>{formatPriceMK(stats.todaySales)}</div>
            </div>
            <div style={{...styles.snapshotCard, borderColor: '#3498db'}}>
              <div style={styles.snapshotLabel}>Profit</div>
              <div style={styles.snapshotValue}>{formatPriceMK(stats.todayProfit)}</div>
            </div>
            <div style={{...styles.snapshotCard, borderColor: '#e94560'}}>
              <div style={styles.snapshotLabel}>Avg order</div>
              <div style={styles.snapshotValue}>{formatPriceMK(stats.averageOrderValue)}</div>
            </div>
            <div style={{...styles.snapshotCard, borderColor: '#9b59b6'}}>
              <div style={styles.snapshotLabel}>Reversed</div>
              <div style={styles.snapshotValue}>{stats.reversedOrders || 0}</div>
            </div>
          </div>
          {todayOrders.length === 0 ? (
            <div style={styles.emptyState}>No orders recorded today yet.</div>
          ) : (
            <div style={styles.ordersList}>
              {todayOrders.map((order) => (
                <div key={order._id || order.id} style={styles.orderItem}>
                  <div>
                    <div style={styles.orderName}>Order #{order.orderNumber || order._id || order.id}</div>
                    <div style={styles.orderMeta}>{order.customer?.name || order.customerName || 'Walk-in customer'}</div>
                  </div>
                  <div style={styles.orderAmount}>{formatPriceMK(order.totalAmount || 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </PageContainer>
  );
};

const styles = {
  welcomeSection: {
    marginBottom: '24px'
  },
  heroPanel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #e5e7eb',
    borderRadius: '20px',
    padding: '22px 24px',
    boxShadow: '0 12px 35px rgba(15, 23, 42, 0.06)',
    gap: '16px',
    flexWrap: 'wrap'
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#e94560',
    margin: '0 0 6px 0'
  },
  heroTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 8px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 8px 0',
    maxWidth: '700px'
  },
  lastUpdated: {
    fontSize: '13px',
    color: '#999',
    margin: '0'
  },
  refreshBtn: {
    padding: '10px 18px',
    borderRadius: '999px',
    border: '1px solid #e94560',
    backgroundColor: '#fff',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    width: '100%',
    maxWidth: '140px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '30px',
    width: '100%',
    alignItems: 'stretch'
  },
  statItem: {
    width: '100%'
  },
  ordersPanel: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)'
  },
  snapshotGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '10px',
    marginBottom: '14px'
  },
  snapshotCard: {
    border: '2px solid',
    borderRadius: '12px',
    padding: '10px 12px',
    backgroundColor: '#f8fafc'
  },
  snapshotLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px'
  },
  snapshotValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111827'
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px'
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#111827',
    margin: 0
  },
  panelHint: {
    fontSize: '13px',
    color: '#6b7280'
  },
  ordersList: {
    display: 'grid',
    gap: '10px'
  },
  orderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '12px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    gap: '10px',
    flexWrap: 'wrap'
  },
  orderName: {
    fontWeight: '700',
    color: '#111827'
  },
  orderMeta: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '2px'
  },
  orderAmount: {
    fontWeight: '700',
    color: '#e94560',
    marginLeft: 'auto'
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#888'
  },
  loadingText: {
    marginTop: '20px',
    fontSize: '16px',
    color: '#999'
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #e94560',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    padding: '20px',
    textAlign: 'center'
  },
  errorIcon: {
    fontSize: '56px',
    marginBottom: '20px'
  },
  errorTitle: {
    fontSize: '24px',
    color: '#e74c3c',
    marginBottom: '10px'
  },
  errorSubtitle: {
    fontSize: '16px',
    color: '#888',
    marginBottom: '20px'
  },
  retryBtn: {
    padding: '10px 30px',
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  lowStockGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px'
  },
  lowStockItem: {
    padding: '16px',
    backgroundColor: '#fef9e7',
    borderRadius: '12px',
    border: '1px solid #f39c12',
    position: 'relative'
  },
  lowStockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  lowStockName: {
    fontWeight: 'bold',
    fontSize: '15px',
    color: '#1a1a2e'
  },
  lowStockCategory: {
    fontSize: '12px',
    color: '#888',
    backgroundColor: '#f0f0f0',
    padding: '2px 10px',
    borderRadius: '12px'
  },
  lowStockDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  lowStockQty: {
    fontSize: '13px',
    color: '#666'
  },
  lowStockThreshold: {
    fontSize: '13px',
    color: '#666'
  },
  lowStockBar: {
    height: '6px',
    backgroundColor: '#f0f0f0',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  lowStockBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.5s ease'
  },
  outOfStockBadge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: '#e74c3c',
    color: 'white',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 0'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  emptyText: {
    fontSize: '18px',
    color: '#666',
    marginBottom: '5px'
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#999'
  },
  tableWrapper: {
    overflowX: 'auto',
    width: '100%'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  tableRow: {
    transition: 'background 0.2s ease',
    cursor: 'pointer'
  },
  orderNumber: {
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  amount: {
    fontWeight: 'bold',
    color: '#2ecc71'
  },
  profit: {
    color: '#3498db',
    fontWeight: '500'
  },
  time: {
    color: '#888',
    fontSize: '13px'
  },
  paymentBadge: {
    padding: '4px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'capitalize',
    display: 'inline-block'
  },
  cash: {
    backgroundColor: '#d5f5e3',
    color: '#27ae60'
  },
  card: {
    backgroundColor: '#d6eaf8',
    color: '#2e86c1'
  },
  mobile: {
    backgroundColor: '#fdebd0',
    color: '#e67e22'
  }
};

// Add keyframe animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .fade-in {
    animation: fadeInUp 0.6s ease forwards;
    opacity: 0;
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .delay-1 { animation-delay: 0.05s; }
  .delay-2 { animation-delay: 0.1s; }
  .delay-3 { animation-delay: 0.15s; }
  .delay-4 { animation-delay: 0.2s; }
  .delay-5 { animation-delay: 0.25s; }
  .delay-6 { animation-delay: 0.3s; }
`;
document.head.appendChild(styleSheet);

export default Dashboard;