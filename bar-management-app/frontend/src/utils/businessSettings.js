export const DEFAULT_PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', account: 'cash', enabled: true },
  { id: 'card', label: 'Bank', account: 'card', enabled: true },
  { id: 'airtel_money', label: 'Airtel Money', account: 'airtel_money', enabled: true },
  { id: 'mpamba', label: 'Mpamba', account: 'mpamba', enabled: true },
  { id: 'credit', label: 'Credit', account: 'cash', enabled: true }
];

export const DEFAULT_BUSINESS_SETTINGS = {
  name: '',
  address: '',
  phone: '',
  email: '',
  taxId: '',
  taxCompliant: false,
  taxRate: 17.5,
  currency: 'MWK',
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  bankName: '',
  bankBranch: '',
  bankAccountName: '',
  bankAccountNumber: '',
  receiptFooter: 'Thank you for your business!',
  logo: '',
  logoKey: '',
  signature: '',
  signatureKey: ''
};

const BUSINESS_SETTINGS_ACCOUNT_KEY = 'businessSettingsAccount';

export const getBusinessSettingsAccountId = (user) => {
  const tenantId = user?.tenantId;
  const userId = user?._id || user?.id;
  if (tenantId) return `tenant:${tenantId}`;
  if (userId) return `user:${userId}`;
  return null;
};

export const activateBusinessSettingsAccount = (user) => {
  const accountId = getBusinessSettingsAccountId(user);
  if (!accountId || typeof localStorage === 'undefined') return accountId;

  try {
    if (localStorage.getItem(BUSINESS_SETTINGS_ACCOUNT_KEY) !== accountId) {
      localStorage.removeItem('businessSettings');
      localStorage.removeItem('businessCurrency');
      localStorage.setItem(BUSINESS_SETTINGS_ACCOUNT_KEY, accountId);
    }
  } catch (error) {
    console.error('Failed to scope business settings cache:', error);
  }
  return accountId;
};

export const getCachedBusinessSettings = (user) => {
  const accountId = getBusinessSettingsAccountId(user);
  if (!accountId || typeof localStorage === 'undefined') return null;

  try {
    if (localStorage.getItem(BUSINESS_SETTINGS_ACCOUNT_KEY) !== accountId) return null;
    const savedSettings = localStorage.getItem('businessSettings');
    return savedSettings ? JSON.parse(savedSettings) : null;
  } catch (error) {
    console.error('Failed to read cached business settings:', error);
    return null;
  }
};

export const saveBusinessSettingsCache = (settings, user) => {
  const accountId = getBusinessSettingsAccountId(user);
  if (!accountId || typeof localStorage === 'undefined') return;

  try {
    if (localStorage.getItem(BUSINESS_SETTINGS_ACCOUNT_KEY) !== accountId) return;
    localStorage.setItem('businessSettings', JSON.stringify(settings));
    localStorage.setItem('businessCurrency', settings.currency || 'MWK');
  } catch (error) {
    console.error('Failed to save business settings cache:', error);
  }
};

export const normalizePaymentMethods = (paymentMethods) => {
  const methods = Array.isArray(paymentMethods) ? paymentMethods : DEFAULT_PAYMENT_METHODS;
  return methods.map((method) => ({
    ...method,
    account: method.id === 'credit' ? 'cash' : method.account,
    enabled: method.enabled !== false
  }));
};