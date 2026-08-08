const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDiscountedOrderTotal, settleCustomerCreditBalance } = require('../lib/customerAccountSync');

test('caps discount at the order subtotal', () => {
  const result = calculateDiscountedOrderTotal(2500, 3000);

  assert.equal(result.discountAmount, 2500);
  assert.equal(result.discountedTotal, 0);
});

test('reduces customer credit balance without going below zero', () => {
  const customer = { creditBalance: 500 };

  settleCustomerCreditBalance(customer, 600);

  assert.equal(customer.creditBalance, 0);
});

test('settles partial credit and returns correct remaining balance', () => {
  const customer = { creditBalance: 500 };

  settleCustomerCreditBalance(customer, 200);

  assert.equal(customer.creditBalance, 300);
});
