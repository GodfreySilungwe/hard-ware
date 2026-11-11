const test = require('node:test');
const assert = require('node:assert/strict');
const Customer = require('../models/Customer');
const orderRoutes = require('../routes/orders');

test('sorts orders newest first before pagination', () => {
  const sorted = orderRoutes.sortOrdersNewestFirst([
    { orderNumber: 'ORD-OLD', createdAt: '2026-11-09T08:00:00.000Z' },
    { orderNumber: 'ORD-NEW', createdAt: '2026-11-10T09:00:00.000Z' },
    { orderNumber: 'ORD-MIDDLE', createdAt: '2026-11-09T12:00:00.000Z' }
  ]);

  assert.deepEqual(sorted.map((order) => order.orderNumber), [
    'ORD-NEW',
    'ORD-MIDDLE',
    'ORD-OLD'
  ]);
});

test('resolves saved customer details instead of the generic populate placeholder', async () => {
  const originalFindById = Customer.findById;
  Customer.findById = async (id) => ({
    _id: id,
    name: 'Jane Customer',
    phone: '0999123456'
  });

  try {
    const result = await orderRoutes.populateOrderCustomer({
      customer: { _id: 'customer-1', name: 'Customer' },
      orderNumber: 'ORD-1'
    });

    assert.deepEqual(result.customer, {
      _id: 'customer-1',
      id: 'customer-1',
      name: 'Jane Customer',
      phone: '0999123456'
    });
    assert.equal(result.orderNumber, 'ORD-1');
  } finally {
    Customer.findById = originalFindById;
  }
});

test('returns no customer details if a linked customer no longer exists', async () => {
  const originalFindById = Customer.findById;
  Customer.findById = async () => null;

  try {
    const result = await orderRoutes.populateOrderCustomer({
      customer: { _id: 'deleted-customer', name: 'Customer' }
    });

    assert.equal(result.customer, null);
  } finally {
    Customer.findById = originalFindById;
  }
});
