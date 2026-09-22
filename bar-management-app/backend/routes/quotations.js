const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const dynamodb = require('../lib/dynamodb');
const Customer = require('../models/Customer');
const { protect } = require('../middleware/auth');

const toMoney = (value) => Number(value || 0);
const formatPdfMoney = (value) => `MK ${toMoney(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;
const sanitizeQuotePayload = (payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items.map((item) => ({
    id: item?.id || item?.productId || `${Date.now()}-${Math.random()}`,
    productId: item?.productId || '',
    name: String(item?.name || 'Untitled item').trim(),
    qty: Number(item?.qty || 0),
    unitPrice: Number(item?.unitPrice || 0)
  })) : [];

  return {
    quoteNumber: String(payload.quoteNumber || `QT-${Date.now()}`),
    issueDate: payload.issueDate || new Date().toISOString().slice(0, 10),
    validUntil: payload.validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    customerId: payload.customerId || '',
    customerName: String(payload.customerName || 'Walk-in Customer').trim(),
    customerPhone: String(payload.customerPhone || '').trim(),
    customerEmail: String(payload.customerEmail || '').trim(),
    customerAddress: String(payload.customerAddress || '').trim(),
    notes: String(payload.notes || '').trim(),
    taxRate: Number(payload.taxRate || 0),
    businessName: String(payload.businessName || 'Smart Inventory App').trim(),
    businessAddress: String(payload.businessAddress || '').trim(),
    businessPhone: String(payload.businessPhone || '').trim(),
    businessEmail: String(payload.businessEmail || '').trim(),
    status: String(payload.status || 'draft').trim(),
    items,
    subtotal: items.reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)), 0),
    taxAmount: 0,
    total: 0,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tenantId: payload.tenantId || null
  };
};

const finalizeQuoteTotals = (quote) => {
  const subtotal = (quote.items || []).reduce((sum, item) => sum + ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)), 0);
  const taxRate = Number(quote.taxRate || 0);
  const taxAmount = subtotal * (taxRate / 100);
  return {
    ...quote,
    subtotal,
    taxAmount,
    total: subtotal + taxAmount
  };
};

const findEntityById = async (id) => dynamodb.getEntity('quotation', id);

const ensureTenantAccess = (req, quote) => {
  if (!quote) return false;
  if (!req.user?.tenantId) return true;
  return quote.tenantId === req.user.tenantId || !quote.tenantId;
};

const buildQuoteMessage = (quote, channel = 'email') => {
  const itemsText = (quote.items || []).map((item) => {
    const itemName = item.name || 'Item';
    const qty = Number(item.qty || 0);
    const unit = Number(item.unitPrice || 0);
    return `- ${itemName} x${qty} @ ${toMoney(unit).toLocaleString()} = ${toMoney(qty * unit).toLocaleString()}`;
  }).join('\n');

  const subtotal = toMoney(quote.subtotal || 0);
  const taxAmount = toMoney(quote.taxAmount || 0);
  const total = toMoney(quote.total || 0);

  if (channel === 'whatsapp') {
    return {
      subject: `Quotation ${quote.quoteNumber}`,
      body: [
        `Hello ${quote.customerName || 'Customer'},`,
        '',
        `Thank you for your interest. Here is our quotation ${quote.quoteNumber}.`,
        '',
        itemsText || '- No items selected',
        '',
        `Subtotal: ${subtotal.toLocaleString()}`,
        `Tax: ${taxAmount.toLocaleString()}`,
        `Total: ${total.toLocaleString()}`,
        '',
        `Valid until: ${quote.validUntil || 'N/A'}`,
        '',
        `Regards, ${quote.businessName || 'Smart Inventory App'}`
      ].join('\n')
    };
  }

  return {
    subject: `Quotation ${quote.quoteNumber} from ${quote.businessName || 'Smart Inventory App'}`,
    body: [
      `Dear ${quote.customerName || 'Customer'},`,
      '',
      `Please find attached our quotation ${quote.quoteNumber}.`,
      '',
      itemsText || '- No items selected',
      '',
      `Subtotal: ${subtotal.toLocaleString()}`,
      `Tax: ${taxAmount.toLocaleString()}`,
      `Total: ${total.toLocaleString()}`,
      '',
      `Valid until: ${quote.validUntil || 'N/A'}`,
      '',
      `Best regards,`,
      quote.businessName || 'Smart Inventory App',
      quote.businessAddress || '',
      quote.businessPhone || '',
      quote.businessEmail || ''
    ].filter((line) => line !== '').join('\n')
  };
};

const buildPdf = (quote) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];
  const pageWidth = 595.28;
  const leftMargin = 50;
  const contentWidth = pageWidth - (leftMargin * 2);
  const headerCardWidth = 215;
  const headerCardHeight = 116;
  const headerCardX = leftMargin + contentWidth - headerCardWidth;
  const headerCardY = 50;

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('error', reject);
  doc.on('end', () => {
    try {
      resolve(Buffer.concat(chunks));
    } catch (error) {
      reject(error);
    }
  });

  doc.fontSize(24).fillColor('#111827').font('Helvetica-Bold').text(quote.businessName || 'Smart Inventory App', leftMargin, headerCardY, { width: 250 });
  doc.moveDown(0.4);
  let businessY = 84;
  doc.font('Helvetica').fontSize(10);
  if (quote.businessAddress) {
    doc.text(quote.businessAddress, leftMargin, businessY, { width: 250 });
    businessY += 15;
  }
  if (quote.businessPhone) {
    doc.text(quote.businessPhone, leftMargin, businessY, { width: 250 });
    businessY += 15;
  }
  if (quote.businessEmail) doc.text(quote.businessEmail, leftMargin, businessY, { width: 250 });

  doc.roundedRect(headerCardX, headerCardY, headerCardWidth, headerCardHeight, 10).fill('#111827');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('QUOTE/INV', headerCardX + 16, headerCardY + 14, { width: headerCardWidth - 32 });
  doc.font('Helvetica').fontSize(10);
  doc.text(`Quote #: ${quote.quoteNumber || 'N/A'}`, headerCardX + 16, headerCardY + 52, { width: headerCardWidth - 32 });
  doc.text(`Issue Date: ${quote.issueDate || 'N/A'}`, headerCardX + 16, headerCardY + 68, { width: headerCardWidth - 32 });
  doc.text(`Valid Until: ${quote.validUntil || 'N/A'}`, headerCardX + 16, headerCardY + 84, { width: headerCardWidth - 32 });

  doc.fillColor('#111827').font('Helvetica').fontSize(12);
  doc.y = headerCardY + headerCardHeight + 22;
  doc.fontSize(12).text(`Customer: ${quote.customerName || 'Walk-in Customer'}`);
  if (quote.customerPhone) doc.text(`Phone: ${quote.customerPhone}`);
  if (quote.customerEmail) doc.text(`Email: ${quote.customerEmail}`);
  if (quote.customerAddress) doc.text(`Address: ${quote.customerAddress}`);

  doc.moveDown();
  const tableTop = doc.y;
  const itemWidth = 260;
  const qtyWidth = 50;
  const rateWidth = 80;
  const amountWidth = 90;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Item', 50, tableTop, { width: itemWidth, align: 'left' });
  doc.text('Qty', 310, tableTop, { width: qtyWidth, align: 'center' });
  doc.text('Rate', 360, tableTop, { width: rateWidth, align: 'right' });
  doc.text('Amount', 440, tableTop, { width: amountWidth, align: 'right' });
  doc.moveDown(1.2);
  doc.font('Helvetica');

  let y = doc.y;
  for (const item of (quote.items || [])) {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }

    const itemName = String(item.name || 'Untitled item');
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const amount = qty * unitPrice;

    doc.text(itemName, 50, y, { width: itemWidth, align: 'left' });
    doc.text(String(qty), 310, y, { width: qtyWidth, align: 'center' });
    doc.text(formatPdfMoney(unitPrice), 360, y, { width: rateWidth, align: 'right' });
    doc.text(formatPdfMoney(amount), 440, y, { width: amountWidth, align: 'right' });
    y += 20;
  }

  doc.moveDown(2);
  const subtotal = toMoney(quote.subtotal || 0);
  const taxAmount = toMoney(quote.taxAmount || 0);
  const total = toMoney(quote.total || 0);
  const summaryLabelX = 310;
  const summaryLabelWidth = 130;
  const summaryAmountX = 440;

  doc.font('Helvetica-Bold');
  doc.text('Subtotal', summaryLabelX, y, { width: summaryLabelWidth, align: 'right' });
  doc.text(formatPdfMoney(subtotal), summaryAmountX, y, { width: amountWidth, align: 'right' });
  y += 18;
  doc.text(`Tax (${quote.taxRate || 0}%)`, summaryLabelX, y, { width: summaryLabelWidth, align: 'right' });
  doc.text(formatPdfMoney(taxAmount), summaryAmountX, y, { width: amountWidth, align: 'right' });
  y += 22;
  doc.fontSize(14).text('Total', summaryLabelX, y, { width: summaryLabelWidth, align: 'right' });
  doc.text(formatPdfMoney(total), summaryAmountX, y, { width: amountWidth, align: 'right' });

  doc.moveDown(3);
  if (quote.notes) {
    doc.fontSize(10).text('Notes:', { underline: true });
    doc.text(quote.notes, { width: 450 });
  }

  doc.moveDown(3);
  doc.fontSize(10).font('Helvetica');
  doc.text('Director');
  doc.moveDown(2.5);
  doc.text('________________________________________');
  doc.text('Signature');

  doc.end();
});

router.get('/', protect, async (req, res) => {
  try {
    const allQuotes = await dynamodb.listEntities('quotation');
    const tenantQuoted = allQuotes.filter((quote) => !req.user?.tenantId || quote.tenantId === req.user.tenantId || !quote.tenantId);
    tenantQuoted.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json(tenantQuoted);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const quote = await findEntityById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quotation not found' });
    if (!ensureTenantAccess(req, quote)) return res.status(403).json({ message: 'Access denied' });
    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    const payload = sanitizeQuotePayload({
      ...req.body,
      tenantId: req.user?.tenantId || null
    });

    const quote = finalizeQuoteTotals(payload);
    const inserted = await dynamodb.createEntity('quotation', quote);
    res.status(201).json(inserted);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const existing = await findEntityById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Quotation not found' });
    if (!ensureTenantAccess(req, existing)) return res.status(403).json({ message: 'Access denied' });

    const payload = sanitizeQuotePayload({
      ...existing,
      ...req.body,
      tenantId: existing.tenantId || req.user?.tenantId || null,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const updated = finalizeQuoteTotals(payload);
    const record = await dynamodb.updateEntity('quotation', req.params.id, updated);
    res.json(record);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/:id/pdf', protect, async (req, res) => {
  try {
    const quote = await findEntityById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quotation not found' });
    if (!ensureTenantAccess(req, quote)) return res.status(403).json({ message: 'Access denied' });

    const pdfBuffer = await buildPdf(finalizeQuoteTotals(quote));
    const filename = `quotation-${quote.quoteNumber || 'draft'}.pdf`;
    res.status(200).set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'no-store'
    }).send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/send', protect, async (req, res) => {
  try {
    const quote = await findEntityById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quotation not found' });
    if (!ensureTenantAccess(req, quote)) return res.status(403).json({ message: 'Access denied' });

    const finalized = finalizeQuoteTotals(quote);
    const channel = String(req.body?.channel || 'email').toLowerCase();
    const customerId = req.body?.customerId || finalized.customerId;

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId, req);
    }

    const payload = {
      ...finalized,
      customerName: finalized.customerName || customer?.name || 'Customer',
      customerPhone: finalized.customerPhone || customer?.phone || '',
      customerEmail: finalized.customerEmail || customer?.email || '',
      customerAddress: finalized.customerAddress || customer?.address || ''
    };

    const message = buildQuoteMessage(payload, channel);

    if (channel === 'whatsapp') {
      const phone = String(payload.customerPhone || '').replace(/\D/g, '');
      const whatsappUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message.body)}`
        : `https://wa.me/?text=${encodeURIComponent(message.body)}`;

      return res.json({
        channel: 'whatsapp',
        phone,
        template: message.body,
        url: whatsappUrl,
        subject: message.subject
      });
    }

    const emailAddress = payload.customerEmail || '';
    const mailto = emailAddress
      ? `mailto:${emailAddress}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`
      : `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;

    return res.json({
      channel: 'email',
      email: emailAddress,
      template: message.body,
      subject: message.subject,
      url: mailto
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const existing = await findEntityById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Quotation not found' });
    if (!ensureTenantAccess(req, existing)) return res.status(403).json({ message: 'Access denied' });

    const deleted = await dynamodb.deleteEntity('quotation', req.params.id);
    res.json({ message: 'Quotation deleted', deleted });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
