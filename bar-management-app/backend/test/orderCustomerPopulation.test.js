const test = require('node:test');
const assert = require('node:assert/strict');
const Customer = require('../models/Customer');
const orderRoutes = require('../routes/orders');

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
