const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCurrencyCode,
  formatCurrencyAmount,
  isValidCurrencyCode
} = require('../lib/currency');

test('normalizes legacy currency symbols to ISO currency codes', () => {
  assert.equal(normalizeCurrencyCode('$'), 'USD');
  assert.equal(normalizeCurrencyCode('R'), 'ZAR');
  assert.equal(normalizeCurrencyCode(''), 'MWK');
});

test('formats money using the configured currency and preserves Malawi formatting', () => {
  assert.equal(formatCurrencyAmount(1234.5, 'MWK'), 'MK 1,234.50');
  assert.equal(formatCurrencyAmount(1234.5, 'USD'), '$ 1,234.50');
});

test('accepts supported ISO currency codes and rejects invalid values', () => {
  assert.equal(isValidCurrencyCode('EUR'), true);
  assert.equal(isValidCurrencyCode('not-a-currency'), false);
  assert.equal(isValidCurrencyCode('ZZZ'), false);
  assert.equal(isValidCurrencyCode('$'), true);
});
