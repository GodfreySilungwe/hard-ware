import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import Button from '../components/common/Button';
import UnifiedCard from '../components/common/UnifiedCard';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { formatPriceMK } from '../utils/formatPrice';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    gender: 'Male'
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
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
      await loadCustomers();
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('Failed to delete customer');
    }
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
              </div>
            </div>
            <div style={styles.customerStats}>
              <span>💰 Total Spent: {formatPriceMK(customer.totalSpent || 0)}</span>
              <span>⭐ Loyalty Points: {customer.loyaltyPoints || 0}</span>
            </div>
          </div>
        ))}
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