const DEFAULT_GRACE_PERIOD_DAYS = 10;
const MIN_TERM_MONTHS = 1;
const MAX_TERM_MONTHS = 12;

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

const hasSubscriptionData = (tenant) => [
  tenant?.subscriptionStatus,
  tenant?.subscriptionExpiresAt,
  tenant?.subscriptionStartAt,
  tenant?.subscriptionTermMonths,
  tenant?.subscriptionPaymentReference,
  tenant?.subscriptionPaymentMethod,
  tenant?.subscriptionUpdatedAt
].some((value) => value !== undefined && value !== null && value !== '');

const getSubscriptionAccess = (tenant, now = new Date()) => {
  if (!tenant || (!tenant.subscriptionEnforced && !hasSubscriptionData(tenant))) {
    return { legacy: true, status: 'legacy', canAccess: true, gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS };
  }

  const expiresAt = parseDate(tenant.subscriptionExpiresAt);
  const gracePeriodDays = Number.isInteger(Number(tenant.gracePeriodDays)) && Number(tenant.gracePeriodDays) >= 0
    ? Math.max(0, Number(tenant.gracePeriodDays))
    : DEFAULT_GRACE_PERIOD_DAYS;
  const graceEndsAt = expiresAt
    ? new Date(expiresAt.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000)
    : null;

  if (tenant.subscriptionStatus === 'cancelled') {
    return { legacy: false, status: 'cancelled', canAccess: false, expiresAt, graceEndsAt, gracePeriodDays };
  }

  if (tenant.subscriptionStatus === 'pending') {
    return { legacy: false, status: 'pending', canAccess: false, expiresAt, graceEndsAt, gracePeriodDays };
  }

  if (tenant.subscriptionStatus === 'suspended') {
    return { legacy: false, status: 'suspended', canAccess: false, expiresAt, graceEndsAt, gracePeriodDays };
  }

  if (!expiresAt) {
    return { legacy: false, status: 'pending', canAccess: false, expiresAt: null, graceEndsAt: null, gracePeriodDays };
  }

  if (now <= expiresAt) {
    return { legacy: false, status: 'active', canAccess: true, expiresAt, graceEndsAt, gracePeriodDays };
  }

  if (graceEndsAt && now <= graceEndsAt) {
    return { legacy: false, status: 'grace', canAccess: true, expiresAt, graceEndsAt, gracePeriodDays };
  }

  return { legacy: false, status: 'suspended', canAccess: false, expiresAt, graceEndsAt, gracePeriodDays };
};

const normalizeTermMonths = (value) => {
  const months = Number(value);
  if (!Number.isInteger(months) || months < MIN_TERM_MONTHS || months > MAX_TERM_MONTHS) {
    return null;
  }
  return months;
};

const buildSubscriptionDates = ({ startAt = new Date(), termMonths }) => {
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
  MIN_TERM_MONTHS,
  MAX_TERM_MONTHS,
  addMonths,
  buildSubscriptionDates,
  getSubscriptionAccess,
  normalizeTermMonths
};
