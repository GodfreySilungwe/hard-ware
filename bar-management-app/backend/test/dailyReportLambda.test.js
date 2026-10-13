const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getReportWindow,
  getTenantReportRecipients,
  getShopDisplayName,
  buildReportLookupMaps,
  buildReportActivityMetrics,
  getReportPaymentLabel,
  buildReportEmailText,
  createSalesPdf,
  buildRawEmail
} = require('../dailyReportLambda');
const { buildReportSummary } = require('../lib/orderMetrics');

test('builds report windows from the previous Malawi 19:00 through report-date 19:00', () => {
  const window = getReportWindow(new Date('2026-10-12T12:00:00.000Z'), '2026-10-12');

  assert.equal(window.startDate, '2026-10-11T17:00:00.000Z');
  assert.equal(window.endDate, '2026-10-12T16:59:59.999Z');
  assert.equal(window.endExclusive, '2026-10-12T17:00:00.000Z');
});

test('selects the report date using Malawi time when UTC has crossed midnight', () => {
  const window = getReportWindow(new Date('2026-10-11T22:05:00.000Z'));

  assert.equal(window.reportDate, '2026-10-12');
  assert.equal(window.startDate, '2026-10-11T17:00:00.000Z');
  assert.equal(window.endExclusive, '2026-10-12T17:00:00.000Z');
});

test('rejects malformed and impossible report dates', () => {
  assert.throws(() => getReportWindow(new Date(), '12-10-2026'), /YYYY-MM-DD/);
  assert.throws(() => getReportWindow(new Date(), '2026-02-30'), /invalid/);
});

test('sends to the active tenant manager and cc configured recipients', () => {
  const recipients = getTenantReportRecipients({
    id: 'tenant-1',
    dailyReportRecipients: ['reports@example.com', 'MANAGER@example.com', 'not-an-email']
  }, [
    { tenantId: 'tenant-2', role: 'hardware-manager', email: 'other@example.com' },
    { tenantId: 'tenant-1', role: 'hardware-manager', isActive: false, email: 'inactive@example.com' },
    { tenantId: 'tenant-1', role: 'hardware-manager', isActive: true, email: 'manager@example.com' }
  ]);

  assert.deepEqual(recipients, {
    to: ['manager@example.com'],
    cc: ['reports@example.com']
  });
});

test('uses configured recipients when no active tenant manager email exists', () => {
  assert.deepEqual(getTenantReportRecipients({
    id: 'tenant-1',
    dailyReportRecipients: ['reports@example.com']
  }, []), { to: ['reports@example.com'], cc: [] });
});

test('hydrates POS product IDs to tenant product and category names', () => {
  const orders = [{
    totalAmount: 150,
    items: [
      { product: 'product-1', quantity: 1, subtotal: 100 },
      { product: 'product-2', quantity: 1, subtotal: 50 }
    ]
  }];
  const lookups = buildReportLookupMaps('tenant-1', orders, [
    { id: 'product-1', tenantId: 'tenant-1', name: 'Hammer', category: 'category-1' },
    { id: 'product-2', tenantId: 'tenant-2', name: 'Rope', category: 'category-2' }
  ], [
    { id: 'category-1', tenantId: 'tenant-1', name: 'Tools' },
    { id: 'category-2', tenantId: 'tenant-2', name: 'Hardware' }
  ]);
  const summary = buildReportSummary(orders, { includeReversed: false, ...lookups });

  assert.deepEqual(summary.topProducts.map((product) => product.name), ['Hammer', 'Unknown']);
  assert.deepEqual(summary.categorySales, [
    { name: 'Tools', revenue: 100 },
    { name: 'Uncategorized', revenue: 50 }
  ]);
});

test('counts identified customers and groups peak sales hour in Malawi time', () => {
  const metrics = buildReportActivityMetrics([
    { customer: { id: 'customer-1' }, createdAt: '2026-10-12T17:30:00.000Z', totalAmount: 100 },
    { customerName: 'Walk-in', createdAt: '2026-10-12T18:05:00.000Z', totalAmount: 200 },
    { customer: 'customer-1', createdAt: '2026-10-12T18:45:00.000Z', totalAmount: 75 }
  ]);

  assert.equal(metrics.identifiedCustomers, 1);
  assert.deepEqual(metrics.busiestHour, { hour: '20:00', amount: 275, orders: 2 });
});

test('uses Bank for card tender and includes shop name in email body', () => {
  const window = getReportWindow(new Date(), '2026-10-12');

  assert.equal(getReportPaymentLabel({ method: 'card', label: 'Card' }), 'Bank');
  assert.equal(getReportPaymentLabel({ method: 'cash', label: 'Cash' }), 'Cash');
  assert.match(buildReportEmailText({ shopName: 'Central Hardware', window }), /Shop name: Central Hardware/);
});

test('uses the manager name when a tenant has no shop name', () => {
  assert.equal(getShopDisplayName({ id: 'tenant-1', hardwareName: 'Legacy name' }, [
    { tenantId: 'tenant-1', role: 'hardware-manager', fullName: 'Amina Banda', username: 'amina' }
  ]), 'Amina Banda');
  assert.equal(getShopDisplayName({ id: 'tenant-1', shopName: '   ' }, [
    { tenantId: 'tenant-1', role: 'hardware-manager', fullName: 'Amina Banda' }
  ]), 'Amina Banda');
  assert.equal(getShopDisplayName({ id: 'tenant-1', shopName: 'Central Hardware' }, []), 'Central Hardware');
});

test('creates a PDF sales report and MIME email attachment', async () => {
  const window = getReportWindow(new Date(), '2026-10-12');
  const pdf = await createSalesPdf({
    shopName: 'Test Hardware',
    window,
    orders: [{
      id: 'order-1',
      createdAt: window.startDate,
      status: 'completed',
      totalAmount: 100,
      netAmount: 100,
      profit: 25,
      paymentMethod: 'cash',
      items: [{ name: 'Hammer', quantity: 1, subtotal: 100, priceAtSale: 100 }]
    }]
  });
  const rawMessage = buildRawEmail({
    from: 'sender@example.com',
    to: ['manager@example.com'],
    subject: 'Daily report',
    text: 'Attached report',
    filename: 'report.pdf',
    attachment: pdf
  }).toString();

  assert.ok(pdf.subarray(0, 4).equals(Buffer.from('%PDF')));
  assert.match(rawMessage, /Content-Type: application\/pdf/);
  assert.match(rawMessage, /filename="report\.pdf"/);
});