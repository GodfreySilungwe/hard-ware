const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addMonths,
  buildSubscriptionDates,
  getSubscriptionAccess
} = require('../lib/subscriptions');

test('clamps month-end subscription dates to the target month', () => {
  assert.equal(addMonths(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(addMonths(new Date('2028-01-31T00:00:00.000Z'), 1).toISOString(), '2028-02-29T00:00:00.000Z');
  assert.equal(addMonths(new Date('2026-03-31T00:00:00.000Z'), 1).toISOString(), '2026-04-30T00:00:00.000Z');
});

test('recognizes legacy tenants without subscription data', () => {
  const access = getSubscriptionAccess({ name: 'Legacy Hardware' });
  assert.deepEqual(access, {
    legacy: true,
    status: 'legacy',
    canAccess: true,
    gracePeriodDays: 10
  });
});

test('subscription status takes precedence over a future expiry', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(getSubscriptionAccess({
    subscriptionEnforced: true,
    subscriptionStatus: 'pending',
    subscriptionExpiresAt: '2099-01-01T00:00:00.000Z'
  }, now).status, 'pending');
  assert.equal(getSubscriptionAccess({
    subscriptionEnforced: true,
    subscriptionStatus: 'suspended',
    subscriptionExpiresAt: '2099-01-01T00:00:00.000Z'
  }, now).canAccess, false);
});

test('allows access through the exact grace-period boundary only', () => {
  const tenant = {
    subscriptionEnforced: true,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2026-01-01T00:00:00.000Z',
    gracePeriodDays: 10
  };
  assert.equal(getSubscriptionAccess(tenant, new Date('2026-01-11T00:00:00.000Z')).status, 'grace');
  assert.equal(getSubscriptionAccess(tenant, new Date('2026-01-11T00:00:00.001Z')).canAccess, false);
});

test('builds a supported subscription term', () => {
  assert.deepEqual(buildSubscriptionDates({
    startAt: '2026-01-31T00:00:00.000Z',
    termMonths: 1
  }), {
    startAt: '2026-01-31T00:00:00.000Z',
    expiresAt: '2026-02-28T00:00:00.000Z',
    termMonths: 1
  });
});
