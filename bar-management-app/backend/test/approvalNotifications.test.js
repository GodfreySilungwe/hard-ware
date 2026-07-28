const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApprovalMessage, buildManagerInstructions } = require('../routes/auth');

test('approval messages include login guidance and manager instructions', () => {
  const message = buildApprovalMessage({ fullName: 'Jane Doe', username: 'janedoe' });
  assert.match(message, /approved/i);
  assert.match(message, /log in/i);
  assert.match(message, /username/i);

  const instructions = buildManagerInstructions({ fullName: 'Jane Doe' });
  assert.match(instructions, /create sales team/i);
  assert.match(instructions, /products, categories, inventory/i);
  assert.match(instructions, /POS/i);
});
