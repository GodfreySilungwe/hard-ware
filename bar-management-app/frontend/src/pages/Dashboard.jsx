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
  const formatLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayString = () => formatLocalDateString(new Date());
  const [stats, setStats] = useState({
    pendingApprovals: 0,
    activeBars: 0,
    hardwareManagers: 0,
    totalProducts: 0,
    totalCustomers: 0,
    todayOrders: 0,
    todaySales: 0,
    todaySalesNet: 0,
    todayTax: 0,
    todayProfit: 0,
    reversedOrders: 0,
    averageOrderValue: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [hardwareBreakdown, setHardwareBreakdown] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [appliedStartDate, setAppliedStartDate] = useState(getTodayString());
  const [appliedEndDate, setAppliedEndDate] = useState(getTodayString());
  const [periodFilter, setPeriodFilter] = useState('today');
  const [productPage, setProductPage] = useState(1);
  const { user, loading: authLoading } = useAuth();

  const setDateRange = (from, to, filter) => {
    setStartDate(from);
    setEndDate(to);
    setAppliedStartDate(from);
    setAppliedEndDate(to);
    setPeriodFilter(filter);
  };

  const handlePeriodChange = (filter) => {
    const now = new Date();
    if (filter === 'today') {
      const today = formatLocalDateString(now);
      setDateRange(today, today, 'today');
      return;
    }

    if (filter === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateRange(formatLocalDateString(firstOfMonth), formatLocalDateString(now), 'month');
      return;
    }

    if (filter === 'year') {
      const firstOfYear = new Date(now.getFullYear(), 0, 1);
      setDateRange(formatLocalDateString(firstOfYear), formatLocalDateString(now), 'year');
      return;
    }

    setStartDate('');
    setEndDate('');
    setPeriodFilter('custom');
  };

  const applyCustomRange = () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) return;
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  useEffect(() => {
    if (!authLoading) {
      fetchDashboardData();
    }
  }, [user?.role, authLoading, productPage, appliedStartDate, appliedEndDate]);

  useEffect(() => {
    if (periodFilter !== 'today') return;

    const now = new Date();
    const today = formatLocalDateString(now);
    if (startDate !== today || endDate !== today) {
      setDateRange(today, today, 'today');
      return;
    }

    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const timeoutMs = nextMidnight.getTime() - now.getTime() + 10;
    const timer = setTimeout(() => {
      const nextDay = formatLocalDateString(new Date());
      setDateRange(nextDay, nextDay, 'today');
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [periodFilter, startDate, endDate]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const role = user?.role;
      const isOwnerRole = role === 'owner';
      const isHardwareManagerRole = role === 'hardware-manager';
      const isSalesRole = role === 'sales';

      const query = {};
      if (appliedStartDate) {
        const [ys, ms, ds] = appliedStartDate.split('-').map((p) => Number(p));
        const sLocal = new Date(ys, ms - 1, ds, 0, 0, 0, 0);
        query.startDateUtc = sLocal.toISOString();
      }
      if (appliedEndDate) {
        const [ye, me, de] = appliedEndDate.split('-').map((p) => Number(p));
        const eLocal = new Date(ye, me - 1, de, 23, 59, 59, 999);
        query.endDateUtc = eLocal.toISOString();
      }

      const requests = [
        api.get('/auth/tenant-summary').catch(() => ({ data: {} }))
      ];

      if (isOwnerRole) {
        requests.push(api.get('/auth/tenants').catch(() => ({ data: [] })));
      } else {
        requests.push(api.get('/products').catch(() => ({ data: [] })));
        if (appliedStartDate || appliedEndDate) {
          requests.push(api.get('/orders/today', { params: query }).catch(() => ({ data: {} })));
        } else {
          const now = new Date();
          const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          requests.push(api.get('/orders/today', { params: { startDateUtc: startLocal.toISOString(), endDateUtc: endLocal.toISOString() } }).catch(() => ({ data: {} })));
        }
      }

      if (isSalesRole) {
        requests.push(api.get('/customers').catch(() => ({ data: [] })));
      }

      const results = await Promise.allSettled(requests);

      // fetch extended dashboard summary
      const dashboardQuery = { ...query, productPage, productLimit: isHardwareManagerRole || isSalesRole ? 20 : 10 };
      const dashboardRes = await api.get('/dashboard/summary', { params: dashboardQuery }).catch(() => ({ data: null }));
      const dashboardData = dashboardRes.data || null;
      setDashboardSummary(dashboardData);

      const summary = results[0]?.status === 'fulfilled' ? results[0].value.data || {} : {};
      const ownerTenants = isOwnerRole && results[1]?.status === 'fulfilled' ? results[1].value.data || [] : [];
      const products = !isOwnerRole && results[1]?.status === 'fulfilled' ? results[1].value.data || [] : [];
      const todayPayload = !isOwnerRole && results[2]?.status === 'fulfilled' ? results[2].value.data : {};
      const customers = isSalesRole && results[isOwnerRole ? 2 : 3]?.status === 'fulfilled' ? results[isOwnerRole ? 2 : 3].value.data || [] : [];

      const todaysOrders = Array.isArray(todayPayload.orders) ? todayPayload.orders : [];
      const paymentSummaryData = Array.isArray(dashboardData?.paymentProceeds)
        ? dashboardData.paymentProceeds
        : Array.isArray(todayPayload.paymentMethods)
          ? todayPayload.paymentMethods
          : [];
      const todayOrderCount = typeof todayPayload.count === 'number' ? todayPayload.count : todaysOrders.length;
      const todaySales = todayPayload.totalSales ?? 0;
      const todayProfit = todayPayload.totalProfit ?? 0;
      const todaySalesNet = todayPayload.totalSalesNet ?? 0;
      const todayTax = todayPayload.totalTax ?? 0;
      const reversedOrders = todayPayload.reversedOrders ?? 0;
      const averageOrderValue = todayPayload.averageOrderValue ?? 0;

      setStats({
        pendingApprovals: summary.pendingTenants || 0,
        activeBars: summary.activeTenants || 0,
        hardwareManagers: summary.hardwareManagers || 0,
        salesAccounts: summary.salesAccounts || 0,
        totalHardwareAccounts: summary.totalTenants || 0,
        activeHardwareAccounts: summary.activeTenants || 0,
        pendingApplications: summary.pendingTenants || 0,
        totalProducts: products.length || 0,
        totalCustomers: customers.length || 0,
        todayOrders: todayOrderCount,
        todaySales,
        todaySalesNet,
        todayTax,
        todayProfit,
        reversedOrders,
        averageOrderValue
      });
      setHardwareBreakdown(ownerTenants);
      setPaymentSummary(paymentSummaryData);
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
      ? 'Smart Inventory App operations center'
      : isSalesRole
        ? 'Sales command center'
        : 'Workspace dashboard';

  const heroSubtitle = isOwnerRole
    ? 'Approve new Smart Inventory App applications, manage global accounts, and monitor your network from one place.'
    : isHardwareManagerRole
      ? 'Review sales activity, track daily orders, and keep your inventory operations moving.'
      : isSalesRole
        ? 'Focus on point-of-sale activity, customer service, and daily orders from one view.'
        : 'Review recent activity and stay on top of your work.';

  const productSummaryTotals = {
    remainingValue: dashboardSummary?.inventoryValueAtCost ?? dashboardSummary?.productSummaryTotals?.remainingValue ?? dashboardSummary?.productSummary?.reduce((totals, p) => totals + Number(p.remainingValue || 0), 0) ?? 0,
    remainingSellingValue: dashboardSummary?.inventoryValueAtSellingPrice ?? dashboardSummary?.productSummaryTotals?.remainingSellingValue ?? dashboardSummary?.productSummary?.reduce((totals, p) => totals + Number(p.remainingSellingValue || 0), 0) ?? 0
  };

  const unsettledCustomerTotals = dashboardSummary?.unsettledCustomers?.reduce((totals, c) => ({
    outstandingBalanceTotal: totals.outstandingBalanceTotal + Number(c.outstandingBalanceTotal || 0),
    openCreditOrders: totals.openCreditOrders + Number(c.openCreditOrders || 0)
  }), {
    outstandingBalanceTotal: 0,
    openCreditOrders: 0
  });

  const paymentSummaryTotal = paymentSummary.reduce((sum, method) => {
    return sum + Number(method.amount || 0);
  }, 0);

  const visibleStats = isOwnerRole
    ? [
        { title: 'Total Smart Inventory App Accounts', value: stats.totalHardwareAccounts, icon: faWarehouse, color: '#2ecc71' },
        { title: 'Active Smart Inventory App Accounts', value: stats.activeHardwareAccounts, icon: faTools, color: '#3498db' },
        { title: 'Pending Applications', value: stats.pendingApplications, icon: faClipboardCheck, color: '#f39c12' }
      ]
    : isHardwareManagerRole || isSalesRole
      ? []
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

      {isHardwareManagerRole && dashboardSummary && (
        <div style={styles.managerInventoryGrid} className="fade-in">
          <div style={styles.managerInventoryCard}>
            <div style={styles.managerInventoryLabel}>Remaining Inventory Value</div>
            <div style={styles.managerInventoryValue}>{formatPriceMK(productSummaryTotals.remainingValue)}</div>
            <div style={styles.managerInventorySubtext}>At cost price</div>
          </div>
          <div style={styles.managerInventoryCard}>
            <div style={styles.managerInventoryLabel}>Remaining Inventory Value</div>
            <div style={styles.managerInventoryValue}>{formatPriceMK(productSummaryTotals.remainingSellingValue)}</div>
            <div style={styles.managerInventorySubtext}>At selling price</div>
          </div>
        </div>
      )}

      {!isOwnerRole && dashboardSummary && (
        <div style={styles.lowStockPanel} className="fade-in">
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Low Stock</h3>
            <span style={styles.panelHint}>{dashboardSummary.lowStock || 0} product{dashboardSummary.lowStock === 1 ? '' : 's'} need attention</span>
          </div>
          {dashboardSummary.lowStockProducts?.length ? (
            <div style={styles.lowStockGrid}>
              {dashboardSummary.lowStockProducts.map((product) => {
                const threshold = Number(product.lowStockThreshold ?? product.reorderLevel ?? 5);
                const quantity = Number(product.currentStock || 0);
                const fill = threshold > 0 ? Math.min(100, Math.max(0, (quantity / threshold) * 100)) : 0;
                return (
                  <div style={styles.lowStockItem} key={product._id || product.id}>
                    {quantity <= 0 && <span style={styles.outOfStockBadge}>Out of stock</span>}
                    <div style={styles.lowStockHeader}><span style={styles.lowStockName}>{product.name}</span><span style={styles.lowStockCategory}>{product.category?.name || 'Uncategorised'}</span></div>
                    <div style={styles.lowStockDetails}><span style={styles.lowStockQty}>Available: {quantity}</span><span style={styles.lowStockThreshold}>Threshold: {threshold}</span></div>
                    <div style={styles.lowStockBar}><div style={{ ...styles.lowStockBarFill, width: `${fill}%`, backgroundColor: quantity <= 0 ? '#e74c3c' : '#f39c12' }} /></div>
                  </div>
                );
              })}
            </div>
          ) : <p style={styles.emptyState}>All products are above their stock thresholds.</p>}
        </div>
      )}

      {!isOwnerRole && (
        <div style={styles.periodFilterBar}>
          <span style={styles.periodLabel}>Period:</span>
          <button
            style={{
              ...styles.periodButton,
              ...(periodFilter === 'today' ? styles.periodButtonActive : {})
            }}
            onClick={() => handlePeriodChange('today')}
          >
            Today
          </button>
          <button
            style={{
              ...styles.periodButton,
              ...(periodFilter === 'month' ? styles.periodButtonActive : {})
            }}
            onClick={() => handlePeriodChange('month')}
          >
            Month
          </button>
          <button
            style={{
              ...styles.periodButton,
              ...(periodFilter === 'year' ? styles.periodButtonActive : {})
            }}
            onClick={() => handlePeriodChange('year')}
          >
            Year
          </button>
          <button
            style={{
              ...styles.periodButton,
              ...(periodFilter === 'custom' ? styles.periodButtonActive : {})
            }}
            onClick={() => handlePeriodChange('custom')}
          >
            Custom
          </button>
          {periodFilter === 'custom' && (
            <div style={styles.customRangeRow}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.periodDateInput}
              />
              <span style={styles.periodDateSeparator}>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.periodDateInput}
              />
              <button style={styles.applyDateButton} onClick={applyCustomRange} disabled={!startDate || !endDate || startDate > endDate}>
                Apply
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
        {visibleStats.length > 0 && (
          <div className="stats-grid" style={styles.statsGrid}>
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
      )}

      {isOwnerRole && (
        <div className="fade-in" style={styles.ordersPanel}>
          <div style={styles.ownerPortfolioHeader}>
            <h3 style={styles.panelTitle}>Owner Portfolio</h3>
            <span style={styles.panelHint}>Global portfolio overview from tenant summary</span>
          </div>
          <div style={styles.ownerGrid}>
            <div style={styles.ownerCard}>
              <div style={styles.snapshotLabel}>Total Accounts</div>
              <div style={styles.snapshotValue}>{stats.totalHardwareAccounts}</div>
            </div>
            <div style={styles.ownerCard}>
              <div style={styles.snapshotLabel}>Active Accounts</div>
              <div style={styles.snapshotValue}>{stats.activeHardwareAccounts}</div>
            </div>
            <div style={styles.ownerCard}>
              <div style={styles.snapshotLabel}>Pending Applications</div>
              <div style={styles.snapshotValue}>{stats.pendingApplications}</div>
            </div>
            <div style={styles.ownerCard}>
              <div style={styles.snapshotLabel}>Smart Inventory App Users</div>
              <div style={styles.snapshotValue}>{stats.hardwareManagers || 0}</div>
            </div>
            <div style={styles.ownerCard}>
              <div style={styles.snapshotLabel}>Sales Accounts</div>
              <div style={styles.snapshotValue}>{stats.salesAccounts || 0}</div>
            </div>
          </div>

        </div>
      )}

      {dashboardSummary && !isOwnerRole && (
        <div style={styles.handoverPanel} className="fade-in">
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>🧾 Handover Summary</h3>
          </div>

            <div className="handover-grid" style={styles.handoverGrid}>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Total Sales</div>
              <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.totalSales)}</div>
            </div>
            {!isSalesRole && (
              <div style={styles.handoverCard}>
                <div style={styles.handoverLabel}>Total Profit</div>
                <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.totalProfit)}</div>
              </div>
            )}
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Orders Processed</div>
              <div style={styles.handoverValue}>{dashboardSummary.handover.ordersProcessed}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Items Sold</div>
              <div style={styles.handoverValue}>{dashboardSummary.handover.itemsSold}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Products</div>
              <div style={styles.handoverValue}>{stats.totalProducts}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>POS Non-Credit Sales</div>
              <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.nonCreditPosSales)}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Credit Sales (this period)</div>
              <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.creditSalesPeriod)}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Credit Collected (this period)</div>
              <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.settledCreditCash)}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Outstanding Credits (All)</div>
              <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.accumulatedCredits)}</div>
            </div>
            <div style={styles.handoverCard}>
              <div style={styles.handoverLabel}>Expected Handover</div>
              <div style={styles.handoverValue}>{formatPriceMK(dashboardSummary.handover.expectedHandover)}</div>
            </div>
          </div>
        </div>
      )}

      {!isOwnerRole && (
        <>
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>🧾 Product Sales Summary</h4>
            <div style={styles.tableContainer}>
              <div style={styles.table}>
                <div style={{ ...styles.tableRow, ...styles.tableHeaderRow }}>
                  <div style={styles.tableCellMain}>Product</div>
                  {!(isHardwareManagerRole || isSalesRole) && <div style={styles.tableCellSmall}>Start Qty</div>}
                  <div style={styles.tableCellSmall}>PO Qty</div>
                  <div style={styles.tableCellSmall}>Sold Qty</div>
                  <div style={styles.tableCellSmall}>Closing Qty</div>
                  <div style={styles.tableCellAmount}>Total Amount (Sold)</div>
                </div>
                {dashboardSummary.productSummary.map((p, index) => (
                  <div
                    key={p.productId}
                    style={{
                      ...styles.tableRow,
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fbff'
                    }}
                  >
                    <div style={styles.tableCellMain}>
                      <a href={`/products?highlight=${p.productId}`} style={{ color: '#111', textDecoration: 'underline' }}>{p.name || 'Unknown'}</a>
                    </div>
                    {!(isHardwareManagerRole || isSalesRole) && <div style={styles.tableCellSmall}>{p.startQty}</div>}
                    <div style={styles.tableCellSmall}>{p.purchaseOrderQty || 0}</div>
                    <div style={styles.tableCellSmall}>{p.soldQty}</div>
                    <div style={styles.tableCellSmall}>{p.closingQty}</div>
                    <div style={styles.tableCellAmount}>{formatPriceMK(p.totalAmount)}</div>
                  </div>
                ))}
                <div style={{ ...styles.tableRow, ...styles.tableRowTotal }}>
                  <div style={styles.tableCellMain}>Totals</div>
                  {!(isHardwareManagerRole || isSalesRole) && <div style={styles.tableCellSmall}>{productSummaryTotals.startQty}</div>}
                  <div style={styles.tableCellSmall}>{productSummaryTotals.purchaseOrderQty || 0}</div>
                  <div style={styles.tableCellSmall}>{productSummaryTotals.soldQty}</div>
                  <div style={styles.tableCellSmall}>{productSummaryTotals.closingQty}</div>
                  <div style={styles.tableCellAmount}>{formatPriceMK(productSummaryTotals.totalAmount)}</div>
                </div>
              </div>
            </div>
            {dashboardSummary?.productSummaryPagination && (
              <div style={styles.paginationRow}>
                <button
                  style={styles.paginationButton}
                  disabled={dashboardSummary.productSummaryPagination.page <= 1}
                  onClick={() => setProductPage((prev) => Math.max(1, prev - 1))}
                >
                  Previous
                </button>
                <span style={styles.paginationInfo}>
                  Page {dashboardSummary.productSummaryPagination.page} of {dashboardSummary.productSummaryPagination.totalPages}
                </span>
                <button
                  style={styles.paginationButton}
                  disabled={dashboardSummary.productSummaryPagination.page >= dashboardSummary.productSummaryPagination.totalPages}
                  onClick={() => setProductPage((prev) => Math.min(dashboardSummary.productSummaryPagination.totalPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>🧾 Customers with Unsettled Bills</h4>
            <div style={styles.tableContainer}>
              <div style={styles.table}>
                <div style={{ ...styles.tableRow, ...styles.tableHeaderRow }}>
                  <div style={styles.tableCellMain}>Customer</div>
                  <div style={styles.tableCellSmall}>Phone</div>
                  <div style={styles.tableCellAmount}>Outstanding</div>
                  <div style={styles.tableCellSmall}>Open Credit Orders</div>
                </div>
                {dashboardSummary.unsettledCustomers.map((c, index) => (
                  <div
                    key={c.customerId}
                    style={{
                      ...styles.tableRow,
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fbff'
                    }}
                  >
                    <div style={styles.tableCellMain}>
                      <a href={`/customers?highlight=${c.customerId}`} style={{ color: '#111', textDecoration: 'underline' }}>{c.name}</a>
                    </div>
                    <div style={styles.tableCellSmall}>{c.phone}</div>
                    <div style={styles.tableCellAmount}>{formatPriceMK(c.outstandingBalanceTotal)}</div>
                    <div style={styles.tableCellSmall}>{c.openCreditOrders}</div>
                  </div>
                ))}
                <div style={{ ...styles.tableRow, ...styles.tableRowTotal }}>
                  <div style={styles.tableCellMain}>Totals</div>
                  <div style={styles.tableCellSmall} />
                  <div style={styles.tableCellAmount}>{formatPriceMK(unsettledCustomerTotals.outstandingBalanceTotal)}</div>
                  <div style={styles.tableCellSmall}>{unsettledCustomerTotals.openCreditOrders}</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {(isHardwareManagerRole || isSalesRole) && paymentSummary.length > 0 && (
        <div className="fade-in" style={styles.ordersPanel}>
          <div style={{ ...styles.summarySection, marginTop: '0' }}>
            <div style={styles.summaryHeaderRow}>
              <div>
                <div style={styles.sectionEyebrow}>Payment mix</div>
                <h4 style={styles.sectionTitle}>Sales proceeds by payment method</h4>
              </div>
              <div style={styles.summaryBadge}>{paymentSummary.length} methods</div>
            </div>

            <div style={styles.summaryList}>
              {paymentSummary.map((method) => (
                <div key={method.method} style={styles.summaryItem}>
                  <div style={styles.summaryItemMeta}>
                    <span style={{
                      ...styles.summaryDot,
                      backgroundColor: method.method?.toLowerCase().includes('cash') ? '#16a085' :
                        method.method?.toLowerCase().includes('card') ? '#3b82f6' :
                        method.method?.toLowerCase().includes('airtel') ? '#f59e0b' :
                        method.method?.toLowerCase().includes('mpamba') ? '#8b5cf6' :
                        method.method?.toLowerCase().includes('credit') ? '#0ea5e9' : '#14b8a6'
                    }} />
                    <div>
                      <div style={styles.summaryTitle}>{method.label || method.method}</div>
                      <div style={styles.summaryMeta}>{method.count} transaction{method.count === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <div style={styles.summaryAmount}>{formatPriceMK(method.amount || 0)}</div>
                </div>
              ))}
            </div>
            <div style={styles.summaryTotalRow}>
              <div style={styles.summaryTotalLabel}>Total proceeds</div>
              <div style={styles.summaryAmount}>{formatPriceMK(paymentSummaryTotal)}</div>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  );
};

const styles = {
  welcomeSection: {
    marginBottom: '20px'
  },
  heroPanel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '16px',
    padding: '18px 20px',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)',
    gap: '16px',
    flexWrap: 'wrap'
  },
  handoverPanel: {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: 22,
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)'
  },
  handoverGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 14,
    marginTop: 14
  },
  handoverCard: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  handoverLabel: { fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 },
  handoverValue: { fontSize: 18, fontWeight: 700, color: '#0f172a' },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 },
  tableContainer: { width: '100%', maxHeight: '360px', overflowX: 'auto', overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, backgroundColor: '#ffffff' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: '720px', backgroundColor: '#ffffff' },
  tableRow: { display: 'flex', flexWrap: 'nowrap', padding: '8px 12px', alignItems: 'center', gap: 12, borderBottom: '1px solid #fafafa', transition: 'background 0.2s ease', cursor: 'pointer' },
  tableHeaderRow: { cursor: 'default', backgroundColor: '#f8fafc', fontWeight: 700, position: 'sticky', top: 0, zIndex: 2 },
  tableCellMain: { flex: '2 1 220px', minWidth: 220, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tableCellSmall: { flex: '0 0 100px', minWidth: 100, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tableCellAmount: { flex: '0 0 180px', minWidth: 180, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tableRowTotal: { backgroundColor: '#eef2ff', fontWeight: 700, position: 'sticky', bottom: 0, zIndex: 2 },
  summaryTotalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #f3f4f6', fontWeight: 700, marginTop: '12px' },
  summaryTotalLabel: { color: '#334155' },
  paginationRow: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', padding: '10px 0' },
  paginationButton: { padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', cursor: 'pointer', color: '#111827', fontWeight: 600 },
  paginationInfo: { fontSize: '14px', color: '#4b5563' },
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
  periodFilterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 18px',
    borderRadius: '18px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    marginBottom: '20px'
  },
  periodLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#334155',
    marginRight: '8px'
  },
  periodButton: {
    padding: '10px 16px',
    borderRadius: '999px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#334155',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)'
  },
  periodButtonActive: {
    backgroundColor: '#e94560',
    borderColor: '#e94560',
    color: 'white',
    boxShadow: '0 10px 25px rgba(233, 69, 96, 0.18)'
  },
  customRangeRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: '10px'
  },
  periodDateInput: {
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    minWidth: '140px'
  },
  periodDateSeparator: {
    color: '#6b7280'
  },
  applyDateButton: {
    padding: '10px 16px',
    borderRadius: '999px',
    border: '1px solid #e94560',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '700',
    transition: 'all 0.2s ease'
  },
  dateControls: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap'
  },
  dateInputLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '13px',
    color: '#555',
    gap: '4px'
  },
  dateInput: {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    minWidth: '160px'
  },
  applyBtn: {
    padding: '8px 18px',
    borderRadius: '999px',
    border: '1px solid #e94560',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  clearBtn: {
    padding: '8px 18px',
    borderRadius: '999px',
    border: '1px solid #ccc',
    backgroundColor: 'white',
    color: '#333',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  refreshBtn: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: '1px solid #fecaca',
    backgroundColor: '#fff7f7',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    minWidth: '110px'
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
  managerInventoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginBottom: '24px'
  },
  managerInventoryCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)',
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between'
  },
  managerInventoryLabel: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#334155',
    marginBottom: '8px'
  },
  managerInventoryValue: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: '8px'
  },
  managerInventorySubtext: {
    fontSize: '13px',
    color: '#64748b'
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
  lowStockPanel: {
    backgroundColor: '#ffffff',
    border: '1px solid #f3d08a',
    borderRadius: '12px',
    padding: '18px',
    marginBottom: '20px'
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
  ownerPortfolioHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
    flexWrap: 'wrap',
    gap: '10px'
  },
  ownerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '18px'
  },
  ownerCard: {
    padding: '16px',
    borderRadius: '14px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e7eb'
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
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    backgroundColor: '#ffffff'
  },
  summarySection: {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)'
  },
  summaryHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  sectionEyebrow: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: '4px'
  },
  summaryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '700',
    backgroundColor: '#ecfeff',
    color: '#0f766e',
    border: '1px solid #a7f3d0'
  },
  summaryList: {
    display: 'grid',
    gap: '10px'
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.02)'
  },
  summaryItemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  summaryDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    boxShadow: '0 0 0 4px rgba(255,255,255,0.9)'
  },
  summaryTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#0f172a'
  },
  summaryMeta: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '3px'
  },
  summaryAmount: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#0f172a'
  },
  summaryTable: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '640px'
  },
  tableHead: {
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 700,
    color: '#6b7280',
    padding: '12px 14px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e5e7eb'
  },
  tableCell: {
    padding: '12px 14px',
    fontSize: '13px',
    color: '#111827',
    borderBottom: '1px solid #eef2f7'
  },
  emptyTableCell: {
    padding: '16px 14px',
    fontSize: '13px',
    color: '#6b7280',
    textAlign: 'center'
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

// Responsive mobile-first rules
const responsiveStyles = document.createElement('style');
responsiveStyles.textContent = `
  .handover-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .stats-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .summaryList { display: block; }
  @media (min-width: 640px) {
    .handover-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .stats-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .summaryList { display: grid; gap: 10px; }
  }
`;
document.head.appendChild(responsiveStyles);

export default Dashboard;