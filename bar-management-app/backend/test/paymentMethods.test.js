const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PAYMENT_METHODS,
  normalizePaymentMethods,
  getEnabledPaymentMethod,
  getCreditCustomerError
} = require('../lib/paymentMethods');

test('uses the existing five payment methods as defaults', () => {
  assert.deepEqual(normalizePaymentMethods(), DEFAULT_PAYMENT_METHODS);
});

test('normalizes configured methods and keeps credit mapped to cash', () => {
  const methods = normalizePaymentMethods([
    { id: 'custom_wallet', label: '  Local Wallet ', account: 'mobile_money', enabled: false },
    { id: 'credit', label: 'Customer credit', account: 'card', enabled: true }
  ]);

  assert.deepEqual(methods, [
    { id: 'custom_wallet', label: 'Local Wallet', account: 'mobile_money', enabled: false },
    { id: 'credit', label: 'Customer credit', account: 'cash', enabled: true }
  ]);
});

test('rejects invalid method lists, duplicate IDs, labels, and ledger accounts', () => {
  assert.throws(() => normalizePaymentMethods('cash'), /must be a list/);
  assert.throws(() => normalizePaymentMethods([
    { id: 'cash', label: 'Cash', account: 'cash' },
    { id: 'cash', label: 'Cash again', account: 'cash' }
  ]), /Duplicate payment method/);
  assert.throws(() => normalizePaymentMethods([
    { id: 'custom_wallet', label: ' ', account: 'cash' }
  ]), /labels must be/);
  assert.throws(() => normalizePaymentMethods([
    { id: 'custom_wallet', label: 'Wallet', account: 'unknown' }
  ]), /Invalid ledger account/);
});

test('only resolves enabled payment methods', () => {
  const methods = [
    { id: 'custom_wallet', label: 'Wallet', account: 'mobile_money', enabled: false },
    { id: 'cash', label: 'Cash', account: 'cash', enabled: true }
  ];

  assert.equal(getEnabledPaymentMethod(methods, 'custom_wallet'), null);
  assert.equal(getEnabledPaymentMethod(methods, 'cash').account, 'cash');
});

test('requires a saved customer for credit payments only', () => {
  assert.equal(getCreditCustomerError('credit', null), 'Select a saved customer before using Credit.');
  assert.equal(getCreditCustomerError('credit', 'customer-1'), null);
  assert.equal(getCreditCustomerError('cash', null), null);
});
