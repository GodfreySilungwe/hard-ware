// Format price in Malawi Kwacha
export const formatPrice = (amount) => {
  if (amount === undefined || amount === null) return '0.00';
  return Number(amount).toFixed(2);
};

// Format price with MK symbol
export const formatPriceMK = (amount) => {
  if (amount === undefined || amount === null) return 'MK 0.00';
  return `MK ${Number(amount).toFixed(2)}`;
};

// Format large numbers
export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '0.00';
  const num = Number(amount);
  if (num >= 1000000) {
    return `MK ${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `MK ${(num / 1000).toFixed(1)}K`;
  }
  return `MK ${num.toFixed(2)}`;
};