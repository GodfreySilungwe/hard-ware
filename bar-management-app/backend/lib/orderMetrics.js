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

  const paymentMethodsMap = {};
  let runningTotalProfit = 0;
  filteredOrders.forEach((order) => {
    const method = String(order?.paymentMethod || 'unknown');
    if (!paymentMethodsMap[method]) {
      paymentMethodsMap[method] = { count: 0, amount: 0 };
    }
    paymentMethodsMap[method].count += 1;
    paymentMethodsMap[method].amount += getOrderTotalAmount(order);
  });

  const paymentMethods = Object.entries(paymentMethodsMap)
    .map(([method, meta]) => ({
      method,
      label: getPaymentMethodLabel(method),
      count: meta.count,
      amount: meta.amount
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    orders: filteredOrders,
    count: filteredOrders.length,
    totalSales,
    totalTax,
    totalSalesNet,
    totalProfit,
    totalItems,
    averageOrderValue: filteredOrders.length > 0 ? totalSales / filteredOrders.length : 0,
    averageItemsPerOrder: filteredOrders.length > 0 ? totalItems / filteredOrders.length : 0,
    paymentMethods
  };
}

function buildReportSummary(orders = [], options = {}) {
  const includeReversed = options.includeReversed !== false;
  const filteredOrders = (orders || []).filter((order) => includeReversed || order?.status !== 'reversed');

  const customersMap = new Map();
  const productSalesMap = new Map();
  const profitProductMap = new Map();
  const categorySalesMap = new Map();
  const dailySalesMap = new Map();
  const paymentMethodsMap = new Map();
  let runningTotalProfit = 0;
  filteredOrders.forEach((order) => {
    const orderTotal = getOrderTotalAmount(order);
    const customerName = order?.customer?.name || order?.customerName || 'Walk-in';
    customersMap.set(customerName, (customersMap.get(customerName) || 0) + orderTotal);
    const orderDate = new Date(order?.createdAt || order?.created_at || order?.date || Date.now());
    // Use local date (YYYY-MM-DD) so grouping matches local-day boundaries instead of UTC-derived ISO date
    let dateKey = 'Unknown';
    if (!Number.isNaN(orderDate.getTime())) {
      const y = orderDate.getFullYear();
      const m = String(orderDate.getMonth() + 1).padStart(2, '0');
      const d = String(orderDate.getDate()).padStart(2, '0');
      dateKey = `${y}-${m}-${d}`;
    }

    // Compute per-order profit: prefer explicit order.profit, otherwise derive from items
    const items = Array.isArray(order.items) ? order.items : [];
    let orderProfit = normalizeNumber(order?.profit);
    if (orderProfit === 0 && items.length > 0) {
      // If the order is tax-compliant, prefer using net amounts for profit computation.
      const orderTotalAmount = normalizeNumber(order?.totalAmount);
      const orderNetAmount = normalizeNumber(order?.netAmount);
      const taxMultiplier = (order?.taxCompliant && orderTotalAmount > 0 && orderNetAmount > 0)
        ? (orderNetAmount / orderTotalAmount)
        : 1;

      orderProfit = items.reduce((sum, item) => {
        const quantity = normalizeNumber(item?.quantity);
        const subtotal = normalizeNumber(item?.subtotal);
        const rawPriceAtSale = normalizeNumber(item?.priceAtSale) || (quantity > 0 ? subtotal / quantity : 0);
        const priceAtSale = rawPriceAtSale * taxMultiplier;
        const costPrice = normalizeNumber(item?.costPrice ?? item?.product?.costPrice ?? 0);
        const itemProfit = normalizeNumber(item?.profit);
        const computedProfit = Math.max((priceAtSale - costPrice) * quantity, 0);
        return sum + (itemProfit > 0 ? itemProfit : computedProfit);
      }, 0);
    }

    const dayEntry = dailySalesMap.get(dateKey) || { sales: 0, profit: 0, count: 0 };
    dayEntry.sales += orderTotal;
    dayEntry.profit += orderProfit;
    dayEntry.count += 1;
    dailySalesMap.set(dateKey, dayEntry);

    // accumulate running total profit from per-order profit
    runningTotalProfit += orderProfit;

    const method = String(order?.paymentMethod || 'unknown');
    const paymentEntry = paymentMethodsMap.get(method) || { count: 0, amount: 0 };
    paymentEntry.count += 1;
    paymentEntry.amount += orderTotal;
    paymentMethodsMap.set(method, paymentEntry);

    // process items for product/category/profit maps
    items.forEach((item) => {
      const productName = item?.product?.name || item?.name || 'Unknown';
      const quantity = normalizeNumber(item?.quantity);
      const subtotal = normalizeNumber(item?.subtotal);
      const rawPriceAtSale = normalizeNumber(item?.priceAtSale) || (quantity > 0 ? subtotal / quantity : 0);
      const orderTotalAmount = normalizeNumber(order?.totalAmount);
      const orderNetAmount = normalizeNumber(order?.netAmount);
      const taxMultiplier = (order?.taxCompliant && orderTotalAmount > 0 && orderNetAmount > 0)
        ? (orderNetAmount / orderTotalAmount)
        : 1;
      const priceAtSale = rawPriceAtSale * taxMultiplier;
      const costPrice = normalizeNumber(item?.costPrice ?? item?.product?.costPrice ?? 0);
      const itemProfit = normalizeNumber(item?.profit);
      const computedProfit = Math.max((priceAtSale - costPrice) * quantity, 0);
      const profitAmount = itemProfit > 0 ? itemProfit : computedProfit;

      const productEntry = productSalesMap.get(productName) || { quantity: 0, revenue: 0 };
      productEntry.quantity += quantity;
      // revenue keeps the gross/subtotal amount (includes tax when present)
      productEntry.revenue += subtotal > 0 ? subtotal : rawPriceAtSale * quantity;
      productSalesMap.set(productName, productEntry);

      const profitEntry = profitProductMap.get(productName) || { quantity: 0, profit: 0 };
      profitEntry.quantity += quantity;
      profitEntry.profit += profitAmount;
      profitProductMap.set(productName, profitEntry);

      const categoryName = item?.product?.category?.name || 'Uncategorized';
      const categoryEntry = categorySalesMap.get(categoryName) || 0;
      categorySalesMap.set(categoryName, categoryEntry + (subtotal > 0 ? subtotal : priceAtSale * quantity));
    });
  });

  const topCustomers = [...customersMap.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topProducts = [...productSalesMap.entries()]
    .map(([name, details]) => ({ name, quantity: details.quantity, revenue: details.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topProfitProducts = [...profitProductMap.entries()]
    .map(([name, details]) => ({ name, quantity: details.quantity, profit: details.profit }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const categorySales = [...categorySalesMap.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const dailySales = [...dailySalesMap.entries()]
    .map(([date, details]) => ({ date, sales: details.sales, profit: details.profit, count: details.count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const paymentMethods = [...paymentMethodsMap.entries()]
    .map(([method, meta]) => ({
      method,
      label: getPaymentMethodLabel(method),
      count: meta.count,
      amount: meta.amount
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalSales = filteredOrders.reduce((sum, order) => sum + getOrderTotalAmount(order), 0);
  const totalTax = filteredOrders.reduce((sum, order) => sum + normalizeNumber(order.taxAmount), 0);
  const totalSalesNet = filteredOrders.reduce((sum, order) => sum + (Number.isFinite(Number(order.netAmount)) ? normalizeNumber(order.netAmount) : getOrderTotalAmount(order)), 0);
  const totalProfit = runningTotalProfit;
  const totalOrders = filteredOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const totalItems = filteredOrders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items.reduce((count, item) => count + normalizeNumber(item.quantity), 0) : 0), 0);
  const averageItemsPerOrder = totalOrders > 0 ? totalItems / totalOrders : 0;
  const averageRevenuePerCustomer = topCustomers.length > 0 ? totalSales / topCustomers.length : 0;

  return {
    topProducts,
    topCustomers,
    categorySales,
    dailySales,
    paymentMethods,
    topProfitProducts,
    totalSales,
    totalSalesNet,
    totalTax,
    totalProfit,
    totalOrders,
    totalItems,
    averageOrderValue,
    averageItemsPerOrder,
    averageRevenuePerCustomer,
    grossMarginPercentage: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
    reversedOrderRate: filteredOrders.length > 0 ? (filteredOrders.filter((order) => order?.status === 'reversed').length / filteredOrders.length) * 100 : 0,
    customerNames: [...new Set(filteredOrders.map((order) => order?.customer?.name || order?.customerName).filter(Boolean))],
    productNames: [...new Set(filteredOrders.flatMap((order) => (Array.isArray(order.items) ? order.items.map((item) => item?.product?.name || item?.name).filter(Boolean) : [])))],
    paymentNames: paymentMethods.map((payment) => payment.label || payment.method)
  };
}

module.exports = {
  getPaymentMethodLabel,
  summarizeOrders,
  buildReportSummary,
  normalizeNumber
};
