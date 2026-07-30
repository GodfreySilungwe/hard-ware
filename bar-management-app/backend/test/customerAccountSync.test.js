const test = require('node:test');
const assert = require('node:assert/strict');
const { applyOrderToCustomerAccount } = require('../lib/customerAccountSync');

test('increases a customer credit balance when a POS sale is created', () => {
  const customer = {
    totalSpent: 120,
    loyaltyPoints: 1,
    creditBalance: 25
  };

  applyOrderToCustomerAccount(customer, 150);

  assert.equal(customer.totalSpent, 270);
  assert.equal(customer.loyaltyPoints, 2);
  assert.equal(customer.creditBalance, 175);
});

test('reduces a customer credit balance when a POS sale is reversed', () => {
  const customer = {
    totalSpent: 270,
    loyaltyPoints: 2,
    creditBalance: 175
  };

  applyOrderToCustomerAccount(customer, 150, { reverse: true });

  assert.equal(customer.totalSpent, 120);
  assert.equal(customer.loyaltyPoints, 1);
  assert.equal(customer.creditBalance, 25);
});
