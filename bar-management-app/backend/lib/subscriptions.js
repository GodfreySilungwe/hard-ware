const DEFAULT_GRACE_PERIOD_DAYS = 10;
const MIN_TERM_MONTHS = 1;
const MAX_TERM_MONTHS = 12;
const MIN_TERM_DAYS = 1;
const MAX_TERM_DAYS = 365;
const MAX_GRACE_PERIOD_DAYS = 90;
const MAX_GRACE_PERIOD_MONTHS = 3;

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addMonths = (date, months) => {
  const source = new Date(date);
  const result = new Date(source);
  const sourceDay = source.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(sourceDay, lastDayOfTargetMonth));
  return result;
};

const addDays = (date, days) => new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);

const hasSubscriptionData = (tenant) => [
  tenant?.subscriptionStatus,
  tenant?.subscriptionExpiresAt,
  tenant?.subscriptionStartAt,
  tenant?.subscriptionTermMonths,
  tenant?.subscriptionTermDays,
  tenant?.subscriptionPaymentReference,
  tenant?.subscriptionPaymentMethod,
  tenant?.subscriptionUpdatedAt,
  tenant?.gracePeriodUnit,
  tenant?.gracePeriodValue,
  tenant?.gracePeriodMonths
].some((value) => value !== undefined && value !== null && value !== '');

const getSubscriptionAccess = (tenant, now = new Date()) => {
  if (!tenant || (!tenant.subscriptionEnforced && !hasSubscriptionData(tenant))) {
    return { legacy: true, status: 'legacy', canAccess: true, gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS };
  }

  const expiresAt = parseDate(tenant.subscriptionExpiresAt);
  const gracePeriodUnit = tenant.gracePeriodUnit === 'months'
    || (tenant.gracePeriodUnit === undefined && tenant.gracePeriodMonths !== undefined)
    ? 'months'
    : 'days';
  const configuredGraceValue = tenant.gracePeriodValue
    ?? (gracePeriodUnit === 'months' ? tenant.gracePeriodMonths : tenant.gracePeriodDays);
  const maxGraceValue = gracePeriodUnit === 'months' ? MAX_GRACE_PERIOD_MONTHS : MAX_GRACE_PERIOD_DAYS;
  const isGraceValueValid = Number.isInteger(Number(configuredGraceValue))
    && Number(configuredGraceValue) >= 0
    && Number(configuredGraceValue) <= maxGraceValue;
  const gracePeriodValue = isGraceValueValid
    ? Number(configuredGraceValue)
    : gracePeriodUnit === 'months' ? 0 : DEFAULT_GRACE_PERIOD_DAYS;
  const gracePeriodDays = gracePeriodUnit === 'days' ? gracePeriodValue : null;
  const graceEndsAt = expiresAt
    ? gracePeriodUnit === 'months'
      ? addMonths(expiresAt, gracePeriodValue)
      : addDays(expiresAt, gracePeriodValue)
    : null;
  const graceDetails = { gracePeriodDays, gracePeriodUnit, gracePeriodValue };

  if (tenant.subscriptionStatus === 'cancelled') {
    return { legacy: false, status: 'cancelled', canAccess: false, expiresAt, graceEndsAt, ...graceDetails };
  }

  if (tenant.subscriptionStatus === 'pending') {
    return { legacy: false, status: 'pending', canAccess: false, expiresAt, graceEndsAt, ...graceDetails };
  }

  if (tenant.subscriptionStatus === 'suspended') {
    return { legacy: false, status: 'suspended', canAccess: false, expiresAt, graceEndsAt, ...graceDetails };
  }

  if (!expiresAt) {
    return { legacy: false, status: 'pending', canAccess: false, expiresAt: null, graceEndsAt: null, ...graceDetails };
  }

  if (now <= expiresAt) {
    return { legacy: false, status: 'active', canAccess: true, expiresAt, graceEndsAt, ...graceDetails };
  }

  if (graceEndsAt && now <= graceEndsAt) {
    return { legacy: false, status: 'grace', canAccess: true, expiresAt, graceEndsAt, ...graceDetails };
  }

  return { legacy: false, status: 'suspended', canAccess: false, expiresAt, graceEndsAt, ...graceDetails };
};

const normalizeTermMonths = (value) => {
  const months = Number(value);
  if (!Number.isInteger(months) || months < MIN_TERM_MONTHS || months > MAX_TERM_MONTHS) {
    return null;
  }
  return months;
};

const normalizeTermDays = (value) => {
  const days = Number(value);
  if (!Number.isInteger(days) || days < MIN_TERM_DAYS || days > MAX_TERM_DAYS) {
    return null;
  }
  return days;
};

const buildSubscriptionDates = ({ startAt = new Date(), termMonths, termDays }) => {
  if (termDays !== undefined) {
    const days = normalizeTermDays(termDays);
    if (!days) return null;
    const startDate = parseDate(startAt) || new Date();
    return {
      startAt: startDate.toISOString(),
      expiresAt: addDays(startDate, days).toISOString(),
      termDays: days
    };
  }

  const months = normalizeTermMonths(termMonths);
  if (!months) return null;

  const startDate = parseDate(startAt) || new Date();
  return {
    startAt: startDate.toISOString(),
    expiresAt: addMonths(startDate, months).toISOString(),
    termMonths: months
  };
};

module.exports = {
  DEFAULT_GRACE_PERIOD_DAYS,
  MAX_GRACE_PERIOD_DAYS,
  MAX_GRACE_PERIOD_MONTHS,
  MAX_TERM_DAYS,
  MIN_TERM_MONTHS,
  MAX_TERM_MONTHS,
  addDays,
  addMonths,
  buildSubscriptionDates,
  getSubscriptionAccess,
  normalizeTermDays,
  normalizeTermMonths
};
