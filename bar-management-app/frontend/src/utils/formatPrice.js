const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// Format price in Malawi Kwacha
export const formatPrice = (amount) => {
  const num = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(num)) {
    return '0.00';
  }
  return numberFormatter.format(num);
};

// Format price with MK symbol
export const formatPriceMK = (amount) => {
  const num = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(num)) return 'MK 0.00';
  return `MK ${numberFormatter.format(num)}`;
};

// Format large numbers
export const formatCurrency = (amount) => {
  const num = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(num)) {
    return 'MK 0.00';
  }
  if (num >= 1000000) {
    return `MK ${numberFormatter.format(num / 1000000)}M`;
  }
  if (num >= 1000) {
    return `MK ${numberFormatter.format(num / 1000)}K`;
  }
  return `MK ${numberFormatter.format(num)}`;
};