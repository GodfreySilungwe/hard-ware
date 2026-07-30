import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';
import AvatarUpload from '../components/common/AvatarUpload';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { formatPriceMK } from '../utils/formatPrice';
import { useAuth } from '../context/AuthContext';

const Settings = ({ initialMenu = 'settings' }) => {
  const { user } = useAuth();
  const [activeMenu, setActiveMenu] = useState(initialMenu);
  const [settingsSubTab, setSettingsSubTab] = useState('profile');
  const isOwnerRole = user?.role === 'owner';
  const isHardwareManagerRole = user?.role === 'hardware-manager';
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [salesAccountForm, setSalesAccountForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [tenants, setTenants] = useState([]);
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAction, setDeleteAction] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    tenantName: '',
    hardwareName: '',
    phone: '',
    expiresInDays: '7'
  });
  
  // Profile state
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    fullName: '',
    role: ''
  });

  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Business settings state
  const [business, setBusiness] = useState({
    name: 'Global Account Manager',
    address: '123 Main Street, Lilongwe',
    phone: '+265 999 123 456',
    email: 'info@barmanager.com',
    taxId: '',
    taxCompliant: false,
    currency: 'MWK',
    receiptFooter: 'Thank you for your business!'
  });

  // Load user profile from localStorage on mount
  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    setActiveMenu(initialMenu);
  }, [initialMenu]);

  const refreshOwnerData = async () => {
    if (user?.role !== 'owner') {
      setTenants([]);
      setPendingRegistrations([]);
      await refreshOwnerPerformance();
      return;
    }

    try {
      const [tenantsRes, pendingRes] = await Promise.all([
        api.get('/auth/tenants').catch(() => ({ data: [] })),
        api.get('/auth/pending-registrations').catch(() => ({ data: [] }))
      ]);

      setTenants(tenantsRes.data || []);
      setPendingRegistrations(pendingRes.data || []);
      await refreshOwnerPerformance();
    } catch (err) {
      setTenants([]);
      setPendingRegistrations([]);
      await refreshOwnerPerformance();
    }
  };

  useEffect(() => {
    refreshOwnerData();
  }, [user?.role]);

  const [hardwareManagers, setHardwareManagers] = useState([]);
  const [salesAccounts, setSalesAccounts] = useState([]);
  const [ownerPerformance, setOwnerPerformance] = useState({
    totalSales: 0,
    totalProfit: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    reversalRate: 0,
    averageItemsPerOrder: 0
  });

  const refreshOwnerPerformance = async () => {
    if (user?.role !== 'owner') {
      setOwnerPerformance({
        totalSales: 0,
        totalProfit: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        reversalRate: 0,
        averageItemsPerOrder: 0
      });
      return;
    }

    try {
      const response = await api.get('/orders');
      const orders = Array.isArray(response.data) ? response.data : [];
      const reversedOrders = orders.filter((order) => order.status === 'reversed');
      const validOrders = orders.filter((order) => order.status !== 'reversed');
      const totalSales = validOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const totalProfit = validOrders.reduce((sum, order) => sum + Number(order.profit || 0), 0);
      const totalOrders = validOrders.length;
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
      const totalItems = validOrders.reduce((sum, order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        return sum + items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0);
      }, 0);
      const averageItemsPerOrder = totalOrders > 0 ? totalItems / totalOrders : 0;
      const reversalRate = orders.length > 0 ? Math.round((reversedOrders.length / orders.length) * 100) : 0;

      setOwnerPerformance({
        totalSales,
        totalProfit,
        totalOrders,
        averageOrderValue,
        reversalRate,
        averageItemsPerOrder
      });
    } catch (err) {
      setOwnerPerformance({
        totalSales: 0,
        totalProfit: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        reversalRate: 0,
        averageItemsPerOrder: 0
      });
    }
  };

  const refreshHardwareManagers = async () => {
    if (user?.role !== 'owner') {
      setHardwareManagers([]);
      return;
    }

    try {
      const response = await api.get('/auth/hardware-managers');
      setHardwareManagers(response.data || []);
    } catch (err) {
      setHardwareManagers([]);
    }
  };

  const refreshSalesAccounts = async () => {
    if (!user || (user.role !== 'hardware-manager' && user.role !== 'owner')) {
      setSalesAccounts([]);
      return;
    }

    try {
      const response = await api.get('/auth/sales-accounts');
      setSalesAccounts(response.data || []);
    } catch (err) {
      setSalesAccounts([]);
    }
  };

  useEffect(() => {
    refreshHardwareManagers();
    refreshSalesAccounts();
  }, [user?.role]);

  const loadProfile = async () => {
    try {
      // Check if profile exists in localStorage
      const savedProfile = localStorage.getItem('userProfile');
      
      console.log('Saved profile from localStorage:', savedProfile);
      
      if (savedProfile) {
        const parsedProfile = JSON.parse(savedProfile);
        console.log('Parsed profile:', parsedProfile);
        
        setProfile({
          username: parsedProfile.username || 'admin',
          email: parsedProfile.email || 'admin@bar.com',
          fullName: parsedProfile.fullName || 'Admin User',
          role: parsedProfile.role || 'admin'
        });
        
        // Load avatar if exists - THIS IS THE FIX
        if (parsedProfile.avatar) {
          console.log('Loading avatar from localStorage');
          setAvatar(parsedProfile.avatar);
        } else {
          setAvatar(null);
        }
      } else {
        // Default profile
        setProfile({
          username: 'admin',
          email: 'admin@bar.com',
          fullName: 'Admin User',
          role: 'admin'
        });
        setAvatar(null);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      // Set default profile
      setProfile({
        username: 'admin',
        email: 'admin@bar.com',
        fullName: 'Admin User',
        role: 'admin'
      });
      setAvatar(null);
    }
  };

  const handleAvatarChange = async (file) => {
    if (!file) {
      setAvatar(null);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await api.post('/uploads/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const uploadedUrl = response.data?.url || response.data?.imageUrl;
      if (!uploadedUrl) {
        throw new Error('No image URL returned from server');
      }

      setAvatar(uploadedUrl);
      setMessage('✅ Profile photo uploaded successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError('❌ Failed to upload profile photo');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      // Save profile data including avatar to localStorage
      const profileData = {
        ...profile,
        avatar: avatar
      };
      
      console.log('Saving profile data:', profileData);
      
      // Save to localStorage
      localStorage.setItem('userProfile', JSON.stringify(profileData));
      
      setMessage('✅ Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('❌ Failed to update profile');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('❌ Passwords do not match');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('❌ Password must be at least 6 characters');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    try {
      setMessage('✅ Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError('❌ Failed to change password');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const notifyOwnerDataChanged = () => {
    window.dispatchEvent(new Event('owner-data-updated'));
  };

  const handleTenantAction = async (tenantId, action) => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.patch(`/auth/tenants/${tenantId}/${action}`);
      setMessage(response.data?.message || `Hardware ${action}d successfully`);
      await refreshOwnerData();
      await refreshHardwareManagers();
      notifyOwnerDataChanged();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || `❌ Failed to ${action} hardware`);
      setTimeout(() => setError(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (target, action) => {
    setDeleteTarget(target);
    setDeleteAction(action);
  };

  const handleDeleteTenant = async () => {
    if (!deleteTarget) return;
    await handleTenantAction(deleteTarget, 'delete');
    setDeleteTarget(null);
    setDeleteAction(null);
  };

  const handleDeleteSalesAccount = async () => {
    if (!deleteTarget) return;

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.delete(`/auth/sales-accounts/${deleteTarget}`);
      setMessage(response.data?.message || 'Sales account deleted');
      setDeleteTarget(null);
      setDeleteAction(null);
      await refreshSalesAccounts();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || '❌ Failed to delete sales account');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRegistration = async (registrationId) => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.post(`/auth/approve-registration/${registrationId}`, {
        tenantName: inviteForm.tenantName || 'Hardware',
        hardwareName: inviteForm.hardwareName || 'Hardware'
      });
      setMessage(response.data?.message || 'Registration approved');
      await refreshOwnerData();
      notifyOwnerDataChanged();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || '❌ Failed to approve registration');
      setTimeout(() => setError(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRegistration = async () => {
    if (!rejectTarget) return;

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.post(`/auth/reject-registration/${rejectTarget}`);
      setMessage(response.data?.message || 'Registration rejected');
      setRejectTarget(null);
      await refreshOwnerData();
      notifyOwnerDataChanged();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || '❌ Failed to reject registration');
      setTimeout(() => setError(''), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInviteLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.post('/auth/create-invite', {
        tenantName: inviteForm.tenantName,
        hardwareName: inviteForm.hardwareName,
      phone: inviteForm.phone,
      expiresInDays: inviteForm.expiresInDays
    });

    const inviteUrl = `${window.location.origin}/register?invite=${response.data?.invite?.token}`;
    setMessage(`✅ Invite link ready: ${inviteUrl}`);
    setInviteForm({ tenantName: '', hardwareName: '', phone: '', expiresInDays: '7' });
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleBusinessUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      localStorage.setItem('businessSettings', JSON.stringify(business));
      setMessage('✅ Business settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError('❌ Failed to save settings');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHardwareManager = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.post('/auth/create-hardware-manager', {
        fullName: salesAccountForm.fullName,
        username: salesAccountForm.username,
        email: salesAccountForm.email,
        phone: salesAccountForm.phone,
        password: salesAccountForm.password,
        tenantName: inviteForm.tenantName,
        hardwareName: inviteForm.hardwareName
      });

      setMessage(`✅ Hardware manager created for ${response.data?.tenant?.name || inviteForm.tenantName}`);
      setSalesAccountForm({ fullName: '', username: '', email: '', phone: '', password: '', confirmPassword: '' });
      setInviteForm({ tenantName: '', hardwareName: '', expiresInDays: '7' });
      await refreshHardwareManagers();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || '❌ Failed to create hardware manager');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSalesAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (!salesAccountForm.fullName || !salesAccountForm.username || !salesAccountForm.email || !salesAccountForm.phone || !salesAccountForm.password) {
      setError('❌ Please fill in all sales account fields');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    if (salesAccountForm.password.length < 6) {
      setError('❌ Password must be at least 6 characters');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    if (salesAccountForm.password !== salesAccountForm.confirmPassword) {
      setError('❌ Passwords do not match');
      setTimeout(() => setError(''), 3000);
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/create-sales-account', {
        fullName: salesAccountForm.fullName,
        username: salesAccountForm.username,
        email: salesAccountForm.email,
        phone: salesAccountForm.phone,
        password: salesAccountForm.password
      });

      setMessage(`✅ Sales account created for ${response.data?.user?.username || salesAccountForm.username}`);
      setSalesAccountForm({
        fullName: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
      });
      await refreshSalesAccounts();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || '❌ Failed to create sales account');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Load business settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('businessSettings');
    if (saved) {
      setBusiness(JSON.parse(saved));
    }
  }, []);

  const menuItems = isOwnerRole
    ? [
        { id: 'hardware', label: '🔧 Hardware' }
      ]
    : [
        { id: 'settings', label: '⚙️ Settings' },
        { id: 'sales-team', label: '👥 Sales Team' }
      ];

  useEffect(() => {
    if (!menuItems.some((item) => item.id === activeMenu)) {
      setActiveMenu(menuItems[0]?.id || 'hardware');
    }
  }, [menuItems, activeMenu]);

  const settingsSubTabs = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'password', label: '🔒 Password' },
    { id: 'business', label: '🏢 Business' }
  ];

  const formatDate = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <PageContainer title={isOwnerRole ? '🌐 Global Account' : '⚙️ Hardware Manager Settings'}>
      {message && (
        <div className="fade-in" style={styles.success}>{message}</div>
      )}
      {error && (
        <div className="fade-in" style={styles.error}>{error}</div>
      )}

      <div style={styles.menuTabs}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            style={{
              ...styles.menuTab,
              ...(activeMenu === item.id ? styles.menuTabActive : {})
            }}
            onClick={() => setActiveMenu(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>


      {activeMenu === 'settings' && (
        <div className="fade-in">
          <div style={styles.subTabs}>
            {settingsSubTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                style={{
                  ...styles.subTab,
                  ...(settingsSubTab === tab.id ? styles.subTabActive : {})
                }}
                onClick={() => setSettingsSubTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {settingsSubTab === 'profile' && (
            <UnifiedCard title="👤 Global Account Profile">
              <form onSubmit={handleProfileUpdate} style={styles.form}>
                <div style={{...styles.formGroup, gridColumn: '1 / -1', alignItems: 'center'}}>
                  <label style={styles.label}>Profile Photo</label>
                  <AvatarUpload
                    currentImage={avatar}
                    onImageChange={handleAvatarChange}
                    name={profile.fullName}
                  />
                </div>

                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Full Name *</label>
                    <input type="text" required style={styles.input} value={profile.fullName} onChange={(e) => setProfile({...profile, fullName: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Username *</label>
                    <input type="text" required style={styles.input} value={profile.username} onChange={(e) => setProfile({...profile, username: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Email *</label>
                    <input type="email" required style={styles.input} value={profile.email} onChange={(e) => setProfile({...profile, email: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Role</label>
                    <input type="text" style={{...styles.input, backgroundColor: '#f5f5f5', cursor: 'not-allowed'}} value={profile.role} disabled />
                    <span style={styles.helperText}>Role cannot be changed</span>
                  </div>
                </div>
                <div style={styles.formActions}>
                  <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Update Profile'}</Button>
                </div>
              </form>
            </UnifiedCard>
          )}

          {settingsSubTab === 'password' && (
            <UnifiedCard title="🔒 Password Management">
              <form onSubmit={handlePasswordChange} style={styles.form}>
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Current Password *</label>
                    <input type="password" required style={styles.input} value={passwordData.currentPassword} onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})} placeholder="Enter current password" />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>New Password *</label>
                    <input type="password" required style={styles.input} value={passwordData.newPassword} onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})} placeholder="Min 6 characters" />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Confirm New Password *</label>
                    <input type="password" required style={styles.input} value={passwordData.confirmPassword} onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})} placeholder="Confirm new password" />
                  </div>
                </div>
                <div style={styles.formActions}>
                  <Button type="submit" disabled={loading}>{loading ? 'Changing...' : 'Change Password'}</Button>
                </div>
              </form>
            </UnifiedCard>
          )}

          {settingsSubTab === 'business' && (
            <UnifiedCard title="🏢 Business Profile">
              <form onSubmit={handleBusinessUpdate} style={styles.form}>
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Business Name *</label>
                    <input type="text" required style={styles.input} value={business.name} onChange={(e) => setBusiness({...business, name: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Address</label>
                    <input type="text" style={styles.input} value={business.address} onChange={(e) => setBusiness({...business, address: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Phone *</label>
                    <input type="text" required style={styles.input} value={business.phone} onChange={(e) => setBusiness({...business, phone: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Email</label>
                    <input type="email" style={styles.input} value={business.email} onChange={(e) => setBusiness({...business, email: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Tax ID</label>
                    <input type="text" style={styles.input} value={business.taxId} onChange={(e) => setBusiness({...business, taxId: e.target.value})} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Currency</label>
                    <select style={styles.input} value={business.currency} onChange={(e) => setBusiness({...business, currency: e.target.value})}>
                      <option value="MWK">MWK - Malawi Kwacha</option>
                      <option value="$">$ - US Dollar</option>
                      <option value="€">€ - Euro</option>
                      <option value="£">£ - British Pound</option>
                      <option value="R">R - South African Rand</option>
                    </select>
                  </div>
                  <div style={{...styles.formGroup, gridColumn: '1 / -1'}}>
                    <label style={styles.label}>Receipt Footer Message</label>
                    <input type="text" style={styles.input} value={business.receiptFooter} onChange={(e) => setBusiness({...business, receiptFooter: e.target.value})} placeholder="Thank you for your business!" />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={business.taxCompliant}
                        onChange={(e) => setBusiness({ ...business, taxCompliant: e.target.checked })}
                        style={{ width: '16px', height: '16px' }}
                      />
                      Tax compliant (prices include 17.5% tax)
                    </label>
                    <span style={styles.helperText}>If enabled, receipts will include a tax breakdown for inclusive pricing.</span>
                  </div>
                </div>
                <div style={styles.formActions}>
                  <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Settings'}</Button>
                </div>
              </form>
            </UnifiedCard>
          )}
        </div>
      )}

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteAction === 'tenant' ? 'Delete hardware account' : 'Delete sales account'}
        description={deleteAction === 'tenant'
          ? 'Type delete to permanently remove this hardware account and disable its users.'
          : 'Type delete to permanently remove this sales account.'}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteAction(null);
        }}
        onConfirm={deleteAction === 'tenant' ? handleDeleteTenant : handleDeleteSalesAccount}
      />
      <DeleteConfirmModal
        open={Boolean(rejectTarget)}
        title="Reject registration"
        description="Type delete to reject this pending signup."
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleRejectRegistration}
      />

      {activeMenu === 'sales-team' && (
        <div className="fade-in">
          <UnifiedCard title="👥 Create Sales Team">
            <p style={{ marginTop: 0, color: '#6b7280' }}>
              Create sales accounts for your hardware location. These users can manage POS, customers, and orders.
            </p>
            <form onSubmit={handleCreateSalesAccount} style={styles.form}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Full Name *</label>
                  <input type="text" required style={styles.input} value={salesAccountForm.fullName} onChange={(e) => setSalesAccountForm({ ...salesAccountForm, fullName: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Username *</label>
                  <input type="text" required style={styles.input} value={salesAccountForm.username} onChange={(e) => setSalesAccountForm({ ...salesAccountForm, username: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Email *</label>
                  <input type="email" required style={styles.input} value={salesAccountForm.email} onChange={(e) => setSalesAccountForm({ ...salesAccountForm, email: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone *</label>
                  <input type="tel" required style={styles.input} value={salesAccountForm.phone} onChange={(e) => setSalesAccountForm({ ...salesAccountForm, phone: e.target.value })} placeholder="e.g. +265 99 123 4567" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Password *</label>
                  <input type="password" required style={styles.input} value={salesAccountForm.password} onChange={(e) => setSalesAccountForm({ ...salesAccountForm, password: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Confirm Password *</label>
                  <input type="password" required style={styles.input} value={salesAccountForm.confirmPassword} onChange={(e) => setSalesAccountForm({ ...salesAccountForm, confirmPassword: e.target.value })} />
                </div>
              </div>
              <div style={styles.formActions}>
                <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Sales Team Member'}</Button>
              </div>
            </form>
          </UnifiedCard>

          <div style={{ marginTop: '16px' }}>
            <UnifiedCard title="🧑‍💼 Sales Accounts">
              {salesAccounts.length === 0 ? (
                <div style={{ color: '#888' }}>No sales accounts yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {salesAccounts.map((sales) => (
                    <div key={sales.id} style={styles.salesCard}>
                      <div style={{ fontWeight: 700 }}>{sales.fullName || sales.username}</div>
                      <div style={styles.salesMeta}>Username: {sales.username}</div>
                      <div style={styles.salesMeta}>Email: {sales.email || 'Not available'}</div>
                      <div style={styles.salesMeta}>Password: <span style={styles.exposedPassword}>{sales.initialPassword || 'Not stored'}</span></div>
                      <div style={styles.salesMeta}>Status: {sales.isActive ? 'Active' : 'Inactive'}</div>
                      <button type="button" style={styles.deleteButton} onClick={() => openDeleteModal(sales.id, 'sales-account')}>Delete Sales Account</button>
                    </div>
                  ))}
                </div>
              )}
            </UnifiedCard>
          </div>
        </div>
      )}

      {isOwnerRole && activeMenu === 'hardware' && (
        <div className="fade-in">
          <UnifiedCard title="⚠️ Pending Hardware Applications">
            <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', backgroundColor: pendingRegistrations.length > 0 ? '#fff7ed' : '#f8fafc', border: pendingRegistrations.length > 0 ? '1px solid #fdba74' : '1px solid #e5e7eb' }}>
              <strong>{pendingRegistrations.length}</strong> pending application{pendingRegistrations.length === 1 ? '' : 's'} waiting for review.
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {pendingRegistrations.length === 0 ? (
                <div style={{ color: '#888' }}>No pending applications.</div>
              ) : pendingRegistrations.map((registration) => (
                <div key={registration._id || registration.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{registration.fullName || registration.username}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>{registration.email}</div>
                    <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Username: {registration.username}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" style={styles.secondaryButton} onClick={() => handleApproveRegistration(registration._id || registration.id)}>Approve</button>
                    <button type="button" style={styles.deleteButton} onClick={() => setRejectTarget(registration._id || registration.id)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </UnifiedCard>

          <div style={{ marginTop: '16px' }}>
            <UnifiedCard title="➕ Hardware Creation Form">
              <form onSubmit={handleCreateInviteLink} style={styles.form}>
                <div style={styles.formGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Hardware Name</label>
                    <input type="text" required style={styles.input} value={inviteForm.hardwareName} onChange={(e) => setInviteForm({ ...inviteForm, hardwareName: e.target.value })} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Owner Name</label>
                    <input type="text" required style={styles.input} value={inviteForm.tenantName} onChange={(e) => setInviteForm({ ...inviteForm, tenantName: e.target.value })} />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Owner Phone</label>
                    <input type="tel" required style={styles.input} value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} placeholder="e.g. +265 99 123 4567" />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Expiry (Days)</label>
                    <input type="number" min="1" style={styles.input} value={inviteForm.expiresInDays} onChange={(e) => setInviteForm({ ...inviteForm, expiresInDays: e.target.value })} />
                  </div>
                </div>
                <div style={styles.formActions}>
                  <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Hardware'}</Button>
                </div>
              </form>
            </UnifiedCard>
          </div>

          <div style={{ marginTop: '16px' }}>
            <UnifiedCard title="🏢 Existing Hardwares">
              <div style={{ display: 'grid', gap: '10px' }}>
                {tenants.length === 0 ? (
                  <div style={{ color: '#888' }}>No hardware accounts found yet.</div>
                ) : tenants.map((tenant) => (
                  <div key={tenant._id || tenant.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{tenant.hardwareName || tenant.name}</div>
                      <div style={{ color: '#666', fontSize: '13px' }}>{tenant.name}</div>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Registered by: {tenant.registeredManagerInfo?.fullName || tenant.registeredManagerInfo?.username || tenant.ownerInfo?.fullName || tenant.ownerInfo?.username || 'Not available'}</div>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Email: {tenant.registeredManagerInfo?.email || tenant.ownerInfo?.email || 'Not available'}</div>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Phone: {tenant.registeredManagerInfo?.phone || tenant.ownerInfo?.phone || 'Not available'}</div>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Created: {formatDate(tenant.createdAt || tenant.created_at)}</div>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Status: {tenant.status || 'active'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {tenant.status !== 'suspended' && tenant.status !== 'deleted' && (
                        <button type="button" style={styles.secondaryButton} onClick={() => handleTenantAction(tenant._id || tenant.id, 'suspend')}>Suspend</button>
                      )}
                      {tenant.status === 'suspended' && (
                        <button type="button" style={styles.secondaryButton} onClick={() => handleTenantAction(tenant._id || tenant.id, 'restore')}>Restore</button>
                      )}
                      {tenant.status !== 'deleted' && (
                        <button type="button" style={styles.deleteButton} onClick={() => openDeleteModal(tenant._id || tenant.id, 'tenant')}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </UnifiedCard>
          </div>

          <div style={{ marginTop: '16px' }}>
            <UnifiedCard title="👥 Hardware Managers">
              <div style={{ display: 'grid', gap: '10px' }}>
                {hardwareManagers.length === 0 ? (
                  <div style={{ color: '#888' }}>No hardware managers found.</div>
                ) : hardwareManagers.map((manager) => (
                  <div key={manager.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '14px', display: 'grid', gap: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{manager.fullName || manager.username}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>Username: {manager.username}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>Email: {manager.email || 'Not available'}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>Phone: {manager.phone || 'Not available'}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>Tenant ID: {manager.tenantId || 'None'}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>Status: {manager.isActive ? 'Active' : 'Inactive'}</div>
                    <div style={{ color: '#666', fontSize: '13px' }}>Registration: {manager.registrationStatus || 'approved'}</div>
                    <div style={{ color: '#888', fontSize: '12px' }}>Created: {formatDate(manager.createdAt)}</div>
                    <div style={{ color: '#888', fontSize: '12px' }}>Updated: {formatDate(manager.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </UnifiedCard>
          </div>
        </div>
      )}

    </PageContainer>
  );
};

const styles = {
  menuTabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  menuTab: {
    padding: '10px 16px',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#4b5563',
    borderRadius: '999px',
    transition: 'all 0.3s ease'
  },
  menuTabActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  subTabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  subTab: {
    padding: '8px 14px',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
    borderRadius: '999px'
  },
  subTabActive: {
    backgroundColor: '#fce7ec',
    color: '#b91c1c',
    borderColor: '#f5c2cd'
  },
  statGridSection: {
    marginBottom: '18px'
  },
  statGrid: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
  },
  statCard: {
    padding: '16px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #fff5f7 0%, #fff 100%)',
    border: '1px solid #fce7ec',
    minHeight: '110px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#e94560'
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
    fontSize: '14px',
    transition: 'all 0.3s ease',
    outline: 'none',
    fontFamily: 'inherit'
  },
  helperText: {
    fontSize: '12px',
    color: '#888',
    marginTop: '2px'
  },
  salesCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    padding: '16px',
    backgroundColor: '#ffffff',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
    display: 'grid',
    gap: '8px'
  },
  salesMeta: {
    fontSize: '13px',
    color: '#4b5563'
  },
  exposedPassword: {
    fontFamily: 'monospace',
    color: '#111827',
    backgroundColor: '#f8fafc',
    padding: '2px 6px',
    borderRadius: '6px'
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    marginTop: '10px'
  },
  sectionHeader: {
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '12px',
    color: '#111827'
  },
  sectionNote: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '20px',
    lineHeight: '1.6'
  },
  secondaryButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px'
  },
  deleteButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #f8c8c8',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    cursor: 'pointer',
    fontSize: '13px'
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
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #f5c6cb'
  }
};

export default Settings;