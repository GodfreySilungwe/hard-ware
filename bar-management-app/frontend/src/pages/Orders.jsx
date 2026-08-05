import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { formatPriceMK } from '../utils/formatPrice';
import { useAuth } from '../context/AuthContext';

const getPaymentMethodLabel = (method) => {
  const normalized = String(method || '').toLowerCase().trim();
  if (normalized === 'airtel_money' || normalized === 'airtelmoney') return 'Airtel Money';
  if (normalized === 'mpamba') return 'Mpamba';
  if (normalized === 'mobile_money' || normalized === 'mobile-money' || normalized === 'mobile money') return 'Mobile Money';
  if (normalized === 'cash') return 'Cash';
  if (normalized === 'card') return 'Card';
  return String(method || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';
};

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageTotals, setPageTotals] = useState({ totalSales: 0, totalProfit: 0 });
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reverseTarget, setReverseTarget] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    loadOrders();
  }, [page, filter]);

  const formatLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loadOrders = async (pageOverride) => {
    setLoading(true);
    try {
      const currentPage = pageOverride || page;
      const params = { page: currentPage, limit };
      let endpoint = '/orders';

      if (filter === 'today') {
        const now = new Date();
        const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        params.startDateUtc = startLocal.toISOString();
        params.endDateUtc = endLocal.toISOString();
      }

      if (startDate) {
        const [ys, ms, ds] = startDate.split('-').map((p) => Number(p));
        const sLocal = new Date(ys, ms - 1, ds, 0, 0, 0, 0);
        params.startDateUtc = sLocal.toISOString();
      }
      if (endDate) {
        const [ye, me, de] = endDate.split('-').map((p) => Number(p));
        const eLocal = new Date(ye, me - 1, de, 23, 59, 59, 999);
        params.endDateUtc = eLocal.toISOString();
      }

      const res = await api.get(endpoint, { params });
      const payload = res.data;
      const data = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.orders)
          ? payload.orders
          : [];

      const normalizedOrders = data.map((order) => ({
        ...order,
        paymentMethodLabel: order.paymentMethodLabel || getPaymentMethodLabel(order.paymentMethod)
      }));

      const count = typeof payload.totalCount === 'number' ? payload.totalCount : normalizedOrders.length;
      const metricOrders = typeof payload.count === 'number' ? payload.count : normalizedOrders.filter((order) => order.status !== 'reversed').length;
      const pages = typeof payload.totalPages === 'number' ? payload.totalPages : Math.max(1, Math.ceil(count / limit));
      const totalSales = typeof payload.totalSales === 'number' ? payload.totalSales : normalizedOrders.filter((order) => order.status !== 'reversed').reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const totalProfit = typeof payload.totalProfit === 'number' ? payload.totalProfit : normalizedOrders.filter((order) => order.status !== 'reversed').reduce((sum, order) => sum + Number(order.profit || 0), 0);

      setOrders(normalizedOrders);
      setPageTotals({ totalSales, totalProfit, metricOrders });
      setTotalCount(count);
      setTotalPages(pages);
      setHasMore(currentPage < pages);
    } catch (err) {
      console.error('Error loading orders:', err);
      setOrders([]);
      setPageTotals({ totalSales: 0, totalProfit: 0, metricOrders: 0 });
      setTotalCount(0);
      setTotalPages(1);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (orderId) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  const handleDateApply = () => {
    setPage(1);
    loadOrders();
  };

  const handleClearDates = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
    loadOrders();
  };

  const handleReverseOrder = async () => {
    if (!reverseTarget) return;

    try {
      const res = await api.patch(`/orders/${reverseTarget._id}/reverse`, { reason: 'Manager reversal' });
      setOrders(prev => prev.map(item => item._id === reverseTarget._id ? res.data : item));
      setMessage('✅ Sale reversed successfully and inventory restored.');
      setError('');
      setReverseTarget(null);
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Error reversing order:', err);
      setError(err.response?.data?.message || '❌ Unable to reverse sale');
      setMessage('');
      setTimeout(() => setError(''), 4000);
    }
  };

  const getItemName = (item) => {
    if (!item) return 'Unknown';

    if (item.product && typeof item.product === 'object') {
      const productName = item.product.name;
      if (productName && productName !== 'Product' && productName !== 'Unknown') return productName;
      if (item.product._id) return item.product._id;
    }

    if (item.product && typeof item.product === 'string') {
      return item.product;
    }

    if (item.name && item.name !== 'Product' && item.name !== 'Unknown') return item.name;
    return 'Unknown';
  };

  const canReverse = (order) => {
    return (user?.role === 'hardware-manager' || user?.role === 'owner') && order?.status !== 'reversed';
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      setPage(page + 1);
    }
  };

  const isSalesRole = user?.role === 'sales';
  const filteredOrders = orders;
  const totalSales = pageTotals.totalSales;
  const totalProfit = pageTotals.totalProfit;
  const metricOrders = pageTotals.metricOrders ?? totalCount;

  if (loading) {
    return (
      <PageContainer title="📋 Orders">
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading orders...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="📋 Orders">
      <DeleteConfirmModal
        open={Boolean(reverseTarget)}
        title="Reverse sale"
        description={`Type delete to reverse order ${reverseTarget?.orderNumber || ''} and restore inventory.`}
        onCancel={() => setReverseTarget(null)}
        onConfirm={handleReverseOrder}
      />
      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.header}>
        <div>
          <p style={styles.subtitle}>View all orders and transactions</p>
          <div style={styles.dateFilterRow}>
            <label style={styles.dateInputLabel}>
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.dateInput}
              />
            </label>
            <label style={styles.dateInputLabel}>
              To
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.dateInput}
              />
            </label>
            <button style={styles.applyBtn} onClick={handleDateApply}>Apply</button>
            <button style={styles.clearBtn} onClick={handleClearDates}>Clear</button>
          </div>
        </div>
        <div style={styles.filters}>
          {['all', 'today'].map((filterOption, index) => (
            <button
              key={filterOption}
              className={`fade-in delay-${(index % 4) + 1}`}
              style={{
                ...styles.filterBtn,
                ...(filter === filterOption ? styles.filterBtnActive : {})
              }}
              onClick={() => {
                setFilter(filterOption);
                setPage(1);
                setStartDate('');
                setEndDate('');
              }}
              onMouseEnter={(e) => {
                if (filter !== filterOption) {
                  e.currentTarget.style.backgroundColor = '#f0f0f0';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== filterOption) {
                  e.currentTarget.style.backgroundColor = 'white';
                }
              }}
            >
              {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards with Animations */}
      <div style={styles.summary}>
        {[
          { label: 'Total orders', value: metricOrders, icon: '📋', color: '#3498db', delay: 1 },
          { label: 'Total sales', value: formatPriceMK(totalSales), icon: '💰', color: '#2ecc71', delay: 2 },
          ...(!isSalesRole ? [{ label: 'Total profit', value: formatPriceMK(totalProfit), icon: '📈', color: '#e94560', delay: 3 }] : [])
        ].map((item, index) => (
          <div 
            key={index}
            className={`fade-in delay-${item.delay}`}
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
              <span style={styles.summaryLabel}>{item.label}</span>
              <span style={styles.summaryValue}>{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.pagination}>
        <button style={styles.paginationBtn} onClick={handlePrevPage} disabled={page === 1}>
          ← Previous
        </button>
        <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
        <span style={styles.pageInfo}>(Total orders: {totalCount})</span>
        <button style={styles.paginationBtn} onClick={handleNextPage} disabled={!hasMore}>
          Next →
        </button>
      </div>

      {/* Orders List */}
      <div className="fade-in">
        <UnifiedCard title={`Orders (${filteredOrders.length})`}>
          {filteredOrders.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>📋</p>
              <p style={styles.emptyText}>No orders found</p>
              <p style={styles.emptySubtext}>Orders will appear here once you start selling</p>
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Amount</th>
                    {!isSalesRole && <th>Profit</th>}
                    <th>Payment</th>
                    <th>Date</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, index) => (
                    <>
                      <tr 
                        key={order._id}
                        className={`fade-in delay-${(index % 6) + 1}`}
                        style={styles.tableRow}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <td style={styles.orderNumber}>{order.orderNumber}</td>
                        <td>{order.customer?.name || 'Walk-in'}</td>
                        <td>
                          <span style={styles.itemCount}>
                            {order.items.length} item{order.items.length > 1 ? 's' : ''}
                          </span>
                        </td>
                        <td style={styles.amount}>{formatPriceMK(order.totalAmount)}</td>
                        {!isSalesRole && <td style={styles.profit}>+{formatPriceMK(order.profit)}</td>}
                        <td>
                          <span style={{
                            ...styles.paymentBadge,
                            ...(order.paymentMethod === 'cash' ? styles.cash : 
                                order.paymentMethod === 'card' ? styles.card : 
                                styles.mobile)
                          }}>
                            {getPaymentMethodLabel(order.paymentMethod)}
                          </span>
                        </td>
                        <td style={styles.date}>{new Date(order.createdAt).toLocaleString()}</td>
                        <td>
                          <span style={{...styles.statusBadge, ...(order.status === 'reversed' ? styles.reversedBadge : styles.activeBadge)}}>
                            {order.status === 'reversed' ? 'Reversed' : 'Completed'}
                          </span>
                          <div style={styles.actionsCell}>
                            <button
                              style={styles.detailsBtn}
                              onClick={() => toggleExpand(order._id)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e94560';
                                e.currentTarget.style.color = 'white';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'white';
                                e.currentTarget.style.color = '#333';
                              }}
                            >
                              {expandedOrder === order._id ? '▲ Hide' : '▼ View'}
                            </button>
                            {canReverse(order) && (
                              <button
                                style={styles.reverseBtn}
                                onClick={() => setReverseTarget(order)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#27ae60';
                                  e.currentTarget.style.color = 'white';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fef2f2';
                                  e.currentTarget.style.color = '#b91c1c';
                                }}
                              >
                                ↺ Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedOrder === order._id && (
                        <tr className="fade-in delay-1">
                          <td colSpan="8" style={styles.detailsRow}>
                            <div style={styles.orderDetails}>
                              <h4 style={styles.detailsTitle}>📦 Order Items</h4>
                              {order.items.map((item, itemIndex) => (
                                <div 
                                  key={itemIndex} 
                                  style={{
                                    ...styles.orderItem,
                                    ...(itemIndex === order.items.length - 1 ? styles.orderItemLast : {})
                                  }}
                                >
                                  <span style={styles.itemName}>
                                    {getItemName(item)}
                                  </span>
                                  <span style={styles.itemQuantity}>
                                    × {item.quantity}
                                  </span>
                                  <span style={styles.itemPrice}>
                                    {formatPriceMK(item.priceAtSale)}
                                  </span>
                                  <span style={styles.itemSubtotal}>
                                    = {formatPriceMK(item.subtotal)}
                                  </span>
                                </div>
                              ))}
                              <div style={styles.orderTotal}>
                                <span>Total: {formatPriceMK(order.totalAmount)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </UnifiedCard>
      </div>
    </PageContainer>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '10px',
    width: '100%'
  },
  subtitle: {
    fontSize: '16px',
    color: '#888',
    margin: 0
  },
  filters: {
    display: 'flex',
    gap: '8px'
  },
  filterBtn: {
    padding: '6px 16px',
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
  dateFilterRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '10px'
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
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    margin: '18px 0'
  },
  paginationBtn: {
    padding: '8px 14px',
    borderRadius: '999px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    minWidth: '100px',
    transition: 'all 0.2s ease'
  },
  pageInfo: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '600'
  },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '15px',
    marginBottom: '20px',
    width: '100%'
  },
  summaryCard: {
    backgroundColor: 'white',
    padding: '18px 20px',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  summaryIcon: {
    fontSize: '32px'
  },
  summaryLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#888',
    marginBottom: '2px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  summaryValue: {
    display: 'block',
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#1a1a2e'
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
  itemCount: {
    color: '#666',
    fontSize: '13px'
  },
  amount: {
    fontWeight: 'bold',
    color: '#2ecc71'
  },
  profit: {
    color: '#3498db',
    fontWeight: '500'
  },
  date: {
    fontSize: '12px',
    color: '#888',
    whiteSpace: 'nowrap'
  },
  paymentBadge: {
    padding: '4px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'capitalize',
    display: 'inline-block'
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'inline-block',
    marginBottom: '6px'
  },
  activeBadge: {
    backgroundColor: '#d1fae5',
    color: '#047857'
  },
  reversedBadge: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c'
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
  },
  actionsCell: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  detailsBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.3s ease'
  },
  reverseBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid #f8c8c8',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.3s ease'
  },
  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #c3e6cb'
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#912d2d',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #f5c6cb'
  },
  detailsRow: {
    backgroundColor: '#f8f9fa',
    padding: '0'
  },
  orderDetails: {
    padding: '16px 20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  detailsTitle: {
    margin: '0 0 12px 0',
    fontSize: '15px',
    color: '#1a1a2e'
  },
  orderItem: {
    display: 'flex',
    gap: '12px',
    padding: '6px 0',
    borderBottom: '1px solid #eee',
    fontSize: '14px'
  },
  orderItemLast: {
    borderBottom: 'none'
  },
  itemName: {
    flex: 2,
    fontWeight: '500'
  },
  itemQuantity: {
    flex: 0.5,
    color: '#666'
  },
  itemPrice: {
    flex: 1,
    color: '#666'
  },
  itemSubtotal: {
    flex: 1,
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  orderTotal: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '2px solid #ddd',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '16px',
    fontWeight: 'bold'
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

export default Orders;