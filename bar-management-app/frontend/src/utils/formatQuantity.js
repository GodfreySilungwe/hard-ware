const quantityFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3
});

export const formatQuantity = (quantity) => {
  const number = Number(quantity);
  if (!Number.isFinite(number)) return '0';
  return quantityFormatter.format(number);
};
