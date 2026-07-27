const test = require('node:test');
const assert = require('node:assert/strict');
const { getTenantAccessMessage, shouldPromoteToOwner } = require('../routes/auth');

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
