async function applyOrderReversal(order, productFinder, user, metadata = {}) {
  if (!order || !Array.isArray(order.items)) {
    throw new Error('Invalid order supplied for reversal');
  }

  if (!canReverseOrder(user)) {
    throw new Error('Only hardware managers or owners can reverse sales');
  }

  for (const item of order.items) {
    const product = await productFinder(item.product);
    if (!product) {
      continue;
    }

    product.currentStock = Number(product.currentStock || 0) + Number(item.quantity || 0);
    await product.save();
  }

  if (order.customer) {
    const customerFinder = metadata.customerFinder;
    const customerId = typeof order.customer === 'string'
      ? order.customer
      : order.customer?.id || order.customer?._id || null;

    if (customerId && customerFinder) {
      const customer = await customerFinder(customerId);
      if (customer) {
        const amountToDeduct = Number(order.totalAmount || 0);
        const pointsToDeduct = Math.max(0, Math.floor(amountToDeduct / 100));

        customer.totalSpent = Math.max(0, Number(customer.totalSpent || 0) - amountToDeduct);
        customer.loyaltyPoints = Math.max(0, Number(customer.loyaltyPoints || 0) - pointsToDeduct);
        await customer.save();
      }
    }
  }

  order.status = 'reversed';
  order.reversedAt = new Date().toISOString();
  order.reversedBy = user?._id || user?.id || null;
  order.reversalReason = metadata.reason || 'No reason provided';
  order.reversalNotes = metadata.notes || '';

  return { order, reversed: true };
}

function canReverseOrder(user) {
  return Boolean(user && (user.role === 'hardware-manager' || user.role === 'owner'));
}

module.exports = { applyOrderReversal, canReverseOrder };
