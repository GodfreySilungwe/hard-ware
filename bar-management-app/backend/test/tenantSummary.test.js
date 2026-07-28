const test = require('node:test');
const assert = require('node:assert/strict');
const { isHardwareManagerUser } = require('../routes/auth');

test('hardware manager detection excludes the default owner account', () => {
  const ownerConfig = {
    username: 'gsilungwe',
    email: 'silungwegod@gmail.com'
  };

  assert.equal(isHardwareManagerUser({ role: 'hardware-manager', username: 'gsilungwe', email: 'silungwegod@gmail.com' }, ownerConfig), false);
  assert.equal(isHardwareManagerUser({ role: 'hardware-manager', username: 'manager-one', email: 'manager@example.com' }, ownerConfig), true);
  assert.equal(isHardwareManagerUser({ role: 'sales', username: 'manager-one' }, ownerConfig), false);
});
