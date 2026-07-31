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
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

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

  const handleCloseConfirmationModal = () => {
    setShowConfirmationModal(false);
  };

  const handleOpenDecisionModal = (registration) => {
    setSelectedRegistration(registration);
    setFormError('');
    setFormSuccess('');
    setShowDecisionModal(true);
  };

  const handleCloseDecisionModal = () => {
    setShowDecisionModal(false);
    setSelectedRegistration(null);
  };

  const handleApproveRegistration = async () => {
    if (!selectedRegistration) return;

    setDecisionLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const response = await api.post(`/auth/approve-registration/${selectedRegistration._id}`, {
        tenantName: selectedRegistration.tenantName || selectedRegistration.hardwareName || selectedRegistration.fullName || 'Hardware',
        hardwareName: selectedRegistration.hardwareName || selectedRegistration.tenantName || selectedRegistration.fullName || 'Hardware',
        temporaryPassword: selectedRegistration.password || 'temporary-password'
      });

      setFormSuccess(response.data?.message || 'Registration approved successfully.');
      setShowDecisionModal(false);
      setSelectedRegistration(null);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to approve registration.');
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleRejectRegistration = async () => {
    if (!selectedRegistration) return;

    setDecisionLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const response = await api.post(`/auth/reject-registration/${selectedRegistration._id}`);

      setFormSuccess(response.data?.message || 'Registration rejected successfully.');
      setShowDecisionModal(false);
      setSelectedRegistration(null);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to reject registration.');
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleCreateHardware = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setShowConfirmationModal(false);
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
      setShowConfirmationModal(true);
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
                  <div style={styles.listItemMain}>
                    <div>
                      <div style={styles.name}>{registration.fullName || registration.username}</div>
                      <div style={styles.meta}>{registration.email}</div>
                    </div>
                    <div style={styles.badge}>Awaiting approval</div>
                  </div>
                  <div style={styles.listItemActions}>
                    <button type="button" style={styles.reviewButton} onClick={() => handleOpenDecisionModal(registration)}>
                      Review
                    </button>
                  </div>
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

      {showConfirmationModal && (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="hardware-request-confirmation-title" onClick={handleCloseConfirmationModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalIcon}>✅</div>
            <h3 id="hardware-request-confirmation-title" style={styles.modalTitle}>New hardware request submitted</h3>
            <p style={styles.modalText}>The Smart Inventory App request was submitted successfully. The owner can now review the new account details.</p>
            <button type="button" style={styles.modalButton} onClick={handleCloseConfirmationModal}>Close</button>
          </div>
        </div>
      )}

      {showDecisionModal && selectedRegistration && (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="registration-review-title" onClick={handleCloseDecisionModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalIcon}>📝</div>
            <h3 id="registration-review-title" style={styles.modalTitle}>Review application</h3>
            <p style={styles.modalText}>
              {selectedRegistration.fullName || selectedRegistration.username} is waiting for your decision.
            </p>
            <div style={styles.registrationDetails}>
              <div style={styles.registrationDetail}><strong>Owner:</strong> {selectedRegistration.tenantName || selectedRegistration.hardwareName || 'Not provided'}</div>
              <div style={styles.registrationDetail}><strong>Smart Inventory App:</strong> {selectedRegistration.hardwareName || selectedRegistration.tenantName || 'Not provided'}</div>
              <div style={styles.registrationDetail}><strong>Email:</strong> {selectedRegistration.email || 'Not provided'}</div>
              <div style={styles.registrationDetail}><strong>Phone:</strong> {selectedRegistration.phone || 'Not provided'}</div>
            </div>
            <div style={styles.modalActions}>
              <button type="button" style={styles.rejectButton} onClick={handleRejectRegistration} disabled={decisionLoading}>
                {decisionLoading ? 'Processing...' : 'Reject'}
              </button>
              <button type="button" style={styles.approveButton} onClick={handleApproveRegistration} disabled={decisionLoading}>
                {decisionLoading ? 'Processing...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
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
    padding: '12px 14px',
    gap: '12px'
  },
  listItemMain: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
    gap: '12px'
  },
  listItemActions: {
    display: 'flex',
    alignItems: 'center'
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
  reviewButton: {
    padding: '8px 12px',
    borderRadius: '999px',
    border: '1px solid #e94560',
    backgroundColor: '#fff',
    color: '#e94560',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700'
  },
  button: {
    padding: '14px 16px',
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#e94560',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700',
    marginTop: '10px'
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
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000
  },
  modalCard: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.22)',
    textAlign: 'center'
  },
  modalIcon: {
    fontSize: '42px',
    marginBottom: '10px'
  },
  modalTitle: {
    margin: '0 0 8px',
    fontSize: '22px',
    color: '#111827'
  },
  modalText: {
    margin: '0 0 18px',
    color: '#6b7280',
    lineHeight: 1.5
  },
  registrationDetails: {
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '18px',
    color: '#374151'
  },
  registrationDetail: {
    fontSize: '14px'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  rejectButton: {
    padding: '10px 16px',
    borderRadius: '999px',
    border: '1px solid #dc2626',
    backgroundColor: '#fff',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  },
  approveButton: {
    padding: '10px 16px',
    borderRadius: '999px',
    border: 'none',
    backgroundColor: '#e94560',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  },
  modalButton: {
    padding: '10px 18px',
    borderRadius: '999px',
    border: 'none',
    backgroundColor: '#e94560',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  }
};

export default Applications;
