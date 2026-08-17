const test = require('node:test');
const assert = require('node:assert/strict');

const { buildProductSummary } = require('../routes/dashboard');

test('includes unsold products and paginates at 20 items per page for manager and sales roles', () => {
  const products = [
    { _id: 'p1', name: 'Pipes', currentStock: 127, costPrice: 50, sellingPrice: 60 },
    { _id: 'p2', name: 'Cement', currentStock: 40, costPrice: 10, sellingPrice: 15 },
    { _id: 'p3', name: 'Nails', currentStock: 25, costPrice: 2, sellingPrice: 3 }
  ];

  const productMap = new Map([
    ['p1', { name: 'Pipes', sold: 1, amount: 6000 }],
    ['p2', { name: 'Cement', sold: 0, amount: 0 }]
  ]);

  const purchaseOrderQtyMap = new Map([
    ['p1', 22],
    ['p2', 12]
  ]);

  const summary = buildProductSummary({
    products,
    productMap,
    purchaseOrderQtyMap,
    productPage: 1,
    productLimit: 20,
    defaultProductLimit: 20
  });

  assert.equal(summary.productSummary.length, 3);
  assert.equal(summary.productSummary[0].productId, 'p1');
  assert.equal(summary.productSummary[1].productId, 'p2');
  assert.equal(summary.productSummary[2].productId, 'p3');
  assert.equal(summary.productSummary[2].soldQty, 0);
  assert.equal(summary.productSummary[2].totalAmount, 0);
  assert.equal(summary.productSummary[2].closingQty, 25);
  assert.equal(summary.productSummaryPagination.page, 1);
  assert.equal(summary.productSummaryPagination.totalPages, 1);
  assert.equal(summary.productSummaryPagination.limit, 20);
});
