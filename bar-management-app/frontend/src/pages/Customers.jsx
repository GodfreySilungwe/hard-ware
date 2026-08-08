import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/api';
import PageContainer from './PageContainer';
import Button from '../components/common/Button';
import UnifiedCard from '../components/common/UnifiedCard';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { formatPriceMK } from '../utils/formatPrice';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [creditData, setCreditData] = useState({});
  const [settleAmount, setSettleAmount] = useState({});
  const [settlingCustomerId, setSettlingCustomerId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    gender: 'Male'
  });

  useEffect(() => {
    loadCustomers(1);
  }, []);

  const loadCustomerCreditData = async (customerId) => {
    const id = customerId || '';
    if (!id) return;

    setCreditData((prev) => ({ ...prev, [id]: { loading: true, expanded: true, products: [], totalDue: 0 } }));
    try {
      const res = await api.get(`/orders?customerId=${id}&paymentMethod=credit`);
      const orders = Array.isArray(res.data) ? res.data : Array.isArray(res.data.orders) ? res.data.orders : [];
      const productMap = new Map();
      let totalDue = 0;
      for (const order of orders) {
        const orderDue = Number(order.dueAmount || 0) || 0;
        totalDue += orderDue;
        const orderTotal = Number(order.totalAmount) || 0;
        if (!Array.isArray(order.items)) continue;
        for (const item of order.items) {
          const productId = item.product?._id || item.product || item.product?.id;
          const name = item.productName || item.product?.name || item.name || 'Unknown';
          const subtotal = Number(item.subtotal || (item.priceAtSale * (item.quantity || 0))) || 0;
          const dueShare = orderTotal > 0 ? (subtotal / orderTotal) * orderDue : 0;
          const existingProd = productMap.get(productId) || { name, quantity: 0, subtotal: 0, due: 0 };
          existingProd.quantity += Number(item.quantity || 0);
          existingProd.subtotal += subtotal;
          existingProd.due += dueShare;
          productMap.set(productId, existingProd);
        }
      }
      const productsData = Array.from(productMap.entries()).map(([prodId, data]) => ({ productId: prodId, ...data }));
      setCreditData((prev) => ({ ...prev, [id]: { loading: false, expanded: true, products: productsData, totalDue } }));
    } catch (err) {
      console.error('Error loading credit orders:', err);
      setCreditData((prev) => ({ ...prev, [id]: { loading: false, expanded: true, products: [], totalDue: 0, error: true } }));
    }
  };

  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const highlight = params.get('highlight');
    if (highlight) {
      const match = customers.find(c => (c._id === highlight || c.id === highlight));
      if (match) {
        // trigger the same logic as the credit button click
        (async () => {
          await loadCustomerCreditData(match._id || match.id);
        })();
      }
    }
  }, [location.search, customers]);

  const loadCustomers = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get(`/customers?page=${page}&limit=10`);
      const payload = res.data;
      setCustomers(Array.isArray(payload.customers) ? payload.customers : Array.isArray(payload) ? payload : []);
      setCurrentPage(payload.page || page);
      setTotalPages(payload.totalPages || 1);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const getLatestSettlement = (customer) => {
    if (!Array.isArray(customer?.creditSettlements)) return null;
    const settlements = customer.creditSettlements
      .filter((entry) => entry && entry.settledAt)
      .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));
    return settlements[0] || null;
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  const updateCustomerInState = (updatedCustomer) => {
    if (!updatedCustomer || !updatedCustomer._id) return;
    setCustomers((prev) => prev.map((c) => (c._id === updatedCustomer._id ? updatedCustomer : c)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer._id}`, formData);
      } else {
        await api.post('/customers', formData);
      }
      setShowForm(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', gender: 'Male' });
      await loadCustomers();
    } catch (err) {
      console.error('Error saving customer:', err);
      alert('Failed to save customer');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/customers/${deleteTarget._id}`);
      setDeleteTarget(null);
      await loadCustomers(currentPage);
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('Failed to delete customer');
    }
  };

  const handlePageChange = async (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    await loadCustomers(newPage);
  };

  if (loading) {
    return (
      <PageContainer title="👤 Customers">
        <p>Loading customers...</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="👤 Customers">
      <div style={styles.header}>
        <p style={styles.subtitle}>Manage your customers</p>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Close' : '+ Add Customer'}
        </Button>
      </div>

      {showForm && (
        <UnifiedCard title={editingCustomer ? 'Edit Customer' : 'Add New Customer'}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <div className="form-grid" style={styles.formGrid}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Full Name *</label>
                <input
                  type="text"
                  required
                  style={styles.input}
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Phone Number *</label>
                <input
                  type="text"
                  required
                  style={styles.input}
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Gender *</label>
                <select
                  required
                  style={styles.input}
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-actions" style={styles.formActions}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">{editingCustomer ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </UnifiedCard>
      )}

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete customer"
        description={`Type delete to permanently remove ${deleteTarget?.name || 'this customer'}.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <div className="customerGrid" style={styles.customerGrid}>
        {customers.map((customer, index) => (
          <div 
            key={customer._id}
            className={`fade-in delay-${(index % 6) + 1}`}
            style={styles.customerCard}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-6px)';
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
              e.currentTarget.style.borderColor = '#e94560';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
              e.currentTarget.style.borderColor = '#f0f0f0';
            }}
          >
            <div style={styles.customerHeader}>
              <div>
                <h3 style={styles.customerName}>{customer.name}</h3>
                <p style={styles.customerPhone}>📱 {customer.phone}</p>
                <p style={styles.customerGender}>⚧️ {customer.gender}</p>
              </div>
              <div style={styles.customerActions}>
                <button 
                  style={styles.editBtn} 
                  onClick={() => {
                    setEditingCustomer(customer);
                    setFormData({ 
                      name: customer.name, 
                      phone: customer.phone, 
                      gender: customer.gender 
                    });
                    setShowForm(true);
                  }}
                >
                  ✏️
                </button>
                <button style={styles.deleteBtn} onClick={() => setDeleteTarget(customer)}>
                  🗑️
                </button>
                <button
                  style={{ ...styles.editBtn, marginLeft: 6 }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const id = customer._id || customer.id;
                    const existing = creditData[id];
                    if (existing && existing.expanded) {
                      setCreditData((prev) => ({ ...prev, [id]: { ...existing, expanded: false } }));
                      return;
                    }

                    await loadCustomerCreditData(id);
                  }}
                >
                  💳 Credit Purchases
                </button>
              </div>
            </div>
            {creditData[customer._id] && creditData[customer._id].expanded && (
              <div style={styles.creditBox}>
                {creditData[customer._id].loading ? (
                  <div>Loading credit purchases…</div>
                ) : (
                  <>
                    {creditData[customer._id].products.length === 0 ? (
                      <div style={{ color: '#666' }}>No credit purchases found</div>
                    ) : (
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>Products on Credit</div>
                        <div style={styles.creditListHeader}>
                          <span style={{ flex: 1 }}>Product</span>
                          <span style={{ width: 80, textAlign: 'center' }}>Qty</span>
                          <span style={{ width: 120, textAlign: 'right' }}>Due</span>
                        </div>
                        {creditData[customer._id].products.map((p) => (
                          <div key={p.productId} style={styles.creditRow}>
                            <span style={{ flex: 1 }}>{p.name}</span>
                            <span style={{ width: 80, textAlign: 'center' }}>{p.quantity}</span>
                            <span style={{ width: 120, textAlign: 'right' }}>{formatPriceMK(p.due || 0)}</span>
                          </div>
                        ))}
                        <div style={{ ...styles.creditRow, marginTop: 8, borderTop: '1px dashed #eee', paddingTop: 8 }}>
                          <strong style={{ flex: 1 }}>Total Due</strong>
                          <span style={{ width: 80 }} />
                          <strong style={{ width: 120, textAlign: 'right' }}>{formatPriceMK(creditData[customer._id].totalDue || 0)}</strong>
                        </div>
                        {getLatestSettlement(customer) && (
                          <div style={styles.settlementMeta}>
                            Last settled: {formatDateTime(getLatestSettlement(customer).settledAt)}
                          </div>
                        )}
                        <div style={styles.settleBox}>
                          <label style={styles.settleLabel}>Settle credit</label>
                          <div style={styles.settleControls}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={settleAmount[customer._id] || ''}
                              onChange={(e) => setSettleAmount((prev) => ({ ...prev, [customer._id]: e.target.value }))}
                              style={styles.settleInput}
                            />
                            <button
                              style={styles.settleButton}
                              onClick={async () => {
                                const amount = Number(settleAmount[customer._id] || 0);
                                if (!amount || amount <= 0) return;
                                setSettlingCustomerId(customer._id);
                                try {
                                  const res = await api.post(`/customers/${customer._id}/settle-credit`, { amount });
                                  const updatedCustomer = res.data?.customer;
                                  if (updatedCustomer) {
                                    updateCustomerInState(updatedCustomer);
                                  }
                                  setSettleAmount((prev) => ({ ...prev, [customer._id]: '' }));
                                  await loadCustomerCreditData(customer._id || customer.id);
                                } catch (err) {
                                  console.error('Error settling credit:', err);
                                  alert(err.response?.data?.message || 'Failed to settle credit');
                                } finally {
                                  setSettlingCustomerId(null);
                                }
                              }}
                            >
                              {settlingCustomerId === customer._id ? 'Settling…' : 'Settle'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div style={styles.customerStats}>
              <span>� Credit Balance: {formatPriceMK(customer.creditBalance || 0)}</span>
              <span>�💰 Total Spent: {formatPriceMK(customer.totalSpent || 0)}</span>
              <span>⭐ Loyalty Points: {customer.loyaltyPoints || 0}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={styles.paginationControls}>
        <button
          style={styles.paginationButton}
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Previous
        </button>
        <span style={styles.paginationInfo}>
          Page {currentPage} of {totalPages}
        </span>
        <button
          style={styles.paginationButton}
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Next
        </button>
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
  customerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
    width: '100%'
  },
  customerCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f0f0f0',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  customerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start'
  },
  customerName: {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a2e'
  },
  customerPhone: {
    margin: '5px 0 0 0',
    color: '#666',
    fontSize: '14px'
  },
  customerGender: {
    margin: '2px 0 0 0',
    color: '#888',
    fontSize: '13px'
  },
  customerActions: {
    display: 'flex',
    gap: '8px'
  },
  editBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.3s ease'
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.3s ease'
  },
  customerStats: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#666'
  },
  creditBox: {
    marginTop: 12,
    padding: '10px',
    borderRadius: 8,
    backgroundColor: '#fafafa',
    border: '1px solid #f0f0f0'
  },
  creditListHeader: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    color: '#444',
    marginBottom: 6
  },
  creditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid rgba(0,0,0,0.02)'
  },
  settleBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px dashed #eee'
  },
  settleLabel: {
    display: 'block',
    marginBottom: 6,
    fontSize: 12,
    fontWeight: 600,
    color: '#555'
  },
  settleControls: {
    display: 'flex',
    gap: 8,
    alignItems: 'center'
  },
  settleInput: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #ddd'
  },
  settleButton: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #e94560',
    backgroundColor: '#fff5f5',
    color: '#e94560',
    cursor: 'pointer',
    fontWeight: 600
  },
  settlementMeta: {
    marginTop: 8,
    fontSize: 13,
    color: '#555'
  },
  paginationControls: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    marginTop: '20px'
  },
  paginationButton: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#555'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px'
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end'
  }
};

export default Customers;