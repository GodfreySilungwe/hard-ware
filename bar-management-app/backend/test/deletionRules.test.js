const test = require('node:test');
const assert = require('node:assert/strict');
const { canDeleteProduct, canDeleteCategory } = require('../lib/deletionRules');

test('blocks product deletion when stock remains', () => {
  assert.deepEqual(canDeleteProduct({ currentStock: 5 }), {
    allowed: false,
    reason: 'Cannot delete a product while stock is still available.'
  });

  assert.deepEqual(canDeleteProduct({ currentStock: 0 }), {
    allowed: true,
    reason: null
  });
});

test('blocks category deletion when products are attached', () => {
  assert.deepEqual(canDeleteCategory({ attachedProducts: [{ _id: 'p1' }] }), {
    allowed: false,
    reason: 'Cannot delete a category that still has products attached.'
  });

  assert.deepEqual(canDeleteCategory({ attachedProducts: [] }), {
    allowed: true,
    reason: null
  });
});
