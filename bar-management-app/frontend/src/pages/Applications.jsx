import { useEffect, useState } from 'react';
import { faChartBar, faClipboardCheck, faTools, faUsers } from '@fortawesome/free-solid-svg-icons';
import api from '../api/api';
import StatsCard from '../components/common/StatsCard';
import UnifiedCard from '../components/common/UnifiedCard';
import PageContainer from './PageContainer';

const Applications = () => {
  const [summary, setSummary] = useState(null);
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    tenantName: '',
    hardwareName: '',
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const [summaryRes, pendingRes] = await Promise.all([
        api.get('/auth/tenant-summary').catch(() => ({ data: {} })),
        api.get('/auth/pending-registrations').catch(() => ({ data: [] }))
      ]);

      setSummary(summaryRes.data || {});
      setPendingRegistrations(Array.isArray(pendingRes.data) ? pendingRes.data : []);
    } catch (err) {
      console.error('Error fetching applications data:', err);
      setError('Could not load application data.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCreateHardware = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setFormLoading(true);

    const { tenantName, hardwareName, fullName, username, email, phone, password, confirmPassword } = formData;

    if (!tenantName || !hardwareName || !fullName || !username || !email || !phone || !password || !confirmPassword) {
      setFormError('Please fill in all fields.');
      setFormLoading(false);
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      setFormLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      setFormLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/create-hardware-manager', {
        tenantName,
        hardwareName,
        fullName,
        username,
        email,
        phone,
        password
      });

      setFormSuccess(response.data?.message || 'Smart Inventory App account created successfully.');
      setFormData({
        tenantName: '',
        hardwareName: '',
        fullName: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
      });
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create Smart Inventory App account.');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <PageContainer title="🛠️ Applications">
      <div style={styles.heroPanel}>
        <div>
          <p style={styles.eyebrow}>Owner application center</p>
          <h2 style={styles.heroTitle}>Keep Smart Inventory App onboarding moving.</h2>
          <p style={styles.subtitle}>Review new applications, monitor tenant readiness, and keep your inventory network aligned with your operating standards.</p>
        </div>
        <button style={styles.refreshBtn} onClick={fetchData}>↻ Refresh</button>
      </div>

      <div style={styles.statsGrid}>
        <StatsCard title="Pending approvals" value={pendingRegistrations.length} icon={faClipboardCheck} color="#f39c12" />
        <StatsCard title="Smart Inventory App users" value={summary?.hardwareManagers || 0} icon={faTools} color="#e94560" />
        <StatsCard title="Active Smart Inventory App accounts" value={summary?.activeTenants || 0} icon={faUsers} color="#2ecc71" />
        <StatsCard title="Sales accounts" value={summary?.salesAccounts || 0} icon={faChartBar} color="#3498db" />
      </div>

      <div style={styles.contentGrid}>
        <UnifiedCard title="📝 Pending applications">
          {loading ? (
            <p style={styles.loadingText}>Loading applications...</p>
          ) : error ? (
            <p style={styles.errorText}>{error}</p>
          ) : pendingRegistrations.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>✅</p>
              <p style={styles.emptyText}>No pending applications right now.</p>
            </div>
          ) : (
            <div style={styles.list}>
              {pendingRegistrations.map((registration) => (
                <div key={registration._id} style={styles.listItem}>
                  <div>
                    <div style={styles.name}>{registration.fullName || registration.username}</div>
                    <div style={styles.meta}>{registration.email}</div>
                  </div>
                  <div style={styles.badge}>Awaiting approval</div>
                </div>
              ))}
            </div>
          )}
        </UnifiedCard>

        <UnifiedCard title="➕ Create Smart Inventory App account">
          {formSuccess && <div style={styles.success}>{formSuccess}</div>}
          {formError && <div style={styles.error}>{formError}</div>}
          <form style={styles.form} onSubmit={handleCreateHardware}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Owner Name *</label>
              <input
                name="tenantName"
                value={formData.tenantName}
                onChange={handleFormChange}
                style={styles.input}
                placeholder="Enter owner name"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Smart Inventory App Name *</label>
              <input
                name="hardwareName"
                value={formData.hardwareName}
                onChange={handleFormChange}
                style={styles.input}
                placeholder="Enter Smart Inventory App name"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>App Manager Name *</label>
              <input
                name="fullName"
                value={formData.fullName}
                onChange={handleFormChange}
                style={styles.input}
                placeholder="Enter full name"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Username *</label>
              <input
                name="username"
                value={formData.username}
                onChange={handleFormChange}
                style={styles.input}
                placeholder="Enter username"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email *</label>
              <input
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                style={styles.input}
                type="email"
                placeholder="Enter email"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Phone *</label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                style={styles.input}
                type="tel"
                placeholder="Enter phone number"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Password *</label>
              <input
                name="password"
                value={formData.password}
                onChange={handleFormChange}
                style={styles.input}
                type="password"
                placeholder="Enter password"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Confirm Password *</label>
              <input
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleFormChange}
                style={styles.input}
                type="password"
                placeholder="Confirm password"
                required
              />
            </div>
            <button type="submit" style={styles.button} disabled={formLoading}>
              {formLoading ? 'Creating account...' : 'Create Smart Inventory App'}
            </button>
          </form>
        </UnifiedCard>
      </div>
    </PageContainer>
  );
};

const styles = {
  heroPanel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #e5e7eb',
    borderRadius: '20px',
    padding: '22px 24px',
    boxShadow: '0 12px 35px rgba(15, 23, 42, 0.06)',
    marginBottom: '24px'
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
    margin: '0',
    maxWidth: '700px'
  },
  refreshBtn: {
    padding: '10px 16px',
    borderRadius: '999px',
    border: '1px solid #e94560',
    backgroundColor: '#fff',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '24px'
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '20px'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '12px 14px'
  },
  name: {
    fontWeight: '700',
    color: '#111827'
  },
  meta: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '2px'
  },
  badge: {
    backgroundColor: '#fff4e5',
    color: '#b45309',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '700'
  },
  loadingText: {
    color: '#6b7280',
    margin: 0
  },
  errorText: {
    color: '#dc2626',
    margin: 0
  },
  emptyState: {
    textAlign: 'center',
    padding: '20px 0'
  },
  emptyIcon: {
    fontSize: '32px',
    marginBottom: '8px'
  },
  emptyText: {
    margin: 0,
    color: '#6b7280'
  }
};

export default Applications;
