const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeKey, validateProductRows } = require('../lib/productImport');
const productRoutes = require('../routes/products');
const { isProductImportRequest } = productRoutes;

const validRow = (overrides = {}) => ({ name: 'Hammer', category: 'Tools', costPrice: 10, sellingPrice: 15, currentStock: 4, ...overrides });

test('normalizes category names for matching', () => {
  assert.equal(normalizeKey('  Electrical  '), 'electrical');
  const result = validateProductRows([validRow({ category: '  New Tools ' })], [], [{ name: 'Existing' }]);
  assert.deepEqual(result.newCategories, ['New Tools']);
});

test('rejects existing and duplicate products', () => {
  const result = validateProductRows([validRow(), validRow({ name: ' hammer ' })], [{ name: 'Other' }], []);
  assert.equal(result.products.length, 1);
  assert.equal(result.errors.length, 1);
});

test('rejects invalid required and numeric fields', () => {
  const result = validateProductRows([validRow({ name: '', costPrice: -1, currentStock: 1.5, unit: 'unknown' })], [], []);
  assert.equal(result.products.length, 0);
  assert.equal(result.errors.length, 4);
});

test('treats only explicit import payloads as spreadsheet or JSON imports', () => {
  assert.equal(isProductImportRequest({ query: { import: 'true' }, body: {} }), true);
  assert.equal(isProductImportRequest({ query: {}, body: { products: [{ name: 'Hammer' }] } }), true);
  assert.equal(isProductImportRequest({ query: {}, body: { name: 'Hammer', category: 'Tools' } }), false);
});