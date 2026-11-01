const LEGACY_CURRENCY_CODES = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  R: 'ZAR'
};

export const normalizeCurrencyCode = (currency) => {
  const configuredCurrency = String(currency || '').trim();
  return LEGACY_CURRENCY_CODES[configuredCurrency] || configuredCurrency || 'MWK';
};

export const getConfiguredCurrency = () => {
  if (typeof localStorage === 'undefined') return 'MWK';
  try {
    const savedSettings = localStorage.getItem('businessSettings');
    if (savedSettings) {
      return normalizeCurrencyCode(JSON.parse(savedSettings).currency);
    }
    return normalizeCurrencyCode(localStorage.getItem('businessCurrency'));
  } catch (error) {
    console.error('Failed to read configured currency:', error);
    return 'MWK';
  }
};

const formatNumber = (amount) => {
  const num = Number(amount);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(num) ? num : 0);
};

export const getCurrencySymbol = (currency) => {
  const currencyCode = normalizeCurrencyCode(currency);
  if (currencyCode === 'MWK') return 'MK';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value || currencyCode;
  } catch {
    return currencyCode;
  }
};

export const formatPrice = (amount) => {
  return formatNumber(amount);
};

export const formatPriceMK = (amount, currency = getConfiguredCurrency()) => {
  return `${getCurrencySymbol(currency)} ${formatNumber(amount)}`;
};

export const formatCurrency = (amount, currency = getConfiguredCurrency()) => {
  const num = Number(amount);
  const symbol = getCurrencySymbol(currency);
  const safeNumber = Number.isFinite(num) ? num : 0;
  if (safeNumber >= 1000000) {
    return `${symbol} ${formatNumber(safeNumber / 1000000)}M`;
  }
  if (safeNumber >= 1000) {
    return `${symbol} ${formatNumber(safeNumber / 1000)}K`;
  }
  return `${symbol} ${formatNumber(safeNumber)}`;
};