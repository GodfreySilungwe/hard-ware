const test = require('node:test');
const assert = require('node:assert/strict');

// lightweight handover calculation used for unit testing logic added to dashboard route
function computeHandoverFromOrders(orders) {
  let totalSales = 0;
  let creditSalesPeriod = 0;
  let posDirect = 0;

  for (const o of orders) {
    const orderTotal = Number(o.totalAmount || 0);
    totalSales += orderTotal;
    if (String(o.paymentMethod || '').toLowerCase() === 'credit') {
      creditSalesPeriod += orderTotal;
    } else {
      posDirect += orderTotal;
    }
  }

  return {
    totalSales,
    creditSalesPeriod,
    nonCreditPosSales: posDirect,
    expectedHandover: totalSales - creditSalesPeriod
  };
}

test('computes credit and non-credit sales and expected handover correctly', () => {
  const orders = [
    { totalAmount: 100, paymentMethod: 'cash' },
    { totalAmount: 200, paymentMethod: 'card' },
    { totalAmount: 150, paymentMethod: 'credit' },
    { totalAmount: 50, paymentMethod: 'credit' }
  ];

  const result = computeHandoverFromOrders(orders);

  assert.equal(result.totalSales, 500);
  assert.equal(result.creditSalesPeriod, 200);
  assert.equal(result.nonCreditPosSales, 300);
  assert.equal(result.expectedHandover, 300);
});
