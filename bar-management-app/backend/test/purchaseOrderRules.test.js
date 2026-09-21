const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePurchaseOrderItems,
  canUpdatePurchaseOrderStatus
} = require('../lib/purchaseOrderRules');

test('normalizes valid purchase order items without dropping zero cost', () => {
  assert.deepEqual(
    normalizePurchaseOrderItems([{ product: 'p1', quantity: '2', costPrice: '0' }]),
    [{ product: 'p1', quantity: 2, costPrice: 0 }]
  );
});

test('rejects missing, fractional, negative, and non-finite item values', () => {
  for (const item of [
    { product: '', quantity: 1, costPrice: 10 },
    { product: 'p1', quantity: 1.5, costPrice: 10 },
    { product: 'p1', quantity: 1, costPrice: -1 },
    { product: 'p1', quantity: 1, costPrice: 'not-a-number' }
  ]) {
    assert.throws(() => normalizePurchaseOrderItems([item]));
  }
});

test('allows valid status transitions and blocks receiving twice', () => {
  assert.equal(canUpdatePurchaseOrderStatus('pending', 'ordered'), true);
  assert.equal(canUpdatePurchaseOrderStatus('ordered', 'received'), true);
  assert.equal(canUpdatePurchaseOrderStatus('received', 'received'), true);
  assert.equal(canUpdatePurchaseOrderStatus('received', 'cancelled'), false);
  assert.equal(canUpdatePurchaseOrderStatus('pending', 'unknown'), false);
});