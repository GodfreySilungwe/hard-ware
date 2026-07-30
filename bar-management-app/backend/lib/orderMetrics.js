function normalizeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPaymentMethodLabel(method) {
  const normalized = String(method || '').toLowerCase().trim();
  if (normalized === 'airtel_money' || normalized === 'airtelmoney') {
    return 'Airtel Money';
  }
  if (normalized === 'mpamba') {
    return 'Mpamba';
  }
  if (normalized === 'mobile_money' || normalized === 'mobile-money' || normalized === 'mobile money') {
    return 'Mobile Money';
  }
  if (normalized === 'cash') {
    return 'Cash';
  }
  if (normalized === 'card') {
    return 'Card';
  }
  return String(method || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';
}

function summarizeOrders(orders = [], options = {}) {
  const includeReversed = options.includeReversed !== false;
  const filteredOrders = (orders || []).filter((order) => includeReversed || order?.status !== 'reversed');

  // Gross sales (totalAmount), tax totals, and net sales (netAmount when present)
  const totalSales = filteredOrders.reduce((sum, order) => sum + normalizeNumber(order.totalAmount), 0);
  const totalTax = filteredOrders.reduce((sum, order) => sum + normalizeNumber(order.taxAmount), 0);
  const totalSalesNet = filteredOrders.reduce((sum, order) => {
    // prefer netAmount if provided (for tax-compliant orders), otherwise fall back to totalAmount
    return sum + (Number.isFinite(Number(order.netAmount)) ? normalizeNumber(order.netAmount) : normalizeNumber(order.totalAmount));
  }, 0);

  const totalProfit = filteredOrders.reduce((sum, order) => sum + normalizeNumber(order.profit), 0);
  const totalItems = filteredOrders.reduce((sum, order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    return sum + items.reduce((itemSum, item) => itemSum + normalizeNumber(item.quantity), 0);
  }, 0);

  return {
    orders: filteredOrders,
    count: filteredOrders.length,
    totalSales,
    totalTax,
    totalSalesNet,
    totalProfit,
    totalItems,
    averageOrderValue: filteredOrders.length > 0 ? totalSales / filteredOrders.length : 0,
    averageItemsPerOrder: filteredOrders.length > 0 ? totalItems / filteredOrders.length : 0
  };
}

module.exports = {
  getPaymentMethodLabel,
  summarizeOrders,
  normalizeNumber
};
