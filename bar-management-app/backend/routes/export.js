const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { protect } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const dynamodb = require('../lib/dynamodb');

const MAX_EXPORT_ROWS = Math.max(1, Number(process.env.MAX_EXPORT_ROWS || 10000));

// Helper function to format date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatMoney = (value, includeCurrency = false) => {
  const amount = Number(value || 0);
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
  return includeCurrency ? `MK ${formatted}` : formatted;
};

const formatPdfDate = (date) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatReportPeriod = (filters) => {
  const formatPeriodDate = (value) => {
    if (!value) return 'All available dates';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? 'All available dates'
      : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!filters.startDate && !filters.endDate) return 'Period covered: All available dates';
  return `Period covered: ${formatPeriodDate(filters.startDate)} - ${formatPeriodDate(filters.endDate)}`;
};

const getReferenceId = (reference) => String(reference?._id || reference?.id || reference || '');
const getOrderKey = (order) => getReferenceId(order) || String(order?.orderNumber || `${order?.createdAt || ''}-${order?.totalAmount || ''}`);

const parseExportFilters = (req) => ({
  startDate: req.query.startDateUtc || null,
  endDate: req.query.endDateUtc || null,
  status: req.query.status || null,
  paymentMethod: req.query.paymentMethod || null,
  customerName: req.query.customerName || null,
  productName: req.query.productName || null
});

const matchesDateRange = (value, startDate, endDate) => {
  const createdAt = String(value || '');
  return (!startDate || createdAt >= startDate) && (!endDate || createdAt <= endDate);
};

const getOrdersForExport = async (req) => {
  const filters = parseExportFilters(req);
  const projection = [
    '_id', 'id', 'tenantId', 'orderNumber', 'customer', 'customerName',
    'taxCompliant', 'items', 'totalAmount', 'taxAmount', 'netAmount',
    'profit', 'paymentMethod', 'createdAt', 'status'
  ];
  let orders;

  if (req.user?.tenantId && (filters.startDate || filters.endDate)) {
    try {
      const gsiOrders = await dynamodb.queryByGSI(req.user.tenantId, filters.startDate, filters.endDate, { projection });
      const legacyOrders = await dynamodb.listEntities('order', { projection });
      orders = [...gsiOrders, ...legacyOrders];
    } catch (error) {
      console.warn(`Export GSI query failed, using legacy order read: ${error.message}`);
      orders = await dynamodb.listEntities('order', { projection });
    }
  } else {
    orders = await dynamodb.listEntities('order', { projection });
  }

  const customerIds = new Set();
  const productIds = new Set();
  const tenantId = req.user?.tenantId;
  const scopedOrders = [...new Map(orders.map((order) => [getOrderKey(order), order])).values()].filter((order) => {
    if (tenantId && order.tenantId !== tenantId) return false;
    if (!matchesDateRange(order.createdAt, filters.startDate, filters.endDate)) return false;
    if (!filters.status && order.status === 'reversed') return false;
    if (filters.status && order.status !== filters.status) return false;
    if (filters.paymentMethod && String(order.paymentMethod || '').toLowerCase() !== String(filters.paymentMethod).toLowerCase()) return false;

    const customerId = getReferenceId(order.customer);
    if (customerId) customerIds.add(customerId);
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      const productId = getReferenceId(item.product);
      if (productId) productIds.add(productId);
    }
    return true;
  });

  const [customers, products] = await Promise.all([
    customerIds.size || filters.customerName ? dynamodb.listEntities('customer', { projection: ['_id', 'id', 'tenantId', 'name', 'phone'] }) : [],
    productIds.size || filters.productName
      ? dynamodb.listEntities('product', { projection: ['_id', 'id', 'tenantId', 'name'] })
      : []
  ]);
  const customerMap = new Map(customers.filter((customer) => !tenantId || customer.tenantId === tenantId).map((customer) => [getReferenceId(customer), customer]));
  const productMap = new Map(products.filter((product) => !tenantId || product.tenantId === tenantId).map((product) => [getReferenceId(product), product]));

  const filteredOrders = scopedOrders.filter((order) => {
    if (filters.customerName) {
      const customerName = customerMap.get(getReferenceId(order.customer))?.name || order.customer?.name || order.customerName || '';
      if (String(customerName).toLowerCase() !== String(filters.customerName).toLowerCase()) return false;
    }
    if (!filters.productName) return true;
    return (Array.isArray(order.items) ? order.items : []).some((item) => {
      const product = productMap.get(getReferenceId(item.product));
      return String(product?.name || item.product?.name || item.name || '').toLowerCase() === String(filters.productName).toLowerCase();
    });
  });

  if (filteredOrders.length > MAX_EXPORT_ROWS) {
    const error = new Error(`Export exceeds the maximum of ${MAX_EXPORT_ROWS.toLocaleString()} rows`);
    error.statusCode = 413;
    throw error;
  }

  return { orders: filteredOrders, customerMap, filters };
};

// Test route
router.get('/test', protect, (req, res) => {
  res.json({ message: 'Export routes are working!' });
});

// Export Sales Report as Excel
router.get('/sales/excel', protect, async (req, res) => {
  try {
    const { orders, customerMap, filters } = await getOrdersForExport(req);
    orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const worksheet = workbook.addWorksheet('Sales Report');

    // Headers
    worksheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 20 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Tax Compliant', key: 'taxCompliant', width: 15 },
      { header: 'Items', key: 'items', width: 15 },
      { header: 'Total Amount (MK)', key: 'totalAmount', width: 18 },
      { header: 'Tax (MK)', key: 'taxAmount', width: 14 },
      { header: 'Net Amount (MK)', key: 'netAmount', width: 18 },
      { header: 'Profit (MK)', key: 'profit', width: 16 },
      { header: 'Payment Method', key: 'paymentMethod', width: 16 },
      { header: 'Date', key: 'date', width: 25 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE94560' }
    };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.commit();

    // Add data rows with formatted date
    orders.forEach(order => {
      worksheet.addRow({
        orderNumber: order.orderNumber,
        customer: customerMap.get(getReferenceId(order.customer))?.name || order.customer?.name || order.customerName || 'Walk-in',
        taxCompliant: order.taxCompliant ? 'Yes' : 'No',
        items: Array.isArray(order.items) ? order.items.length : 0,
        totalAmount: formatMoney(order.totalAmount),
        taxAmount: formatMoney(order.taxAmount || 0),
        netAmount: formatMoney(Number.isFinite(Number(order.netAmount)) ? order.netAmount : order.totalAmount),
        profit: formatMoney(order.profit),
        paymentMethod: (order.paymentMethod || '').replace('_', ' '),
        date: formatDate(order.createdAt)
      }).commit();
    });

    // Add totals row
    const totalSales = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const totalTax = orders.reduce((sum, o) => sum + (Number(o.taxAmount) || 0), 0);
    const totalNet = orders.reduce((sum, o) => sum + (Number.isFinite(Number(o.netAmount)) ? Number(o.netAmount) : Number(o.totalAmount)), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (Number(o.profit) || 0), 0);
    
    const totalsRow = worksheet.addRow({
      orderNumber: 'TOTALS',
      customer: '',
      items: orders.length,
      totalAmount: formatMoney(totalSales),
      taxAmount: formatMoney(totalTax),
      netAmount: formatMoney(totalNet),
      profit: formatMoney(totalProfit),
      paymentMethod: '',
      date: ''
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };
    totalsRow.commit();

    const periodRow = worksheet.addRow({
      orderNumber: 'PERIOD COVERED',
      customer: formatReportPeriod(filters)
    });
    periodRow.font = { italic: true, color: { argb: 'FF475569' } };
    periodRow.commit();

    await workbook.commit();
  } catch (error) {
    console.error('Export error:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Export Inventory Report as Excel
router.get('/inventory/excel', protect, async (req, res) => {
  try {
    const products = await dynamodb.listEntities('product', { projection: ['_id', 'id', 'tenantId', 'name', 'category', 'costPrice', 'sellingPrice', 'currentStock', 'lowStockThreshold'] });
    const scopedProducts = products.filter((product) => !req.user?.tenantId || product.tenantId === req.user.tenantId);
    const categoryIds = new Set(scopedProducts
      .map((product) => getReferenceId(product.category))
      .filter(Boolean));
    const categories = categoryIds.size
      ? await dynamodb.listEntities('category', { projection: ['_id', 'id', 'tenantId', 'name'] })
      : [];
    const categoryMap = new Map(categories
      .filter((category) => !req.user?.tenantId || category.tenantId === req.user.tenantId)
      .map((category) => [getReferenceId(category), category.name]));
    if (scopedProducts.length > MAX_EXPORT_ROWS) throw Object.assign(new Error(`Export exceeds the maximum of ${MAX_EXPORT_ROWS.toLocaleString()} rows`), { statusCode: 413 });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory_report.xlsx');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const worksheet = workbook.addWorksheet('Inventory Report');

    worksheet.columns = [
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Cost Price (MK)', key: 'costPrice', width: 18 },
      { header: 'Selling Price (MK)', key: 'sellingPrice', width: 18 },
      { header: 'Current Stock', key: 'currentStock', width: 15 },
      { header: 'Low Stock Threshold', key: 'threshold', width: 20 },
      { header: 'Status', key: 'status', width: 18 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3498DB' }
    };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.commit();

    scopedProducts.forEach(product => {
      const status = product.currentStock <= product.lowStockThreshold ? '⚠️ Low Stock' : '✅ In Stock';
      worksheet.addRow({
        name: product.name,
        category: product.category?.name || categoryMap.get(getReferenceId(product.category)) || 'Uncategorized',
        costPrice: formatMoney(product.costPrice),
        sellingPrice: formatMoney(product.sellingPrice),
        currentStock: product.currentStock,
        threshold: product.lowStockThreshold,
        status: status
      }).commit();
    });

    await workbook.commit();
  } catch (error) {
    console.error('Export error:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Export Customers Report as Excel
router.get('/customers/excel', protect, async (req, res) => {
  try {
    const customers = await dynamodb.listEntities('customer', { projection: ['_id', 'id', 'tenantId', 'name', 'phone', 'gender', 'totalSpent', 'loyaltyPoints', 'createdAt'] });
    const scopedCustomers = customers
      .filter((customer) => !req.user?.tenantId || customer.tenantId === req.user.tenantId)
      .sort((a, b) => Number(b.totalSpent || 0) - Number(a.totalSpent || 0));
    if (scopedCustomers.length > MAX_EXPORT_ROWS) throw Object.assign(new Error(`Export exceeds the maximum of ${MAX_EXPORT_ROWS.toLocaleString()} rows`), { statusCode: 413 });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers_report.xlsx');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const worksheet = workbook.addWorksheet('Customers Report');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Total Spent (MK)', key: 'totalSpent', width: 20 },
      { header: 'Loyalty Points', key: 'points', width: 18 },
      { header: 'Joined', key: 'joined', width: 25 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9B59B6' }
    };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.commit();

    scopedCustomers.forEach(customer => {
      worksheet.addRow({
        name: customer.name,
        phone: customer.phone,
        gender: customer.gender,
        totalSpent: formatMoney(customer.totalSpent),
        points: customer.loyaltyPoints || 0,
        joined: formatDate(customer.createdAt)
      }).commit();
    });

    await workbook.commit();
  } catch (error) {
    console.error('Export error:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Export Sales Report as PDF
router.get('/sales/pdf', protect, async (req, res) => {
  try {
    const { orders, customerMap, filters } = await getOrdersForExport(req);
    orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');

    doc.pipe(res);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    // Summary
    const totalSales = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const totalTax = orders.reduce((sum, o) => sum + (Number(o.taxAmount) || 0), 0);
    const totalNet = orders.reduce((sum, o) => sum + (Number.isFinite(Number(o.netAmount)) ? Number(o.netAmount) : Number(o.totalAmount)), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (Number(o.profit) || 0), 0);

    const summaryTop = doc.y;
    const summaryRows = [
      ['Total Orders', orders.length.toLocaleString()],
      ['Total Sales (Gross)', formatMoney(totalSales, true)],
      ['Total Tax', formatMoney(totalTax, true)],
      ['Total Sales (Net)', formatMoney(totalNet, true)],
      ['Total Profit', formatMoney(totalProfit, true)]
    ];
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827');
    summaryRows.forEach(([label, value], index) => {
      const rowY = summaryTop + (index * 20);
      doc.text(label, 50, rowY, { width: 220, align: 'left' });
      doc.text(value, 300, rowY, { width: 245, align: 'right' });
    });
    doc.y = summaryTop + (summaryRows.length * 20) + 18;

    // Keep all columns inside the A4 content width and reuse this grid on every page.
    const columns = {
      order: { x: 35, width: 75 },
      customer: { x: 110, width: 100 },
      tax: { x: 210, width: 55 },
      net: { x: 265, width: 70 },
      gross: { x: 335, width: 70 },
      payment: { x: 405, width: 70 },
      date: { x: 475, width: 85 }
    };
    const drawTableHeader = (top) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Order #', columns.order.x, top, { width: columns.order.width });
      doc.text('Customer', columns.customer.x, top, { width: columns.customer.width });
      doc.text('Tax', columns.tax.x, top, { width: columns.tax.width, align: 'right' });
      doc.text('Net', columns.net.x, top, { width: columns.net.width, align: 'right' });
      doc.text('Gross', columns.gross.x, top, { width: columns.gross.width, align: 'right' });
      doc.text('Payment', columns.payment.x, top, { width: columns.payment.width });
      doc.text('Date', columns.date.x, top, { width: columns.date.width });
      doc.moveTo(35, top + 15).lineTo(560, top + 15).stroke();
    };

    // Table Headers
    const tableTop = doc.y;
    drawTableHeader(tableTop);
    
    doc.moveDown();
    let y = doc.y;
    doc.font('Helvetica');

    orders.forEach((order, index) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
        // Repeat the same compact headers on each page.
        drawTableHeader(y);
        y += 25;
        doc.font('Helvetica');
      }
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(45, y - 2, 510, 18).fillAndStroke('#f5f5f5', '#f5f5f5');
      }
      doc.fillColor('#111827');
      
      // Format date properly
      const formattedDate = formatPdfDate(order.createdAt);
      
      doc.fontSize(8).font('Helvetica');
      doc.text(order.orderNumber || 'N/A', columns.order.x, y, { width: columns.order.width });
      doc.text(customerMap.get(getReferenceId(order.customer))?.name || order.customer?.name || order.customerName || 'Walk-in', columns.customer.x, y, { width: columns.customer.width, ellipsis: true });
      doc.text(formatMoney(order.taxAmount, true), columns.tax.x, y, { width: columns.tax.width, align: 'right' });
      const netValue = Number.isFinite(Number(order.netAmount)) ? Number(order.netAmount) : Number(order.totalAmount);
      doc.text(formatMoney(netValue, true), columns.net.x, y, { width: columns.net.width, align: 'right' });
      doc.text(formatMoney(order.totalAmount, true), columns.gross.x, y, { width: columns.gross.width, align: 'right' });
      doc.text(String(order.paymentMethod || 'Unknown').replace('_', ' '), columns.payment.x, y, { width: columns.payment.width, ellipsis: true });
      doc.text(formattedDate, columns.date.x, y, { width: columns.date.width, ellipsis: true });
      y += 20;
    });

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica');
    doc.text('Report generated by Bar Manager System', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#475569').text(formatReportPeriod(filters), { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;