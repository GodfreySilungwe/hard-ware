const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const dynamodb = require('../lib/dynamodb');
const Customer = require('../models/Customer');
const { protect } = require('../middleware/auth');
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const bucketName = 'hardwaresamplefiles3bucket';

const toMoney = (value) => Number(value || 0);
const formatPdfMoney = (value) => `MK ${toMoney(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;
const formatDigitalSignature = (name) => {
  const nameParts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) return nameParts[0] || '';
  return `${Array.from(nameParts[0])[0].toUpperCase()}.${nameParts[nameParts.length - 1]}`;
};
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
    hardwareManagerName: String(payload.hardwareManagerName || '').trim(),
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

const getBusinessLogoBuffer = async (settings, user, tenant) => {
  if (!settings?.logoKey) return null;
  const accountId = String(tenant?._id || tenant?.id || user?._id || user?.id || '');
  if (!accountId || !settings.logoKey.startsWith(`business-logos/${accountId}/`)) {
    throw new Error('Saved business logo key is invalid for this account.');
  }

  const response = await s3Client.send(new GetObjectCommand({
    Bucket: bucketName,
    Key: settings.logoKey
  }));
  if (!response.Body) throw new Error('Saved business logo could not be loaded.');
  return Buffer.from(await response.Body.transformToByteArray());
};

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
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];
  const pageWidth = 595.28;
  const leftMargin = 48;
  const contentWidth = pageWidth - (leftMargin * 2);
  const rightEdge = leftMargin + contentWidth;
  const footerY = 790;
  const colors = {
    navy: '#172554',
    teal: '#0F766E',
    ink: '#1F2937',
    muted: '#64748B',
    line: '#E2E8F0',
    panel: '#F8FAFC',
    white: '#FFFFFF'
  };
  let y = 0;

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('error', reject);
  doc.on('end', () => {
    try {
      resolve(Buffer.concat(chunks));
    } catch (error) {
      reject(error);
    }
  });

  const drawFooter = () => {
    doc.save();
    doc.strokeColor(colors.line).lineWidth(0.7)
      .moveTo(leftMargin, footerY).lineTo(rightEdge, footerY).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
      .text(`Quotation ${quote.quoteNumber || ''}`, leftMargin, footerY + 9, { width: contentWidth });
    doc.restore();
  };

  const drawTableHeader = (top) => {
    const columns = [
      { label: 'ITEM', x: leftMargin + 12, width: 228, align: 'left' },
      { label: 'QTY', x: leftMargin + 250, width: 54, align: 'center' },
      { label: 'UNIT PRICE', x: leftMargin + 310, width: 88, align: 'right' },
      { label: 'AMOUNT', x: leftMargin + 405, width: 82, align: 'right' }
    ];
    doc.save();
    doc.roundedRect(leftMargin, top, contentWidth, 32, 6).fill(colors.navy);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.white);
    columns.forEach((column) => {
      doc.text(column.label, column.x, top + 11, { width: column.width, align: column.align });
    });
    doc.restore();
    return top + 38;
  };

  const startContinuationPage = () => {
    drawFooter();
    doc.addPage();
    doc.save();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.navy)
      .text('QUOTATION - CONTINUED', leftMargin, 40, { width: contentWidth });
    doc.restore();
    y = drawTableHeader(60);
  };

  const businessName = quote.businessName || 'Smart Inventory App';
  const businessColumnWidth = 276;
  const headerCardWidth = contentWidth - businessColumnWidth - 18;
  const headerCardX = leftMargin + businessColumnWidth + 18;
  const headerCardY = 48;
  const headerCardHeight = 122;
  if (quote.businessLogo) {
    let logoBuffer = quote.businessLogo;
    if (!Buffer.isBuffer(logoBuffer)) {
      const logoMatch = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(quote.businessLogo);
      if (!logoMatch) throw new Error('Business logo must be a PNG or JPEG image.');
      logoBuffer = Buffer.from(logoMatch[2], 'base64');
    }
    if (logoBuffer.length > 200 * 1024) throw new Error('Business logo must be 200 KB or smaller.');
    const hasPngSignature = logoBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const hasJpegSignature = logoBuffer[0] === 0xff && logoBuffer[1] === 0xd8 && logoBuffer[2] === 0xff;
    if (!hasPngSignature && !hasJpegSignature) {
      throw new Error('The saved business logo image is invalid.');
    }
    doc.image(logoBuffer, leftMargin + (businessColumnWidth - 76) / 2, headerCardY, { fit: [76, 56] });
  }

  doc.save();
  doc.roundedRect(leftMargin, 32, contentWidth, 4, 2).fill(colors.teal);
  doc.roundedRect(headerCardX, headerCardY, headerCardWidth, headerCardHeight, 10).fill(colors.navy);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.ink)
    .text(businessName, leftMargin, quote.businessLogo ? 110 : 58, {
      width: businessColumnWidth,
      align: 'center'
    });
  let businessY = doc.y + 5;
  doc.font('Helvetica').fontSize(8.5).fillColor(colors.muted);
  [quote.businessAddress, quote.businessPhone, quote.businessEmail]
    .filter(Boolean)
    .forEach((detail) => {
      doc.text(String(detail), leftMargin + 5, businessY, {
        width: businessColumnWidth - 10,
        align: 'center'
      });
      businessY = doc.y + 2;
    });

  doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.white)
    .text('QUOTATION', headerCardX + 16, headerCardY + 15, { width: headerCardWidth - 32 });
  doc.font('Helvetica').fontSize(9).fillColor('#DBEAFE');
  doc.text(`Quote number  ${quote.quoteNumber || 'N/A'}`, headerCardX + 16, headerCardY + 49, { width: headerCardWidth - 32 });
  doc.text(`Issued  ${quote.issueDate || 'N/A'}`, headerCardX + 16, headerCardY + 68, { width: headerCardWidth - 32 });
  doc.text(`Valid until  ${quote.validUntil || 'N/A'}`, headerCardX + 16, headerCardY + 87, { width: headerCardWidth - 32 });
  doc.restore();

  y = Math.max(headerCardY + headerCardHeight, businessY) + 22;
  const customerTextX = leftMargin + 16;
  const customerTextWidth = contentWidth - 32;
  const customerName = quote.customerName || 'Walk-in Customer';
  const customerContact = [
    quote.customerPhone && `Phone: ${quote.customerPhone}`,
    quote.customerEmail && `Email: ${quote.customerEmail}`
  ].filter(Boolean).join('   |   ');
  const customerAddress = quote.customerAddress ? `Address: ${quote.customerAddress}` : '';
  doc.font('Helvetica').fontSize(9).fillColor(colors.ink);
  const contactHeight = customerContact
    ? doc.heightOfString(customerContact, { width: customerTextWidth })
    : 0;
  const addressHeight = customerAddress
    ? doc.heightOfString(customerAddress, { width: customerTextWidth })
    : 0;
  const customerCardHeight = 58 + contactHeight + addressHeight;
  doc.save();
  doc.roundedRect(leftMargin, y, contentWidth, customerCardHeight, 8)
    .fillAndStroke(colors.panel, colors.line);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.teal)
    .text('PREPARED FOR', customerTextX, y + 12, { width: customerTextWidth });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.ink)
    .text(customerName, customerTextX, y + 26, { width: customerTextWidth });
  let customerY = y + 45;
  doc.font('Helvetica').fontSize(9).fillColor(colors.muted);
  if (customerContact) {
    doc.text(customerContact, customerTextX, customerY, { width: customerTextWidth });
    customerY = doc.y + 3;
  }
  if (customerAddress) {
    doc.text(customerAddress, customerTextX, customerY, { width: customerTextWidth });
  }
  doc.restore();

  y += customerCardHeight + 20;
  y = drawTableHeader(y);
  const itemX = leftMargin + 12;
  const itemWidth = 228;
  const qtyX = leftMargin + 250;
  const qtyWidth = 54;
  const rateX = leftMargin + 310;
  const rateWidth = 88;
  const amountX = leftMargin + 405;
  const amountWidth = 82;
  let rowIndex = 0;
  for (const item of (quote.items || [])) {
    const itemName = String(item.name || 'Untitled item');
    const itemHeight = doc.heightOfString(itemName, { width: itemWidth, font: 'Helvetica', fontSize: 9.5 });
    const rowHeight = Math.max(30, itemHeight + 14);
    if (y + rowHeight > footerY - 12) startContinuationPage();
    if (rowIndex % 2 === 1) {
      doc.save();
      doc.rect(leftMargin, y, contentWidth, rowHeight).fill(colors.panel);
      doc.restore();
    }

    doc.save();
    doc.font('Helvetica').fontSize(9.5).fillColor(colors.ink);
    doc.text(itemName, itemX, y + 7, { width: itemWidth });
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const amount = qty * unitPrice;
    doc.fontSize(9).fillColor(colors.muted);
    doc.text(String(qty), qtyX, y + 9, { width: qtyWidth, align: 'center' });
    doc.text(formatPdfMoney(unitPrice), rateX, y + 9, { width: rateWidth, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(colors.ink)
      .text(formatPdfMoney(amount), amountX, y + 9, { width: amountWidth, align: 'right' });
    doc.strokeColor(colors.line).lineWidth(0.5)
      .moveTo(leftMargin, y + rowHeight).lineTo(rightEdge, y + rowHeight).stroke();
    doc.restore();
    y += rowHeight;
    rowIndex += 1;
  }

  const summaryHeight = 104;
  if (y + summaryHeight + 22 > footerY - 12) startContinuationPage();
  y += 18;
  const subtotal = toMoney(quote.subtotal || 0);
  const taxAmount = toMoney(quote.taxAmount || 0);
  const total = toMoney(quote.total || 0);
  const summaryWidth = 245;
  const summaryX = rightEdge - summaryWidth;
  doc.save();
  doc.roundedRect(summaryX, y, summaryWidth, summaryHeight, 8)
    .fillAndStroke(colors.panel, colors.line);
  doc.font('Helvetica').fontSize(9).fillColor(colors.muted)
    .text('Subtotal', summaryX + 14, y + 14, { width: 110 });
  doc.text(formatPdfMoney(subtotal), summaryX + 125, y + 14, { width: 106, align: 'right' });
  doc.text(`Tax (${quote.taxRate || 0}%)`, summaryX + 14, y + 34, { width: 110 });
  doc.text(formatPdfMoney(taxAmount), summaryX + 125, y + 34, { width: 106, align: 'right' });
  doc.strokeColor(colors.line).lineWidth(0.7)
    .moveTo(summaryX + 14, y + 58).lineTo(summaryX + summaryWidth - 14, y + 58).stroke();
  doc.roundedRect(summaryX + 10, y + 66, summaryWidth - 20, 29, 5).fill(colors.navy);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.white)
    .text('TOTAL', summaryX + 20, y + 75, { width: 85 });
  doc.text(formatPdfMoney(total), summaryX + 105, y + 75, { width: summaryWidth - 40, align: 'right' });
  doc.restore();
  y += summaryHeight + 20;

  if (quote.notes) {
    doc.font('Helvetica').fontSize(9).fillColor(colors.ink);
    const notesHeight = doc.heightOfString(String(quote.notes), { width: contentWidth - 28 }) + 48;
    if (y + notesHeight + 75 > footerY - 10) startContinuationPage();
    const notesTextY = y + 30;
    doc.save();
    doc.roundedRect(leftMargin, y, contentWidth, notesHeight, 8)
      .fillAndStroke(colors.panel, colors.line);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.teal)
      .text('NOTES', leftMargin + 14, y + 12, { width: contentWidth - 28 });
    doc.font('Helvetica').fontSize(9).fillColor(colors.ink)
      .text(String(quote.notes), leftMargin + 14, notesTextY, { width: contentWidth - 28 });
    doc.restore();
    y += notesHeight + 20;
  }

  if (y + 80 > footerY - 10) startContinuationPage();
  doc.save();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.muted)
    .text('AUTHORIZED BY', leftMargin, y + 4, { width: 180 });
  if (quote.hardwareManagerName) {
    doc.font('Helvetica').fontSize(9).fillColor(colors.ink)
      .text(formatDigitalSignature(quote.hardwareManagerName), leftMargin, y + 20, { width: 180 });
  }
  doc.strokeColor(colors.muted).lineWidth(0.7)
    .moveTo(leftMargin, y + 54).lineTo(leftMargin + 180, y + 54).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
    .text('Signature', leftMargin, y + 60, { width: 180 });
  doc.restore();
  drawFooter();
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

    const savedSettings = req.tenant?.businessSettings || req.user?.businessSettings;
    const businessLogo = savedSettings
      ? await getBusinessLogoBuffer(savedSettings, req.user, req.tenant)
      : null;
    const pdfBuffer = await buildPdf(finalizeQuoteTotals({
      ...quote,
      businessName: savedSettings
        ? savedSettings.name || req.tenant?.shopName || req.user?.shopName || 'Smart Inventory App'
        : req.tenant?.shopName || quote.businessName || 'Smart Inventory App',
      businessAddress: savedSettings ? savedSettings.address || '' : quote.businessAddress || '',
      businessPhone: savedSettings ? savedSettings.phone || '' : quote.businessPhone || '',
      businessEmail: savedSettings ? savedSettings.email || '' : quote.businessEmail || '',
      businessLogo,
      hardwareManagerName: quote.hardwareManagerName || req.user?.fullName || ''
    }));
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
