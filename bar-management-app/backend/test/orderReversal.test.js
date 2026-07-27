const test = require('node:test');
const assert = require('node:assert/strict');
const { applyOrderReversal, canReverseOrder } = require('../lib/orderReversal');

test('restores inventory and marks the order as reversed', async () => {
  const order = {
    status: 'completed',
    totalAmount: 1000,
    items: [{ product: 'p1', quantity: 2 }]
  };

  const products = [
    {
      _id: 'p1',
      currentStock: 5,
      async save() {
        this.saved = true;
        return this;
      }
    }
  ];

  const productFinder = async (id) => products.find((product) => product._id === id) || null;
  const user = { _id: 'u1', role: 'hardware-manager' };

  const result = await applyOrderReversal(order, productFinder, user, { reason: 'Customer requested cancellation' });

  assert.equal(result.order.status, 'reversed');
  assert.equal(products[0].currentStock, 7);
  assert.equal(result.order.reversalReason, 'Customer requested cancellation');
  assert.equal(result.order.reversedBy, 'u1');
});

test('allows reversal only for hardware managers or owners', () => {
  assert.equal(canReverseOrder({ role: 'hardware-manager' }), true);
  assert.equal(canReverseOrder({ role: 'owner' }), true);
  assert.equal(canReverseOrder({ role: 'sales' }), false);
});
