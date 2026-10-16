const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const PDFDocument = require('pdfkit');
const dynamodb = require('./lib/dynamodb');
const { buildReportSummary } = require('./lib/orderMetrics');

const REPORT_TIME_ZONE = 'Africa/Blantyre';
const MALAWI_OFFSET_MINUTES = 120;
const REPORT_END_HOUR = 19;
const REPORT_COLORS = {
  ink: '#18313F',
  muted: '#607681',
  teal: '#087F78',
  amber: '#E3A53B',
  paper: '#F2F6F5',
  line: '#D8E2E2',
  white: '#FFFFFF'
};
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

const getCalendarDate = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getReportWindow = (referenceTime = new Date(), reportDate = null) => {
  const localDate = reportDate || getCalendarDate(new Date(referenceTime));
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!dateMatch) throw new Error('Report date must be in YYYY-MM-DD format.');

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    normalizedDate.getUTCFullYear() !== year
    || normalizedDate.getUTCMonth() !== month - 1
    || normalizedDate.getUTCDate() !== day
  ) throw new Error('Report date is invalid.');

  const startMs = Date.UTC(year, month - 1, day - 1, REPORT_END_HOUR)
    - MALAWI_OFFSET_MINUTES * 60 * 1000;
  const endExclusiveMs = Date.UTC(year, month - 1, day, REPORT_END_HOUR)
    - MALAWI_OFFSET_MINUTES * 60 * 1000;
  return {
    reportDate: localDate,
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endExclusiveMs - 1).toISOString(),
    endExclusive: new Date(endExclusiveMs).toISOString()
  };
};

const formatDateTime = (value) => new Date(value).toLocaleString('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: REPORT_TIME_ZONE
});

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const getShopDisplayName = (tenant, users = []) => {
  const tenantId = String(tenant?._id || tenant?.id || '');
  const shopName = String(tenant?.shopName || '').trim();
  if (shopName) return shopName;

  const manager = users.find((user) => (
    user.role === 'hardware-manager'
    && String(user.tenantId || '') === tenantId
  ));
  return String(
    manager?.fullName
    || manager?.username
    || tenant?.hardwareName
    || tenant?.name
    || 'Shop'
  ).trim();
};

const getReportPaymentLabel = (payment) => (
  String(payment?.method || '').toLowerCase() === 'card' ? 'Bank' : payment?.label
);

const buildReportEmailText = ({ shopName, window }) => (
  `Shop name: ${shopName}\n`
  + `Report period: ${formatDateTime(window.startDate)} to ${formatDateTime(window.endExclusive)} CAT\n\n`
  + 'Attached is the daily sales report.'
);

const buildNoSalesReminderText = ({ shopName, window }) => (
  `Hello,\n\n`
  + `We did not record sales for ${shopName || 'your shop'} during `
  + `${formatDateTime(window.startDate)} to ${formatDateTime(window.endExclusive)} CAT.\n\n`
  + 'If you are still getting set up, add your products and prices in the app to start recording sales. '
  + 'For help getting started, contact your account administrator or support team.\n\n'
  + 'Please do not reply to this email.\n\n'
  + 'Support'
);

const buildRawTextEmail = ({ from, to, cc = [], subject, text }) => {
  const encodedText = Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const message = [
    `From: ${from}`,
    `To: ${formatEmailHeader(to)}`,
    ...(formatEmailHeader(cc) ? [`Cc: ${formatEmailHeader(cc)}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedText
  ].join('\r\n');
  return Buffer.from(message);
};

const buildReportActivityMetrics = (orders) => {
  const hourFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23'
  });
  const customerIds = new Set();
  const salesByHour = new Map();

  (orders || []).forEach((order) => {
    const customer = order.customer;
    const customerId = customer && typeof customer === 'object'
      ? customer._id || customer.id
      : customer;
    const customerName = (typeof customer === 'object' ? customer?.name : null) || order.customerName;
    const customerKey = String(customerId || customerName || '').trim().toLowerCase();
    if (customerKey && !['walk-in', 'walk in', 'guest', 'unknown'].includes(customerKey)) {
      customerIds.add(customerKey);
    }

    const createdAt = new Date(order.createdAt || order.created_at || '');
    if (Number.isNaN(createdAt.getTime())) return;
    const hour = hourFormatter.format(createdAt);
    const hourSummary = salesByHour.get(hour) || { amount: 0, orders: 0 };
    hourSummary.amount += Number(order.totalAmount || 0);
    hourSummary.orders += 1;
    salesByHour.set(hour, hourSummary);
  });

  const busiestHour = [...salesByHour.entries()]
    .sort((left, right) => right[1].amount - left[1].amount || left[0].localeCompare(right[0]))[0];
  return {
    identifiedCustomers: customerIds.size,
    busiestHour: busiestHour ? { hour: `${busiestHour[0]}:00`, ...busiestHour[1] } : null
  };
};

const isValidEmail = (email) => (
  typeof email === 'string'
  && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)
  && !/[\r\n]/.test(email)
);

const getTenantReportRecipients = (tenant, users) => {
  const tenantId = String(tenant?._id || tenant?.id || '');
  const manager = (users || []).find((user) => (
    user.role === 'hardware-manager'
    && user.isActive !== false
    && String(user.tenantId || '') === tenantId
    && isValidEmail(String(user.email || '').trim())
  ));
  const configuredRecipients = [...new Set((Array.isArray(tenant?.dailyReportRecipients) ? tenant.dailyReportRecipients : [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(isValidEmail))];
  const managerEmail = String(manager?.email || '').trim();

  if (managerEmail) {
    return {
      to: [managerEmail],
      cc: configuredRecipients.filter((email) => email !== managerEmail.toLowerCase())
    };
  }
  return { to: configuredRecipients, cc: [] };
};

const getOrderId = (order) => String(order?._id || order?.id || order?.orderNumber || '');
const getReferenceId = (reference) => (
  reference && typeof reference === 'object'
    ? String(reference._id || reference.id || reference.categoryId || '').trim()
    : String(reference || '').trim()
);

const buildReportLookupMaps = (tenantId, orders, products, categories) => {
  const items = (orders || []).flatMap((order) => (Array.isArray(order.items) ? order.items : []));
  const productIds = new Set(items
    .map((item) => getReferenceId(item.product?._id || item.product || item.productId))
    .filter(Boolean));
  const tenantProducts = (products || []).filter((product) => {
    const productId = getReferenceId(product);
    return productIds.has(productId)
      && (String(product.tenantId || '') === String(tenantId) || !product.tenantId);
  });
  const productMap = new Map(tenantProducts.map((product) => [getReferenceId(product), product]));
  const inlineCategories = [
    ...tenantProducts.map((product) => product.category),
    ...items.map((item) => item.product?.category)
  ].filter((category) => category && typeof category === 'object' && category.name);
  const categoryIds = new Set([
    ...tenantProducts.map((product) => getReferenceId(product.category)),
    ...inlineCategories.map(getReferenceId)
  ].filter(Boolean));
  const categoryMap = new Map((categories || [])
    .filter((category) => {
      const categoryId = getReferenceId(category);
      return categoryIds.has(categoryId)
        && (String(category.tenantId || '') === String(tenantId) || !category.tenantId);
    })
    .map((category) => [getReferenceId(category), category]));

  inlineCategories.forEach((category) => {
    const categoryId = getReferenceId(category);
    if (categoryId && !categoryMap.has(categoryId)) categoryMap.set(categoryId, category);
  });
  return { productMap, categoryMap };
};

const collectTenantOrders = async (tenantId, window, legacyOrders = null) => {
  let indexedOrders = [];
  try {
    indexedOrders = await dynamodb.queryByGSI(tenantId, window.startDate, window.endDate);
  } catch (error) {
    console.warn(`Daily report GSI query failed for tenant ${tenantId}; using legacy order records: ${error.message}`);
  }

  const allLegacyOrders = legacyOrders || await dynamodb.listEntities('order', {
    projection: [
      '_id', 'id', 'tenantId', 'orderNumber', 'customerName', 'items', 'totalAmount',
      'taxAmount', 'netAmount', 'profit', 'paymentMethod', 'createdAt', 'status',
      'taxCompliant', 'paidAmount', 'customer'
    ]
  });
  const startTime = Date.parse(window.startDate);
  const endTime = Date.parse(window.endDate);
  const inWindow = (order) => {
    const createdAt = Date.parse(order.createdAt || '');
    return String(order.tenantId || '') === String(tenantId)
      && Number.isFinite(createdAt)
      && createdAt >= startTime
      && createdAt <= endTime
      && order.status !== 'reversed'
      && Number(order.totalAmount || 0) > 0;
  };
  const ordersById = new Map();
  [...indexedOrders, ...allLegacyOrders].filter(inWindow).forEach((order, index) => {
    ordersById.set(getOrderId(order) || `row-${index}`, order);
  });
  return [...ordersById.values()];
};

const createSalesPdf = async ({ shopName, orders, window, productMap = new Map(), categoryMap = new Map() }) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 42 });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);

  const summary = buildReportSummary(orders, { includeReversed: false, productMap, categoryMap });
  const activity = buildReportActivityMetrics(orders);
  const contentX = 42;
  const contentWidth = document.page.width - contentX * 2;
  document.rect(0, 0, document.page.width, 138).fill(REPORT_COLORS.ink);
  document.rect(0, 134, document.page.width, 4).fill(REPORT_COLORS.amber);
  document.fillColor('#C5D8D8').font('Helvetica-Bold').fontSize(8)
    .text('SHOP  /  OPERATIONS', contentX, 24, { characterSpacing: 1.2 });
  document.fillColor(REPORT_COLORS.white).font('Helvetica-Bold').fontSize(23)
    .text('Daily Sales Report', contentX, 49, { width: contentWidth });
  document.font('Helvetica').fontSize(11).fillColor('#E0ECEB')
    .text(`Shop name: ${shopName || 'Shop'}`, contentX, 82, { width: contentWidth });
  document.fontSize(9).fillColor('#C5D8D8')
    .text(`${formatDateTime(window.startDate)} to ${formatDateTime(window.endExclusive)} CAT`, contentX, 101);
  document.fontSize(8).fillColor('#C5D8D8')
    .text(`Generated ${formatDateTime(new Date())} CAT`, contentX, 117);

  document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text('Performance summary', contentX, 157);
  const gap = 9;
  const cardWidth = (contentWidth - gap * 3) / 4;
  const cards = [
    ['Gross sales', `MK ${formatMoney(summary.totalSales)}`],
    ['Net sales', `MK ${formatMoney(summary.totalSalesNet)}`],
    ['Gross profit', `MK ${formatMoney(summary.totalProfit)}`],
    ['Gross margin', `${formatMoney(summary.grossMarginPercentage)}%`],
    ['Orders', String(summary.totalOrders)],
    ['Average sale', `MK ${formatMoney(summary.averageOrderValue)}`],
    ['Units sold', formatMoney(summary.totalItems)],
    ['Tax collected', `MK ${formatMoney(summary.totalTax)}`]
  ];
  cards.forEach(([label, value], index) => {
    const x = contentX + (index % 4) * (cardWidth + gap);
    const y = 180 + Math.floor(index / 4) * 72;
    const highlight = index === 0 || index === 2;
    document.roundedRect(x, y, cardWidth, 64, 5).fill(highlight ? REPORT_COLORS.teal : REPORT_COLORS.paper);
    document.fillColor(highlight ? '#D5F1EB' : REPORT_COLORS.muted).font('Helvetica-Bold').fontSize(7)
      .text(label.toUpperCase(), x + 9, y + 10, { width: cardWidth - 18, lineBreak: false, ellipsis: true });
    document.fillColor(highlight ? REPORT_COLORS.white : REPORT_COLORS.ink).fontSize(12)
      .text(value, x + 9, y + 30, { width: cardWidth - 18, lineBreak: false, ellipsis: true });
  });

  const activityY = 336;
  document.roundedRect(contentX, activityY, contentWidth, 48, 5).fill(REPORT_COLORS.paper);
  const activityMetrics = [
    { label: 'IDENTIFIED CUSTOMERS', value: String(activity.identifiedCustomers) },
    { label: 'AVG. ITEMS / SALE', value: formatMoney(summary.averageItemsPerOrder) },
    {
      label: 'PEAK SALES HOUR',
      value: activity.busiestHour
        ? `${activity.busiestHour.hour}  |  MK ${formatMoney(activity.busiestHour.amount)}`
        : 'No timed sales'
    }
  ];
  const activityColumnWidth = contentWidth / activityMetrics.length;
  activityMetrics.forEach((metric, index) => {
    const x = contentX + index * activityColumnWidth + 12;
    document.fillColor(REPORT_COLORS.muted).font('Helvetica-Bold').fontSize(7)
      .text(metric.label, x, activityY + 8, { width: activityColumnWidth - 24, lineBreak: false, ellipsis: true });
    document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(10)
      .text(metric.value, x, activityY + 23, { width: activityColumnWidth - 24, lineBreak: false, ellipsis: true });
  });

  const drawContributionRows = ({ heading, rows, x, y, width, color }) => {
    document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(12).text(heading, x, y);
    document.moveTo(x, y + 19).lineTo(x + width, y + 19).strokeColor(REPORT_COLORS.line).stroke();
    if (!rows.length) {
      document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(9).text('No data', x, y + 31);
      return y + 50;
    }
    rows.forEach((row, index) => {
      const rowY = y + 29 + index * 35;
      const share = Math.max(0, Math.min(1, Number(row.share) || 0));
      document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(9)
        .text(row.label, x, rowY, { width: width * 0.52, ellipsis: true });
      document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(8)
        .text(`${row.detail}  |  ${formatMoney(share * 100)}%`, x + width * 0.52, rowY, {
          width: width * 0.48,
          align: 'right',
          lineBreak: false,
          ellipsis: true
        });
      document.roundedRect(x, rowY + 14, width, 5, 2).fill(REPORT_COLORS.paper);
      if (share > 0) {
        document.roundedRect(x, rowY + 14, Math.max(3, width * share), 5, 2).fill(color);
      }
    });
    return y + 30 + rows.length * 35;
  };

  const sectionY = 400;
  const columnGap = 24;
  const columnWidth = (contentWidth - columnGap) / 2;
  const rightX = contentX + columnWidth + columnGap;
  const totalPaymentAmount = summary.paymentMethods.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paymentRows = summary.paymentMethods.slice(0, 5).map((payment) => ({
    label: getReportPaymentLabel(payment),
    detail: `MK ${formatMoney(payment.amount)}`,
    share: totalPaymentAmount > 0 ? payment.amount / totalPaymentAmount : 0
  }));
  const productRows = summary.topProducts.slice(0, 5).map((product) => ({
    label: product.name,
    detail: `${formatMoney(product.quantity)} sold  |  MK ${formatMoney(product.revenue)}`,
    share: summary.totalSales > 0 ? product.revenue / summary.totalSales : 0
  }));
  const paymentEndY = drawContributionRows({
    heading: 'Collected by method',
    rows: paymentRows,
    x: contentX,
    y: sectionY,
    width: columnWidth,
    color: REPORT_COLORS.teal
  });
  const productEndY = drawContributionRows({
    heading: 'Top products',
    rows: productRows,
    x: rightX,
    y: sectionY,
    width: columnWidth,
    color: REPORT_COLORS.amber
  });
  const categoryRows = summary.categorySales.slice(0, 4).map((category) => ({
    label: category.name,
    detail: `MK ${formatMoney(category.revenue)}`,
    share: summary.totalSales > 0 ? category.revenue / summary.totalSales : 0
  }));
  drawContributionRows({
    heading: 'Category contribution',
    rows: categoryRows,
    x: contentX,
    y: Math.max(paymentEndY, productEndY) + 15,
    width: contentWidth,
    color: REPORT_COLORS.teal
  });

  const footerY = document.page.height - 28;
  document.moveTo(contentX, footerY - 8).lineTo(contentX + contentWidth, footerY - 8).strokeColor(REPORT_COLORS.line).stroke();
  document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(7)
    .text('Daily management summary  |  Amounts in MK', contentX, footerY, { width: contentWidth });
  document.end();
});

const formatEmailHeader = (addresses) => (Array.isArray(addresses) ? addresses : [addresses])
  .filter(Boolean)
  .join(', ');

const buildRawEmail = ({ from, to, cc = [], subject, text, filename, attachment }) => {
  const boundary = `hardware-report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const encodedAttachment = attachment.toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const message = [
    `From: ${from}`,
    `To: ${formatEmailHeader(to)}`,
    ...(formatEmailHeader(cc) ? [`Cc: ${formatEmailHeader(cc)}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    encodedAttachment,
    `--${boundary}--`,
    ''
  ].join('\r\n');
  return Buffer.from(message);
};

const sendReport = async ({ recipients, from, shopName, pdf, window }) => {
  const filename = `sales-report-${window.reportDate}.pdf`;
  const rawMessage = buildRawEmail({
    from,
    ...recipients,
    subject: `Daily sales report - ${shopName} - ${window.reportDate}`,
    text: buildReportEmailText({ shopName, window }),
    filename,
    attachment: pdf
  });
  await sesClient.send(new SendRawEmailCommand({ RawMessage: { Data: rawMessage } }));
};

const sendNoSalesReminder = async ({ recipients, from, shopName, window }) => {
  const rawMessage = buildRawTextEmail({
    from,
    ...recipients,
    subject: `Help getting started with ${shopName || 'your shop'}`,
    text: buildNoSalesReminderText({ shopName, window })
  });
  await sesClient.send(new SendRawEmailCommand({ RawMessage: { Data: rawMessage } }));
};

const sendNoSalesReminderForTenant = async ({
  tenant,
  users,
  from,
  window,
  db = dynamodb,
  send = sendNoSalesReminder
}) => {
  const tenantId = String(tenant?._id || tenant?.id || '');
  if (String(tenant?.status || '').toLowerCase() !== 'active') return 'inactive';

  const recipients = getTenantReportRecipients(tenant, users);
  if (recipients.to.length === 0) return 'no-recipient';

  const attemptedAt = new Date().toISOString();
  const claimed = await db.createEntityIfAbsent('dailyReportNoSalesReminder', {
    id: tenantId,
    tenantId,
    recipients,
    reportDate: window.reportDate,
    status: 'claimed',
    attemptedAt
  });
  if (!claimed) return 'previously-attempted';

  const shopName = getShopDisplayName(tenant, users);
  await send({ recipients, from, shopName, window });
  await db.updateEntity('dailyReportNoSalesReminder', tenantId, {
    status: 'sent',
    sentAt: new Date().toISOString()
  });
  return 'sent';
};

const handler = async (event = {}) => {
  const window = getReportWindow(event.time || new Date(), event.reportDate || null);
  const from = String(process.env.SES_FROM_EMAIL || '').trim();
  if (!isValidEmail(from)) throw new Error('Set SES_FROM_EMAIL to a verified sender address.');

  const tenants = await dynamodb.listEntities('tenant');
  const selectedTenants = event.tenantId
    ? tenants.filter((tenant) => String(tenant._id || tenant.id) === String(event.tenantId))
    : tenants;
  if (event.tenantId && selectedTenants.length === 0) throw new Error(`Tenant not found: ${event.tenantId}`);

  const users = await dynamodb.listEntities('user', { projection: ['_id', 'id', 'tenantId', 'role', 'isActive', 'email', 'fullName', 'username'] });
    const results = {
      reportDate: window.reportDate,
      sent: 0,
      noSalesRemindersSent: 0,
      noSalesRemindersPreviouslyAttempted: 0,
      skipped: 0,
      failed: []
    };
  let legacyOrders = null;
  let catalogRecords = null;
  for (const tenant of selectedTenants) {
    const tenantId = String(tenant._id || tenant.id);
    if (['suspended', 'deleted'].includes(String(tenant.status || '').toLowerCase())) {
      results.skipped += 1;
      continue;
    }

    try {
      if (!legacyOrders) {
        legacyOrders = await dynamodb.listEntities('order', {
          projection: [
            '_id', 'id', 'tenantId', 'orderNumber', 'customerName', 'items', 'totalAmount',
            'taxAmount', 'netAmount', 'profit', 'paymentMethod', 'createdAt', 'status',
            'taxCompliant', 'paidAmount', 'customer'
          ]
        });
      }
      const orders = await collectTenantOrders(tenantId, window, legacyOrders);
      if (orders.length === 0) {
        results.skipped += 1;
        const reminderResult = await sendNoSalesReminderForTenant({ tenant, users, from, window });
        if (reminderResult === 'sent') {
          results.noSalesRemindersSent += 1;
          console.info('One-time no-sales reminder sent', { tenantId, reportDate: window.reportDate });
        } else if (reminderResult === 'previously-attempted') {
          results.noSalesRemindersPreviouslyAttempted += 1;
          console.info('No-sales reminder already attempted; skipped tenant', tenantId);
        } else {
          console.info(`No-sales reminder not sent (${reminderResult}); skipped tenant`, tenantId);
        }
        continue;
      }
      const recipients = getTenantReportRecipients(tenant, users);
      if (recipients.to.length === 0) {
        results.skipped += 1;
        console.warn('Skipped tenant with no valid daily report recipient', tenantId);
        continue;
      }
      if (!catalogRecords) {
        const [products, categories] = await Promise.all([
          dynamodb.listEntities('product', { projection: ['_id', 'id', 'tenantId', 'name', 'category', 'costPrice'] }),
          dynamodb.listEntities('category', { projection: ['_id', 'id', 'tenantId', 'name'] })
        ]);
        catalogRecords = { products, categories };
      }
      const lookups = buildReportLookupMaps(tenantId, orders, catalogRecords.products, catalogRecords.categories);
      const shopName = getShopDisplayName(tenant, users);
      const pdf = await createSalesPdf({ shopName, orders, window, ...lookups });
      await sendReport({ recipients, from, shopName, pdf, window });
      results.sent += 1;
      console.info('Daily sales report sent', { tenantId, reportDate: window.reportDate });
    } catch (error) {
      results.failed.push(tenantId);
      console.error('Daily sales report failed for tenant', tenantId, error);
    }
  }

  if (results.failed.length > 0) console.error('Daily sales report has tenants requiring targeted retry', results);
  return results;
};

module.exports = {
  handler,
  getReportWindow,
  getTenantReportRecipients,
  getShopDisplayName,
  buildReportLookupMaps,
  buildReportActivityMetrics,
  getReportPaymentLabel,
  buildReportEmailText,
  buildNoSalesReminderText,
  buildRawTextEmail,
  sendNoSalesReminderForTenant,
  collectTenantOrders,
  createSalesPdf,
  buildRawEmail,
  isValidEmail
};