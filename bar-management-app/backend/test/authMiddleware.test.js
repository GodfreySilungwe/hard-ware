const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');

test('protect attaches a sanitized user for owner requests', async () => {
  const originalVerify = jwt.verify;
  const originalFindById = User.findById;

  jwt.verify = () => ({ id: 'user-123' });
  User.findById = async () => ({
    _id: 'user-123',
    role: 'owner',
    password: 'secret'
  });

  const req = {
    headers: {
      authorization: 'Bearer test-token'
    }
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  try {
    await auth.protect(req, res, next);
    assert.equal(nextCalled, true);
    assert.equal(req.user.role, 'owner');
    assert.equal(req.user.password, undefined);
  } finally {
    jwt.verify = originalVerify;
    User.findById = originalFindById;
  }
});

test('isOwnerOrHardwareManager accepts alternate role formats', () => {
  const req = {
    user: {
      role: 'hardware manager'
    }
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  auth.isOwnerOrHardwareManager(req, res, next);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('isHardwareManager accepts alternate role formats', () => {
  const req = {
    user: {
      role: 'hardware manager'
    }
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  auth.isHardwareManager(req, res, next);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
