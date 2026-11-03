const DEFAULT_PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', account: 'cash', enabled: true },
  { id: 'card', label: 'Bank', account: 'card', enabled: true },
  { id: 'airtel_money', label: 'Airtel Money', account: 'airtel_money', enabled: true },
  { id: 'mpamba', label: 'Mpamba', account: 'mpamba', enabled: true },
  { id: 'credit', label: 'Credit', account: 'cash', enabled: true }
];
const VALID_PAYMENT_ACCOUNTS = new Set(['cash', 'card', 'airtel_money', 'mpamba', 'mobile_money']);
const PAYMENT_METHOD_ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

const normalizePaymentMethods = (paymentMethods) => {
  const methods = paymentMethods === undefined || paymentMethods === null
    ? DEFAULT_PAYMENT_METHODS
    : paymentMethods;
  if (!Array.isArray(methods)) throw new Error('Payment methods must be a list.');
  const seenIds = new Set();
  return methods.map((method) => {
    const id = String(method?.id || '').trim().toLowerCase();
    const label = String(method?.label || '').trim();
    const account = String(method?.account || '').trim().toLowerCase();
    if (!PAYMENT_METHOD_ID_PATTERN.test(id)) {
      throw new Error('Payment method IDs must start with a letter and contain only letters, numbers, or underscores.');
    }
    if (seenIds.has(id)) throw new Error(`Duplicate payment method: ${id}`);
    if (!label || label.length > 40) throw new Error('Payment method labels must be between 1 and 40 characters.');
    if (!VALID_PAYMENT_ACCOUNTS.has(account)) throw new Error(`Invalid ledger account for payment method: ${label}`);
    seenIds.add(id);
    return {
      id,
      label,
      account: id === 'credit' ? 'cash' : account,
      enabled: method?.enabled !== false
    };
  });
};

const getEnabledPaymentMethod = (paymentMethods, methodId) => (
  normalizePaymentMethods(paymentMethods).find((method) => method.id === String(methodId || '').trim().toLowerCase() && method.enabled)
  || null
);

const getCreditCustomerError = (paymentMethodId, customerId) => (
  String(paymentMethodId || '').trim().toLowerCase() === 'credit' && !customerId
    ? 'Select a saved customer before using Credit.'
    : null
);

module.exports = {
  DEFAULT_PAYMENT_METHODS,
  normalizePaymentMethods,
  getEnabledPaymentMethod,
  getCreditCustomerError
};
