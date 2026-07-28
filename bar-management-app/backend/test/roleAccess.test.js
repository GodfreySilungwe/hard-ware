const test = require('node:test');
const assert = require('node:assert/strict');
const { isHardwareManager } = require('../middleware/auth');

function createMockResponse() {
  const response = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };

  return response;
}

test('isHardwareManager allows hardware managers and blocks other roles', () => {
  let called = false;
  const next = () => { called = true; };

  const ownerRes = createMockResponse();
  isHardwareManager({ user: { role: 'owner' } }, ownerRes, next);
  assert.equal(ownerRes.statusCode, 403);
  assert.equal(called, false);

  const salesRes = createMockResponse();
  isHardwareManager({ user: { role: 'sales' } }, salesRes, next);
  assert.equal(salesRes.statusCode, 403);
  assert.equal(called, false);

  const managerRes = createMockResponse();
  isHardwareManager({ user: { role: 'hardware-manager' } }, managerRes, next);
  assert.equal(managerRes.statusCode, null);
  assert.equal(called, true);
});
