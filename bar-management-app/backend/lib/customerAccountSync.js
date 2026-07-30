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

module.exports = { applyOrderToCustomerAccount };
