function normalizeNumber(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const sanitized = String(value).replace(/[^\d.-]/g, '').replace(/,/g, '');
  const parsed = Number(sanitized || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOrderTotalAmount(order) {
  const orderAmount = normalizeNumber(order.totalAmount);
  if (orderAmount > 0) {
    return orderAmount;
  }

  if (!Array.isArray(order.items)) {
    return 0;
  }

  return order.items.reduce((sum, item) => {
    const subtotal = normalizeNumber(item.subtotal);
    if (subtotal > 0) {
      return sum + subtotal;
    }
    const priceAtSale = normalizeNumber(item.priceAtSale);
    const quantity = normalizeNumber(item.quantity);
    return sum + priceAtSale * quantity;
  }, 0);
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
  const totalSales = filteredOrders.reduce((sum, order) => sum + getOrderTotalAmount(order), 0);
  const totalTax = filteredOrders.reduce((sum, order) => sum + normalizeNumber(order.taxAmount), 0);
  const totalSalesNet = filteredOrders.reduce((sum, order) => {
    // prefer netAmount if provided (for tax-compliant orders), otherwise fall back to computed order total
    return sum + (Number.isFinite(Number(order.netAmount)) ? normalizeNumber(order.netAmount) : getOrderTotalAmount(order));
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
