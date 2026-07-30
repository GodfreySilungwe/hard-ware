const { applyOrderToCustomerAccount } = require('./customerAccountSync');

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

    const quantityToRestore = Number(item.quantity || 0);
    if (quantityToRestore > 0) {
      product.currentStock = Number(product.currentStock || 0) + quantityToRestore;
      await product.save();
    }
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
        applyOrderToCustomerAccount(customer, amountToDeduct, { reverse: true });
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
