export const filterAndSortProducts = (products = [], searchTerm = '', sortBy = 'name-asc') => {
  const query = String(searchTerm || '').trim().toLowerCase();

  const filtered = products.filter((product) => {
    if (!query) return true;

    const searchableText = [
      product?.name,
      product?.category?.name,
      product?.category,
      product?.unit,
      product?.currentStock,
      product?.sellingPrice,
      product?.costPrice
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(query);
  });

  const sorted = [...filtered];

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'name-desc':
        return String(b?.name || '').localeCompare(String(a?.name || ''));
      case 'stock-desc':
        return Number(b?.currentStock || 0) - Number(a?.currentStock || 0);
      case 'stock-asc':
        return Number(a?.currentStock || 0) - Number(b?.currentStock || 0);
      case 'price-desc':
        return Number(b?.sellingPrice || 0) - Number(a?.sellingPrice || 0);
      case 'price-asc':
        return Number(a?.sellingPrice || 0) - Number(b?.sellingPrice || 0);
      case 'name-asc':
      default:
        return String(a?.name || '').localeCompare(String(b?.name || ''));
    }
  });

  return sorted;
};
