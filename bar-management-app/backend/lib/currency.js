const LEGACY_CURRENCY_CODES = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  R: 'ZAR'
};
const SUPPORTED_CURRENCIES = typeof Intl.supportedValuesOf === 'function'
  ? new Set(Intl.supportedValuesOf('currency'))
  : null;

const normalizeCurrencyCode = (currency) => {
  const configuredCurrency = String(currency || '').trim();
  return LEGACY_CURRENCY_CODES[configuredCurrency] || configuredCurrency || 'MWK';
};

const formatCurrencyAmount = (amount, currency = 'MWK') => {
  const currencyCode = normalizeCurrencyCode(currency);
  const value = Number(amount);
  const safeValue = Number.isFinite(value) ? value : 0;
  const formattedAmount = safeValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (currencyCode === 'MWK') return `MK ${formattedAmount}`;

  try {
    const symbol = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode
    }).formatToParts(0).find((part) => part.type === 'currency')?.value;
    return `${symbol || currencyCode} ${formattedAmount}`;
  } catch {
    return `${currencyCode} ${formattedAmount}`;
  }
};

const isValidCurrencyCode = (currency) => {
  const currencyCode = normalizeCurrencyCode(currency);
  if (!/^[A-Z]{3}$/.test(currencyCode)) return false;
  if (SUPPORTED_CURRENCIES && !SUPPORTED_CURRENCIES.has(currencyCode)) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });
    return true;
  } catch {
    return false;
  }
};

module.exports = { normalizeCurrencyCode, formatCurrencyAmount, isValidCurrencyCode };
