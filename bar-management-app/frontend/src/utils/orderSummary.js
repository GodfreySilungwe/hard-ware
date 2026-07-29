const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

export const buildTodayOrderSummary = (orders = [], referenceDate = new Date(), summaryFallback = null) => {
  const normalizedOrders = Array.isArray(orders) ? orders : [];
  const activeOrders = normalizedOrders.filter((order) => order?.status !== 'reversed');
  const todayOrders = activeOrders.filter((order) => {
    const orderDate = getOrderDate(order);
    return Boolean(orderDate) && isSameCalendarDay(orderDate, referenceDate);
  });

  const totalSales = todayOrders.reduce((sum, order) => sum + toNumber(order?.totalAmount), 0);
  const totalProfit = todayOrders.reduce((sum, order) => sum + toNumber(order?.profit), 0);
  const reversedOrders = normalizedOrders.filter((order) => {
    const orderDate = getOrderDate(order);
    return order?.status === 'reversed' && Boolean(orderDate) && isSameCalendarDay(orderDate, referenceDate);
  }).length;

  const fallbackSales = toNumber(summaryFallback?.totalSales);
  const fallbackProfit = toNumber(summaryFallback?.totalProfit);
  const resolvedSales = fallbackSales > 0 ? fallbackSales : totalSales;
  const resolvedProfit = fallbackProfit > 0 ? fallbackProfit : totalProfit;

  return {
    orders: todayOrders,
    count: todayOrders.length,
    totalSales: resolvedSales,
    totalProfit: resolvedProfit,
    averageOrderValue: todayOrders.length > 0 ? resolvedSales / todayOrders.length : 0,
    reversedOrders
  };
};

export const resolveTodayOrderSummary = (summaryPayload = null, fallbackOrders = [], referenceDate = new Date()) => {
  const normalizedPayload = summaryPayload && typeof summaryPayload === 'object' && !Array.isArray(summaryPayload)
    ? summaryPayload
    : null;
  const payloadOrders = Array.isArray(normalizedPayload?.orders) ? normalizedPayload.orders : [];
  const sourceOrders = payloadOrders.length > 0 ? payloadOrders : fallbackOrders;
  const summary = buildTodayOrderSummary(sourceOrders, referenceDate, normalizedPayload);
  const payloadCount = typeof normalizedPayload?.count === 'number' ? normalizedPayload.count : null;

  return {
    ...summary,
    count: payloadCount ?? summary.count
  };
};
