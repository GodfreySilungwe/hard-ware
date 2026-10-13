const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getTenantAccessMessage,
  shouldPromoteToOwner,
  getRegistrationConflicts,
  resolveLoginIdentity,
  normalizeShopName,
  getShopNameValidationError,
  normalizeShopProfile,
  getShopProfileValidationError
} = require('../routes/auth');

test('tenant access messages use clear hardware wording', () => {
  assert.equal(getTenantAccessMessage('suspended'), 'This hardware is suspended. Please contact support.');
  assert.equal(getTenantAccessMessage('deleted'), 'This hardware has been deleted and cannot be used.');
  assert.equal(getTenantAccessMessage('active'), null);
});

test('pending hardware-manager accounts stay hardware-scoped even when credentials resemble the owner', () => {
  const ownerConfig = {
    username: 'gsilungwe',
    email: 'silungwegod@gmail.com'
  };

  const pendingHardwareManager = {
    role: 'hardware-manager',
    username: 'gsilungwe',
    email: 'silungwegod@gmail.com',
    registrationStatus: 'pending'
  };

  assert.equal(shouldPromoteToOwner(pendingHardwareManager, ownerConfig), false);
});

test('allows the same email in separate shop registrations but enforces unique usernames', () => {
  const existingUsers = [{ username: 'shop-one', email: 'owner@example.com', tenantId: 'tenant-1' }];

  assert.deepEqual(getRegistrationConflicts(existingUsers, {
    username: 'shop-two',
    email: 'OWNER@example.com',
    tenantId: 'tenant-2'
  }), { usernameExists: false, emailExistsInTenant: false });
  assert.deepEqual(getRegistrationConflicts(existingUsers, {
    username: ' SHOP-ONE ',
    email: 'new@example.com',
    tenantId: 'tenant-2'
  }), { usernameExists: true, emailExistsInTenant: false });
  assert.deepEqual(getRegistrationConflicts(existingUsers, {
    username: 'shop-one-again',
    email: 'OWNER@example.com',
    tenantId: 'tenant-1'
  }), { usernameExists: false, emailExistsInTenant: true });
});

test('requires username for a shared email while retaining single-account email login', () => {
  const users = [
    { username: 'east-shop', email: 'owner@example.com', tenantId: 'tenant-1' },
    { username: 'west-shop', email: 'owner@example.com', tenantId: 'tenant-2' }
  ];

  assert.deepEqual(resolveLoginIdentity(users, 'OWNER@example.com'), {
    user: null,
    ambiguousUsername: false,
    requiresUsername: true
  });
  assert.equal(resolveLoginIdentity(users, 'WEST-SHOP').user, users[1]);
  assert.equal(resolveLoginIdentity([users[0]], 'owner@example.com').user, users[0]);
});

test('requires a trimmed shop name with a maximum of 120 characters', () => {
  assert.equal(normalizeShopName('  Lakeside Store  '), 'Lakeside Store');
  assert.equal(getShopNameValidationError('   '), 'Shop name is required.');
  assert.equal(getShopNameValidationError('S'.repeat(121)), 'Shop name must be 120 characters or fewer.');
  assert.equal(getShopNameValidationError('Lakeside Store'), null);
});

test('requires district, trading center, and a short shop description', () => {
  assert.deepEqual(normalizeShopProfile({
    district: '  Lilongwe  ',
    tradingCenter: '  Area 25  ',
    shopDescription: '  Groceries and household goods  '
  }), {
    district: 'Lilongwe',
    tradingCenter: 'Area 25',
    shopDescription: 'Groceries and household goods'
  });
  assert.equal(getShopProfileValidationError({ district: '', tradingCenter: 'Area 25', shopDescription: 'Groceries' }), 'District is required.');
  assert.equal(getShopProfileValidationError({ district: 'Lilongwe', tradingCenter: '', shopDescription: 'Groceries' }), 'Trading center is required.');
  assert.equal(getShopProfileValidationError({ district: 'Lilongwe', tradingCenter: 'Area 25', shopDescription: '' }), 'Please briefly describe what the shop sells.');
  assert.equal(getShopProfileValidationError({ district: 'Lilongwe', tradingCenter: 'Area 25', shopDescription: 'Groceries' }), null);
  assert.match(getShopProfileValidationError({ district: 'D'.repeat(101), tradingCenter: 'Area 25', shopDescription: 'Groceries' }), /District/);
  assert.match(getShopProfileValidationError({ district: 'Lilongwe', tradingCenter: 'T'.repeat(121), shopDescription: 'Groceries' }), /Trading center/);
  assert.match(getShopProfileValidationError({ district: 'Lilongwe', tradingCenter: 'Area 25', shopDescription: 'S'.repeat(301) }), /description/);
});
