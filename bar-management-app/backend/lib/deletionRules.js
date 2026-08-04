function canDeleteProduct(product = {}) {
  const currentStock = Number(product?.currentStock ?? 0);
  if (currentStock > 0) {
    return {
      allowed: false,
      reason: 'Cannot delete a product while stock is still available.'
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

function canDeleteCategory(category = {}) {
  const attachedProducts = Array.isArray(category?.attachedProducts)
    ? category.attachedProducts
    : [];

  if (attachedProducts.length > 0) {
    return {
      allowed: false,
      reason: 'Cannot delete a category that still has products attached.'
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

module.exports = {
  canDeleteProduct,
  canDeleteCategory
};
