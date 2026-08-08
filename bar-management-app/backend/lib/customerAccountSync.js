function applyOrderToCustomerAccount(customer, amount, options = {}) {
  const normalizedAmount = Number(amount || 0);

  if (!customer || !Number.isFinite(normalizedAmount)) {
    return customer;
  }

  const isReverse = Boolean(options.reverse);
  const change = isReverse ? -normalizedAmount : normalizedAmount;
  const pointsChange = isReverse ? -Math.max(0, Math.floor(normalizedAmount / 100)) : Math.floor(normalizedAmount / 100);

  customer.totalSpent = Number(customer.totalSpent || 0) + change;
  customer.loyaltyPoints = Math.max(0, Number(customer.loyaltyPoints || 0) + pointsChange);

  const currentBalance = Number(customer.creditBalance || 0);
  customer.creditBalance = isReverse ? Math.max(0, currentBalance - normalizedAmount) : currentBalance + normalizedAmount;

  if (customer.totalSpent < 0) {
    customer.totalSpent = 0;
  }

  return customer;
}

function calculateDiscountedOrderTotal(subtotal, discountAmount) {
  const normalizedSubtotal = Number(subtotal || 0);
  const normalizedDiscount = Math.max(0, Number(discountAmount || 0));
  const cappedDiscount = Math.min(normalizedDiscount, normalizedSubtotal);
  const discountedTotal = Math.max(0, normalizedSubtotal - cappedDiscount);

  return {
    discountAmount: cappedDiscount,
    discountedTotal
  };
}

function settleCustomerCreditBalance(customer, amount) {
  const normalizedAmount = Math.max(0, Number(amount || 0));

  if (!customer || !Number.isFinite(normalizedAmount)) {
    return customer;
  }

  const currentBalance = Number(customer.creditBalance || 0);
  const paymentAmount = Math.min(normalizedAmount, currentBalance);

  customer.creditBalance = Math.max(0, currentBalance - paymentAmount);

  return customer;
}

module.exports = { applyOrderToCustomerAccount, calculateDiscountedOrderTotal, settleCustomerCreditBalance };
