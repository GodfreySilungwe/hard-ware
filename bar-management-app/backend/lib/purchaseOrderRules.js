const purchaseOrderStatuses = ['pending', 'ordered', 'received', 'cancelled'];

const allowedStatusTransitions = {
  pending: ['ordered', 'received', 'cancelled'],
  ordered: ['received', 'cancelled'],
  received: [],
  cancelled: []
};

function normalizePurchaseOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one purchase order item is required');
  }

  return items.map((item) => {
    const quantity = Number(item?.quantity);
    const costPrice = Number(item?.costPrice);

    if (!item?.product || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
      throw new Error('Each item must have a valid product, integer quantity, and cost price');
    }

    return {
      product: item.product,
      quantity,
      costPrice
    };
  });
}

function canUpdatePurchaseOrderStatus(currentStatus, nextStatus) {
  if (!purchaseOrderStatuses.includes(nextStatus)) return false;
  if (currentStatus === nextStatus) return true;
  return allowedStatusTransitions[currentStatus]?.includes(nextStatus) || false;
}

module.exports = {
  purchaseOrderStatuses,
  normalizePurchaseOrderItems,
  canUpdatePurchaseOrderStatus
};