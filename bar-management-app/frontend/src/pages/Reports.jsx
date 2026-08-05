import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import ExportButton from '../components/common/ExportButton';
import { formatPriceMK } from '../utils/formatPrice';

const toNumber = (value) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const sanitized = String(value).replace(/[^\d.-]/g, '').replace(/,/g, '');
  const parsed = Number(sanitized || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getOrderDate = (order) => {
  const timestamp = order?.createdAt || order?.created_at || order?.date || order?.updatedAt || order?.updated_at || null;
  const parsedDate = timestamp ? new Date(timestamp) : new Date(0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getOrderTotalAmount = (order) => {
  const orderAmount = toNumber(order?.totalAmount);
  if (orderAmount > 0) return orderAmount;

  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => {
    const subtotal = toNumber(item?.subtotal);
    if (subtotal > 0) return sum + subtotal;

    const priceAtSale = toNumber(item?.priceAtSale);
    const quantity = toNumber(item?.quantity);
    return sum + (priceAtSale * quantity);
  }, 0);
};

const getOrderNetAmount = (order) => {
  const netValue = toNumber(order?.netAmount);
  if (netValue > 0) return netValue;
  return getOrderTotalAmount(order);
};

const getPaymentMethodLabel = (method) => {
  const normalized = String(method || '').toLowerCase().trim();
  if (normalized === 'airtel_money' || normalized === 'airtelmoney') return 'Airtel Money';
  if (normalized === 'mpamba') return 'Mpamba';
  if (normalized === 'mobile_money' || normalized === 'mobile-money' || normalized === 'mobile money') return 'Mobile Money';
  if (normalized === 'cash') return 'Cash';
  if (normalized === 'card') return 'Card';
  return String(method || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';
};

const getProductNameFromItem = (item) => {
  const rawName = item?.product?.name || item?.name || '';
  if (rawName && rawName !== 'Product' && rawName !== 'Unknown') {
    return rawName;
  }
  return rawName || 'Unknown';
};

const formatLocalDateString = (date) => {
  if (!(date instanceof Date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [reportData, setReportData] = useState({
    sales: [],
    topProducts: [],
    categorySales: [],
    dailySales: [],
    paymentMethods: [],
    topCustomers: [],
    totalSales: 0,
    totalSalesNet: 0,
    totalTax: 0,
    totalProfit: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    averageItemsPerOrder: 0,
    averageRevenuePerCustomer: 0,
    grossMarginPercentage: 0,
    reversedOrderRate: 0,
    salesGrowthPercentage: 0,
    orderGrowthPercentage: 0,
    customerNames: [],
    productNames: []
  });

  useEffect(() => {
    loadReportData();
  }, [dateRange, customStartDate, customEndDate, paymentFilter, statusFilter, customerFilter, productFilter]);

  const getDateRangeBounds = () => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (dateRange === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'week') {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'month') {
      startDate.setMonth(now.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'year') {
      startDate.setFullYear(now.getFullYear() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'custom' && customStartDate) {
      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = customEndDate ? new Date(customEndDate) : new Date();
      endDate.setHours(23, 59, 59, 999);
      return { currentStart: startDate, currentEnd: endDate };
    }

    endDate.setHours(23, 59, 59, 999);
    return {
      currentStart: startDate,
      currentEnd: endDate
    };
  };

  const filterOrdersByCriteria = (ordersList, includeReversed = true) => {
    return ordersList.filter(order => {
      if (!order) return false;
      if (!includeReversed && order.status === 'reversed') return false;
      return true;
    });
  };

  const loadReportData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { currentStart, currentEnd } = getDateRangeBounds();
      const rangeLengthMs = currentEnd.getTime() - currentStart.getTime();
      const previousEnd = new Date(currentStart.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - rangeLengthMs);

      const buildParams = (start, end) => {
        // send explicit UTC bounds so server groups by client's local day
        const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
        const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
        const params = {
          startDateUtc: startLocal.toISOString(),
          endDateUtc: endLocal.toISOString()
        };
        if (paymentFilter !== 'all') params.paymentMethod = paymentFilter;
        if (statusFilter !== 'all') params.status = statusFilter;
        if (customerFilter !== 'all') params.customerName = customerFilter;
        if (productFilter !== 'all') params.productName = productFilter;
        return params;
      };

      const currentParams = buildParams(currentStart, currentEnd);
      const previousParams = buildParams(previousStart, previousEnd);

      const [ordersRes, previousRes, productsRes] = await Promise.all([
        api.get('/orders', { params: { ...currentParams, summaryOnly: true } }),
        api.get('/orders', { params: { ...previousParams, summaryOnly: true } }),
        api.get('/products')
      ]);

      const currentSummary = ordersRes.data || {};
      const previousSummary = previousRes.data || {};

      const totalSales = typeof currentSummary.totalSales === 'number' ? currentSummary.totalSales : 0;
      const totalTax = typeof currentSummary.totalTax === 'number' ? currentSummary.totalTax : 0;
      const totalSalesNet = typeof currentSummary.totalSalesNet === 'number' ? currentSummary.totalSalesNet : 0;
      const totalProfit = typeof currentSummary.totalProfit === 'number' ? currentSummary.totalProfit : 0;
      const totalOrders = typeof currentSummary.totalOrders === 'number' ? currentSummary.totalOrders : (typeof currentSummary.count === 'number' ? currentSummary.count : 0);
      const averageOrderValue = typeof currentSummary.averageOrderValue === 'number' ? currentSummary.averageOrderValue : 0;
      const averageItemsPerOrder = typeof currentSummary.averageItemsPerOrder === 'number' ? currentSummary.averageItemsPerOrder : 0;
      const averageRevenuePerCustomer = typeof currentSummary.averageRevenuePerCustomer === 'number' ? currentSummary.averageRevenuePerCustomer : 0;
      const topCustomers = Array.isArray(currentSummary.topCustomers) ? currentSummary.topCustomers : [];
      const topProducts = Array.isArray(currentSummary.topProducts) ? currentSummary.topProducts : [];
      const topProfitProducts = Array.isArray(currentSummary.topProfitProducts) ? currentSummary.topProfitProducts : [];
      const categorySales = Array.isArray(currentSummary.categorySales) ? currentSummary.categorySales : [];
      const dailySales = Array.isArray(currentSummary.dailySales) ? currentSummary.dailySales : [];
      const paymentMethods = Array.isArray(currentSummary.paymentMethods) ? currentSummary.paymentMethods : [];
      const totalSalesPrevious = typeof previousSummary.totalSales === 'number' ? previousSummary.totalSales : 0;
      const previousOrderCount = typeof previousSummary.totalOrders === 'number' ? previousSummary.totalOrders : (typeof previousSummary.count === 'number' ? previousSummary.count : 0);
      const salesGrowthPercentage = totalSalesPrevious > 0 ? ((totalSales - totalSalesPrevious) / totalSalesPrevious) * 100 : totalSales > 0 ? 100 : 0;
      const orderGrowthPercentage = previousOrderCount > 0 ? ((totalOrders - previousOrderCount) / previousOrderCount) * 100 : totalOrders > 0 ? 100 : 0;
      const reversedOrderRate = typeof currentSummary.reversedOrderRate === 'number' ? currentSummary.reversedOrderRate : 0;

      const customerNames = Array.isArray(currentSummary.customerNames) ? currentSummary.customerNames : [];
      const productNames = Array.isArray(currentSummary.productNames) ? currentSummary.productNames : [];

      setReportData({
        topProducts,
        topCustomers,
        categorySales,
        dailySales,
        paymentMethods,
        topProfitProducts,
        totalSales,
        totalSalesNet,
        totalTax,
        totalProfit,
        totalOrders,
        averageOrderValue,
        averageItemsPerOrder,
        averageRevenuePerCustomer,
        grossMarginPercentage: totalSales ? (totalProfit / totalSales) * 100 : 0,
        reversedOrderRate,
        salesGrowthPercentage,
        orderGrowthPercentage,
        customerNames,
        productNames
      });

    } catch (err) {
      console.error('Error loading report data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const safeDailySales = Array.isArray(reportData.dailySales) ? reportData.dailySales : [];
  const safeTopProducts = Array.isArray(reportData.topProducts) ? reportData.topProducts : [];
  const safeCategorySales = Array.isArray(reportData.categorySales) ? reportData.categorySales : [];
  const safeTopProfitProducts = Array.isArray(reportData.topProfitProducts) ? reportData.topProfitProducts : [];
  const safePaymentMethods = Array.isArray(reportData.paymentMethods) ? reportData.paymentMethods : [];

  // Ensure numeric values for charting and surface mismatches between summed daily profit and totalProfit
  const numericDailySales = safeDailySales.map(d => ({ date: d.date, sales: Number(d.sales || 0), profit: Number(d.profit || 0) }));
  const computedDailyProfitTotal = numericDailySales.reduce((s, d) => s + d.profit, 0);
  if (Math.abs(computedDailyProfitTotal - (reportData.totalProfit || 0)) > 0.0001) {
    console.warn('Reports: dailySales profit sum does not match totalProfit', { computedDailyProfitTotal, totalProfit: reportData.totalProfit });
  }

  const dailySalesChartData = {
    labels: numericDailySales.map(d => d.date),
    datasets: [
      {
        label: 'Sales (MK)',
        data: numericDailySales.map(d => d.sales),
        backgroundColor: 'rgba(233, 69, 96, 0.6)',
        borderColor: '#e94560',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      },
      {
        label: 'Profit (MK)',
        data: numericDailySales.map(d => d.profit),
        backgroundColor: 'rgba(46, 204, 113, 0.6)',
        borderColor: '#2ecc71',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      }
    ]
  };

  const topProductsChartData = {
    labels: safeTopProducts.map(p => p.name),
    datasets: [
      {
        label: 'Revenue (MK)',
        data: safeTopProducts.map(p => p.revenue),
        backgroundColor: [
          '#e94560', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#2c3e50', '#e74c3c', '#00bcd4'
        ],
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const categoryChartData = {
    labels: safeCategorySales.map(c => c.name),
    datasets: [
      {
        label: 'Revenue (MK)',
        data: safeCategorySales.map(c => c.revenue),
        backgroundColor: [
          '#e94560', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#2c3e50'
        ],
        borderWidth: 1
      }
    ]
  };

  const topProfitProductsChartData = {
    labels: safeTopProfitProducts.map(p => p.name),
    datasets: [
      {
        label: 'Profit (MK)',
        data: safeTopProfitProducts.map(p => Number(p.profit ?? 0)),
        backgroundColor: [
          '#2ecc71', '#16a085', '#3498db', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#2c3e50', '#e74c3c', '#00bcd4'
        ],
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const paymentChartData = {
    labels: safePaymentMethods.map(p => p.label || p.method),
    datasets: [
      {
        label: 'Sales (MK)',
        data: safePaymentMethods.map(p => p.amount),
        backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'],
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 12 },
          usePointStyle: true,
          padding: 20
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return 'MK ' + value.toLocaleString();
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <PageContainer title="📊 Reports">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading report data...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="📊 Reports">
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryBtn} onClick={loadReportData}>Retry</button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📊 Reports & Analytics">
      <div className="reports-page">
        {/* Date Range Filter & Export Buttons */}
        <div style={styles.filterContainer} className="reports-filterContainer">
          <div style={styles.filterGroup} className="reports-filterGroup">
            <label style={styles.filterLabel}>Date Range:</label>
            <div style={styles.filterButtons} className="reports-filterButtons">
              {['today', 'week', 'month', 'year', 'custom'].map((range, index) => (
                <button
                  key={range}
                  className={`fade-in delay-${(index % 4) + 1}`}
                  style={{
                    ...styles.filterBtn,
                    ...(dateRange === range ? styles.filterBtnActive : {})
                  }}
                  onClick={() => setDateRange(range)}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button 
            className="reports-refreshBtn"
            style={styles.refreshBtn} 
            onClick={loadReportData}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e94560';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#e94560';
            }}
          >
            🔄 Refresh
          </button>
      </div>

      <div style={styles.filterPanel} className="reports-filterPanel">
        {dateRange === 'custom' && (
          <div style={styles.dateInputs}>
            <label style={styles.filterLabel}>From
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} style={styles.input} />
            </label>
            <label style={styles.filterLabel}>To
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={styles.input} />
            </label>
          </div>
        )}
        <div style={styles.filterGrid} className="reports-filterGrid">
          <label style={styles.filterLabel}>Payment
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={styles.input}>
              <option value="all">All</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="airtel_money">Airtel Money</option>
              <option value="mpamba">Mpamba</option>
            </select>
          </label>
          <label style={styles.filterLabel}>Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.input}>
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="reversed">Reversed</option>
            </select>
          </label>
          <label style={styles.filterLabel}>Customer
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} style={styles.input}>
              <option value="all">All</option>
              {reportData.customerNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label style={styles.filterLabel}>Product
            <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} style={styles.input}>
              <option value="all">All</option>
              {reportData.productNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={styles.reportNote} className="reports-reportNote">
        Backend filtered totals are shown here for the selected date range and filters. Reversed orders are excluded from sales, tax, and profit totals.
      </div>

      {/* Export Buttons */}
      <div style={styles.exportSection} className="reports-exportSection">
        <ExportButton type="sales" label="Export Sales (Excel)" icon="📊" variant="success" />
        <ExportButton type="sales-pdf" label="Export Sales (PDF)" icon="📄" variant="info" />
        <ExportButton type="inventory" label="Export Inventory" icon="📦" variant="warning" />
        <ExportButton type="customers" label="Export Customers" icon="👤" variant="secondary" />
      </div>

      {/* Summary Cards with Animations */}
      <div style={styles.summaryGrid} className="reports-summaryGrid">
        {[
          { title: 'Total Sales', value: formatPriceMK(reportData.totalSales), icon: '💰', color: '#e94560', delay: 1 },
          { title: 'Net Sales', value: formatPriceMK(reportData.totalSalesNet), icon: '💵', color: '#16a085', delay: 2 },
          { title: 'Total Tax', value: formatPriceMK(reportData.totalTax), icon: '🧾', color: '#f39c12', delay: 3 },
          { title: 'Total Profit', value: formatPriceMK(reportData.totalProfit), icon: '📈', color: '#2ecc71', delay: 4 },
          { title: 'Total Orders', value: reportData.totalOrders, icon: '🛒', color: '#3498db', delay: 5 },
          { title: 'Average Order', value: formatPriceMK(reportData.averageOrderValue), icon: '📊', color: '#9b59b6', delay: 6 },
          { title: 'Avg Items / Order', value: reportData.averageItemsPerOrder.toFixed(1), icon: '📦', color: '#f39c12', delay: 7 },
          { title: 'Gross Margin', value: `${reportData.grossMarginPercentage.toFixed(1)}%`, icon: '💹', color: '#16a085', delay: 8 },
          { title: 'Avg Rev / Customer', value: formatPriceMK(reportData.averageRevenuePerCustomer), icon: '👥', color: '#8e44ad', delay: 9 },
          { title: 'Reversal Rate', value: `${reportData.reversedOrderRate.toFixed(1)}%`, icon: '↺', color: '#c0392b', delay: 10 }
        ].map((item, index) => (
          <div 
            key={index}
            className={`reports-summaryCard fade-in delay-${item.delay}`}
            style={{
              ...styles.summaryCard,
              borderLeft: `4px solid ${item.color}`,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }}
          >
            <span style={styles.summaryIcon}>{item.icon}</span>
            <div>
              <p style={styles.summaryLabel}>{item.title}</p>
              <p style={styles.summaryValue}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Portfolio Growth Cards */}
      <div style={styles.portfolioGrid} className="reports-portfolioGrid">
        {[
          { title: 'Sales Growth', value: `${reportData.salesGrowthPercentage.toFixed(1)}%`, detail: 'vs previous period', color: '#3498db' },
          { title: 'Order Growth', value: `${reportData.orderGrowthPercentage.toFixed(1)}%`, detail: 'vs previous period', color: '#27ae60' },
          { title: 'Repeat Customer Ratio', value: reportData.topCustomers.length > 0 ? `${((reportData.topCustomers.filter((_, i) => i < 5).length / reportData.topCustomers.length) * 100).toFixed(1)}%` : '0%', detail: 'top customer share', color: '#9b59b6' }
        ].map((item, index) => (
          <div key={index} className={`fade-in delay-${index + 1}`} style={{ ...styles.portfolioCard, borderLeft: `4px solid ${item.color}` }}>
            <p style={styles.portfolioTitle}>{item.title}</p>
            <p style={styles.portfolioValue}>{item.value}</p>
            <p style={styles.portfolioDetail}>{item.detail}</p>
          </div>
        ))}
      </div>

      {/* Charts Grid with Animations */}
      <div style={styles.chartsGrid} className="reports-chartsGrid">
        <div className="fade-in delay-1 reports-chartWrapper" style={styles.chartWrapper}>
          <UnifiedCard title="📈 Daily Sales & Profit Trend" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.dailySales.length > 0 ? (
                <Line data={dailySalesChartData} options={chartOptions} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>📊</p>
                  <p>No sales data available for this period</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-2 reports-chartWrapper" style={styles.chartWrapper}>
          <UnifiedCard title="🏆 Top Selling Products" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.topProducts.length > 0 ? (
                <Bar data={topProductsChartData} options={{
                  ...chartOptions,
                  plugins: {
                    ...chartOptions.plugins,
                    legend: { display: false }
                  }
                }} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>🏆</p>
                  <p>No product data available</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-3 reports-chartWrapper" style={styles.chartWrapper}>
          <UnifiedCard title="📁 Sales by Category" style={styles.chartCard}>
            <div style={styles.chartContainer}>
              {reportData.categorySales.length > 0 ? (
                <Pie data={categoryChartData} options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: { font: { size: 11 } }
                    }
                  }
                }} />
              ) : (
                <div style={styles.noData}>
                  <p style={styles.noDataIcon}>📁</p>
                  <p>No category data available</p>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-4 reports-chartWrapper" style={styles.chartWrapper}>
          <UnifiedCard title="💹 Top Profit Products" style={styles.chartCard}>
            <div style={styles.profitCardLayout}>
              <div style={styles.chartBlock}>
                <div style={styles.chartContainer}>
                  {reportData.topProfitProducts.length > 0 ? (
                    <Bar data={topProfitProductsChartData} options={{
                      ...chartOptions,
                      plugins: {
                        ...chartOptions.plugins,
                        legend: { display: false }
                      }
                    }} />
                  ) : (
                    <div style={styles.noData}>
                      <p style={styles.noDataIcon}>💹</p>
                      <p>No profit data available</p>
                    </div>
                  )}
                </div>
              </div>

              {reportData.topProfitProducts.length > 0 && (
                <div style={styles.profitTableContainer}>
                  <table style={styles.profitTable}>
                    <thead>
                      <tr>
                        <th style={styles.profitTableHeader}>Product</th>
                        <th style={styles.profitTableHeader}>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topProfitProducts.slice(0, 5).map((product) => (
                        <tr key={product.name} style={styles.profitTableRow}>
                          <td style={styles.profitTableCell}>{product.name}</td>
                          <td style={{ ...styles.profitTableCell, ...styles.profitTableAmount }}>
                            {formatPriceMK(product.profit || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>

        <div className="fade-in delay-4 reports-chartWrapper" style={styles.chartWrapper}>
          <UnifiedCard title="💳 Sales by Payment Method" style={styles.chartCard}>
            <div style={styles.paymentCardLayout}>
              <div style={styles.paymentCardsRow}>
                <div style={styles.paymentStatPill}>
                  <span style={styles.paymentStatLabel}>Total sales</span>
                  <strong style={styles.paymentStatValue}>{formatPriceMK(reportData.totalSales || 0)}</strong>
                </div>
                <div style={styles.paymentStatPillAccent}>
                  <span style={styles.paymentStatLabel}>Methods</span>
                  <strong style={styles.paymentStatValue}>{reportData.paymentMethods.length || 0}</strong>
                </div>
              </div>

              <div style={styles.chartContainer}>
                {reportData.paymentMethods.length > 0 ? (
                  <Bar data={paymentChartData} options={{
                    ...chartOptions,
                    plugins: {
                      ...chartOptions.plugins,
                      legend: { display: false }
                    },
                    scales: {
                      ...chartOptions.scales,
                      y: {
                        ...chartOptions.scales.y,
                        ticks: {
                          callback: function(value) {
                            return 'MK ' + Number(value).toLocaleString();
                          }
                        }
                      }
                    }
                  }} />
                ) : (
                  <div style={styles.noData}>
                    <p style={styles.noDataIcon}>💳</p>
                    <p>No payment data available</p>
                  </div>
                )}
              </div>

              {reportData.paymentMethods.length > 0 && (
                <div style={styles.paymentMiniTable}>
                  <div style={styles.paymentMiniHeader}>
                    <span>Method</span>
                    <span>Value</span>
                  </div>
                  {reportData.paymentMethods.slice(0, 4).map((payment) => (
                    <div key={payment.method} style={styles.paymentMiniRow}>
                      <div style={styles.paymentMethodNameWrap}>
                        <span style={{
                          ...styles.paymentDot,
                          backgroundColor: payment.method?.toLowerCase().includes('cash') ? '#2ecc71' :
                            payment.method?.toLowerCase().includes('card') ? '#3498db' :
                            payment.method?.toLowerCase().includes('airtel') ? '#f39c12' :
                            payment.method?.toLowerCase().includes('mpamba') ? '#9b59b6' : '#16a085'
                        }} />
                        <span>{payment.label || payment.method}</span>
                      </div>
                      <strong style={styles.paymentMiniAmount}>{formatPriceMK(payment.amount || 0)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </UnifiedCard>
        </div>
      </div>

      {reportData.paymentMethods.length > 0 && (
        <div className="fade-in delay-5" style={{ marginTop: '20px' }}>
          <UnifiedCard title="💵 Payment Summary by Amount">
            <div style={styles.tableWrapper} className="reports-tableWrapper">
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Payment Method</th>
                    <th>Transactions</th>
                    <th>Sales Value</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.paymentMethods.map((payment) => (
                    <tr key={payment.method} style={styles.tableRow}>
                      <td style={styles.productName}>{payment.label || payment.method}</td>
                      <td>{payment.count}</td>
                      <td style={styles.revenue}>{formatPriceMK(payment.amount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UnifiedCard>
        </div>
      )}

      {/* Top Customers Table */}
      {reportData.topCustomers.length > 0 && (
        <div className="fade-in delay-5">
          <UnifiedCard title="🏅 Top Customers by Revenue">
            <div style={styles.tableWrapper} className="reports-tableWrapper">
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.topCustomers.map((customer, index) => (
                    <tr key={index} style={styles.tableRow}>
                      <td style={styles.rank}>{index + 1}</td>
                      <td style={styles.productName}>{customer.name}</td>
                      <td style={styles.revenue}>{formatPriceMK(customer.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UnifiedCard>
        </div>
      )}

      {/* Top Products Table */}
      {reportData.topProducts.length > 0 && (
        <div className="fade-in delay-5">
          <UnifiedCard title="📋 Top Products Details">
            <div style={styles.tableWrapper} className="reports-tableWrapper">
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Quantity Sold</th>
                    <th>Revenue</th>
                    <th>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.topProducts.map((product, index) => (
                    <tr 
                      key={index}
                      style={styles.tableRow}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={styles.rank}>{index + 1}</td>
                      <td style={styles.productName}>{product.name}</td>
                      <td>{product.quantity}</td>
                      <td style={styles.revenue}>{formatPriceMK(product.revenue)}</td>
                      <td>
                        <div style={styles.percentBar}>
                          <div style={{
                            ...styles.percentFill,
                            width: `${(product.revenue / reportData.totalSales) * 100}%`,
                            backgroundColor: index === 0 ? '#e94560' : 
                                          index === 1 ? '#3498db' : 
                                          index === 2 ? '#2ecc71' : '#f39c12'
                          }} />
                          <span style={styles.percentText}>
                            {((product.revenue / reportData.totalSales) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UnifiedCard>
        </div>
      )}
    </div>
  </PageContainer>
  );
};

const styles = {
  filterContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '15px'
  },
  filterPanel: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '14px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  dateInputs: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '10px'
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px'
  },
  input: {
    width: '100%',
    marginTop: '4px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '14px'
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    width: '100%'
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  filterButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  filterBtn: {
    padding: '8px 14px',
    borderRadius: '20px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.3s ease'
  },
  filterBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  refreshBtn: {
    padding: '10px 20px',
    borderRadius: '10px',
    border: '2px solid #e94560',
    backgroundColor: 'transparent',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  exportSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '10px',
    marginBottom: '25px',
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  reportNote: {
    margin: '16px 0',
    padding: '14px 18px',
    borderRadius: '14px',
    backgroundColor: '#f8fafc',
    border: '1px solid #d1d5db',
    color: '#334155',
    fontSize: '14px',
    lineHeight: '1.6'
  },
  portfolioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '18px',
    marginBottom: '24px'
  },
  portfolioCard: {
    backgroundColor: 'white',
    padding: '18px 20px',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  portfolioTitle: {
    fontSize: '13px',
    color: '#888',
    margin: 0
  },
  portfolioValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
    margin: 0
  },
  portfolioDetail: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '30px',
    width: '100%'
  },
  summaryCard: {
    backgroundColor: 'white',
    padding: '16px 18px',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    minHeight: '86px'
  },  summaryIcon: {
    fontSize: '32px'
  },
  summaryLabel: {
    fontSize: '13px',
    color: '#888',
    margin: '0 0 4px 0'
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    margin: 0
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    marginBottom: '20px',
    width: '100%'
  },
  chartWrapper: {
    width: '100%'
  },
  chartCard: {
    marginBottom: '0'
  },
  chartContainer: {
    minHeight: '220px',
    height: '100%',
    width: '100%',
    position: 'relative'
  },
  profitCardLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minWidth: 0
  },
  chartBlock: {
    width: '100%',
    minWidth: 0
  },
  profitTableContainer: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '10px',
    overflow: 'hidden',
    minWidth: 0,
    width: '100%'
  },
  profitTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    tableLayout: 'fixed'
  },
  profitTableHeader: {
    textAlign: 'left',
    padding: '8px 6px',
    color: '#64748b',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: '600'
  },
  profitTableRow: {
    borderBottom: '1px solid #f1f5f9'
  },
  profitTableCell: {
    padding: '8px 6px',
    color: '#1f2937',
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  profitTableAmount: {
    fontWeight: '700',
    color: '#16a085',
    textAlign: 'right'
  },
  paymentCardLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  paymentCardsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px'
  },
  paymentStatPill: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    background: 'linear-gradient(135deg, #ecfdf5 0%, #dcfce7 100%)',
    border: '1px solid #bbf7d0',
    borderRadius: '12px',
    padding: '10px 12px'
  },
  paymentStatPillAccent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    border: '1px solid #bfdbfe',
    borderRadius: '12px',
    padding: '10px 12px'
  },
  paymentStatLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  paymentStatValue: {
    fontSize: '16px',
    color: '#0f172a',
    fontWeight: '800'
  },
  paymentMiniTable: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '8px 10px'
  },
  paymentMiniHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#64748b',
    padding: '4px 0 8px'
  },
  paymentMiniRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderTop: '1px solid #e2e8f0'
  },
  paymentMethodNameWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#334155'
  },
  paymentDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
    boxShadow: '0 0 0 3px rgba(255,255,255,0.8)'
  },
  paymentMiniAmount: {
    fontSize: '12px',
    color: '#0f172a',
    fontWeight: '800'
  },
  noData: {
    textAlign: 'center',
    color: '#888',
    padding: '40px 0',
    fontSize: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  },
  noDataIcon: {
    fontSize: '48px',
    marginBottom: '10px'
  },
  tableWrapper: {
    overflowX: 'auto',
    width: '100%'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    minWidth: '600px'
  },
  tableRow: {
    transition: 'background 0.2s ease',
    cursor: 'pointer'
  },
  rank: {
    fontWeight: 'bold',
    color: '#888',
    textAlign: 'center'
  },
  productName: {
    fontWeight: '500',
    color: '#1a1a2e'
  },
  revenue: {
    fontWeight: 'bold',
    color: '#2ecc71'
  },
  percentBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  percentFill: {
    height: '8px',
    borderRadius: '4px',
    minWidth: '20px',
    transition: 'width 0.5s ease'
  },
  percentText: {
    fontSize: '12px',
    color: '#888',
    minWidth: '45px'
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
    width: '48px',
    height: '48px',
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
    padding: '20px'
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '15px'
  },
  errorText: {
    fontSize: '16px',
    color: '#e74c3c',
    marginBottom: '15px'
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
  @media (max-width: 900px) {
    .reports-page {
      padding: 0 10px;
    }

    .reports-filterContainer {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .reports-filterGroup {
      width: 100%;
    }

    .reports-filterButtons {
      flex-wrap: wrap;
      gap: 8px;
    }

    .reports-filterButtons button,
    .reports-refreshBtn {
      width: 100%;
    }

    .reports-exportSection {
      grid-template-columns: 1fr;
    }

    .reports-summaryGrid,
    .reports-portfolioGrid,
    .reports-chartsGrid {
      grid-template-columns: 1fr;
    }

    .reports-summaryCard {
      flex-direction: column;
      align-items: flex-start;
      width: 100%;
    }

    .reports-chartWrapper {
      width: 100%;
    }

    .reports-chartWrapper > div {
      min-height: 260px;
    }

    .reports-tableWrapper {
      overflow-x: auto;
    }

    .reports-filterPanel {
      padding: 12px;
    }
  }

  @media (max-width: 640px) {
    .reports-filterPanel {
      padding: 12px;
    }

    .reports-filterGrid {
      grid-template-columns: 1fr;
    }

    .reports-exportSection {
      padding: 12px;
      gap: 8px;
    }

    .reports-summaryCard {
      padding: 14px 16px;
    }

    .reports-summaryValue {
      font-size: 18px;
    }

    .reports-tableWrapper table {
      font-size: 12px;
      min-width: auto;
    }

    .reports-tableWrapper th,
    .reports-tableWrapper td {
      padding: 10px 8px;
    }
  }
`;
document.head.appendChild(styleSheet);

export default Reports;