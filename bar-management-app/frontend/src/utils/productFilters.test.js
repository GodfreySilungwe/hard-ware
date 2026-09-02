import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSortProducts } from './productFilters.js';

test('filters by name and sorts by stock descending', () => {
  const products = [
    { _id: '1', name: 'Bolt', currentStock: 4, sellingPrice: 20, costPrice: 15 },
    { _id: '2', name: 'Hammer', currentStock: 9, sellingPrice: 70, costPrice: 45 },
    { _id: '3', name: 'Nail Set', currentStock: 2, sellingPrice: 30, costPrice: 18 }
  ];

  const result = filterAndSortProducts(products, 'ha', 'stock-desc');

  assert.deepEqual(result.map((p) => p._id), ['2']);
});

test('sorts by price ascending with no search term', () => {
  const products = [
    { _id: '1', name: 'Bolt', currentStock: 4, sellingPrice: 20, costPrice: 15 },
    { _id: '2', name: 'Hammer', currentStock: 9, sellingPrice: 70, costPrice: 45 },
    { _id: '3', name: 'Nail Set', currentStock: 2, sellingPrice: 30, costPrice: 18 }
  ];

  const result = filterAndSortProducts(products, '', 'price-asc');

  assert.deepEqual(result.map((p) => p._id), ['1', '3', '2']);
});
