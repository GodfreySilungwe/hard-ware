const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildApprovalMessage,
  buildManagerInstructions,
  sendWhatsAppApprovalMessage
} = require('../routes/auth');

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

test('a stalled WhatsApp approval notification is aborted after the request timeout', async () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.WHATSAPP_API_URL;
  const originalApiToken = process.env.WHATSAPP_API_TOKEN;
  const keepAlive = setTimeout(() => {}, 4000);
  delete process.env.WHATSAPP_API_URL;
  delete process.env.WHATSAPP_API_TOKEN;
  global.fetch = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });

  try {
    const result = await sendWhatsAppApprovalMessage({ phone: '+1234567890' });
    assert.equal(result.sent, false);
    assert.match(result.reason, /timed out|timeout/i);
  } finally {
    clearTimeout(keepAlive);
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.WHATSAPP_API_URL;
    else process.env.WHATSAPP_API_URL = originalApiUrl;
    if (originalApiToken === undefined) delete process.env.WHATSAPP_API_TOKEN;
    else process.env.WHATSAPP_API_TOKEN = originalApiToken;
  }
});
