const toNumber = (value) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const sanitized = String(value).replace(/[^\n\d.-]/g, '').replace(/,/g, '');
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasNumericPayload = (value) => {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (text === '') return false;
  return Number.isFinite(Number(text));
};

export const getOrderDate = (order) => {
  const timestamp = order?.createdAt || order?.created_at || order?.date || order?.updatedAt || order?.updated_at || null;
  const parsedDate = timestamp ? new Date(timestamp) : new Date(0);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export const isSameCalendarDay = (value, referenceDate = new Date()) => {
  if (!value) return false;
  return value.getFullYear() === referenceDate.getFullYear()
    && value.getMonth() === referenceDate.getMonth()
    && value.getDate() === referenceDate.getDate();
};

const getOrderTotalAmount = (order) => {
  const orderAmount = toNumber(order?.totalAmount);
  if (orderAmount > 0) return orderAmount;

  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => {
    const subtotal = toNumber(item?.subtotal);
    if (subtotal > 0) return sum + subtotal;
    const priceAtSale = toNumber(item?.priceAtSale);
    const quantity = toNumber(item?.quantity);
    return sum + priceAtSale * quantity;
  }, 0);
};

export const buildTodayOrderSummary = (orders = [], referenceDate = new Date(), summaryFallback = null) => {
  const normalizedOrders = Array.isArray(orders) ? orders : [];
  const activeOrders = normalizedOrders.filter((order) => order?.status !== 'reversed');
  const todayOrders = activeOrders.filter((order) => {
    const orderDate = getOrderDate(order);
    return Boolean(orderDate) && isSameCalendarDay(orderDate, referenceDate);
  });

  const totalSales = todayOrders.reduce((sum, order) => sum + getOrderTotalAmount(order), 0);
  const totalProfit = todayOrders.reduce((sum, order) => sum + toNumber(order?.profit), 0);
  const totalTax = todayOrders.reduce((sum, order) => sum + toNumber(order?.taxAmount), 0);
  const totalSalesNet = todayOrders.reduce((sum, order) => {
    const net = Number.isFinite(Number(order?.netAmount)) ? toNumber(order.netAmount) : getOrderTotalAmount(order);
    return sum + net;
  }, 0);

  const reversedOrders = normalizedOrders.filter((order) => {
    const orderDate = getOrderDate(order);
    return order?.status === 'reversed' && Boolean(orderDate) && isSameCalendarDay(orderDate, referenceDate);
  }).length;

  return {
    orders: todayOrders,
    count: todayOrders.length,
    totalSales,
    totalProfit,
    totalTax,
    totalSalesNet,
    averageOrderValue: todayOrders.length > 0 ? totalSales / todayOrders.length : 0,
    reversedOrders
  };
};

export const resolveTodayOrderSummary = (summaryPayload = null, fallbackOrders = [], referenceDate = new Date()) => {
  const normalizedPayload = summaryPayload && typeof summaryPayload === 'object' && !Array.isArray(summaryPayload)
    ? summaryPayload
    : null;
  const payloadOrders = Array.isArray(normalizedPayload?.orders) ? normalizedPayload.orders : [];
  const sourceOrders = fallbackOrders.length > 0 ? fallbackOrders : payloadOrders;
  const summary = buildTodayOrderSummary(sourceOrders, referenceDate, normalizedPayload);
  const payloadCount = typeof normalizedPayload?.count === 'number' ? normalizedPayload.count : null;
  const payloadSales = normalizedPayload?.totalSales;
  const payloadProfit = normalizedPayload?.totalProfit;
  const payloadTax = normalizedPayload?.totalTax;
  const payloadSalesNet = normalizedPayload?.totalSalesNet;

  if (fallbackOrders.length > 0) {
    return summary;
  }

  return {
    ...summary,
    count: payloadCount ?? summary.count,
    totalSales: hasNumericPayload(payloadSales) ? toNumber(payloadSales) : summary.totalSales,
    totalProfit: hasNumericPayload(payloadProfit) ? toNumber(payloadProfit) : summary.totalProfit,
    totalTax: hasNumericPayload(payloadTax) ? toNumber(payloadTax) : summary.totalTax,
    totalSalesNet: hasNumericPayload(payloadSalesNet) ? (
      toNumber(payloadSalesNet) === 0 && summary.totalSalesNet > 0 ? summary.totalSalesNet : toNumber(payloadSalesNet)
    ) : summary.totalSalesNet,
    averageOrderValue: summary.count > 0 ? summary.totalSales / summary.count : 0
  };
};
