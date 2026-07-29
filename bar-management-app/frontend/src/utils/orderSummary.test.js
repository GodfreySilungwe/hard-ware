import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTodayOrderSummary } from './orderSummary.js';

test('uses backend totals when the today summary has totals but no orders array', () => {
  const summary = resolveTodayOrderSummary({ totalSales: 250, totalProfit: 75 }, [], new Date('2024-01-01T00:00:00.000Z'));

  assert.equal(summary.totalSales, 250);
  assert.equal(summary.totalProfit, 75);
  assert.equal(summary.count, 0);
  assert.equal(summary.averageOrderValue, 0);
});
