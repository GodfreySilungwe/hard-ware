const CashEntry = require('../models/CashEntry');
const CashSession = require('../models/CashSession');

const normalizeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const getTenantId = (req) => req?.user?.tenantId || null;

const getTenantRecords = (records, req) => (records || []).filter((record) => {
  const tenantId = getTenantId(req);
  return !tenantId || record.tenantId === tenantId;
});

const findOpenSession = async (req) => {
  const sessions = getTenantRecords(await CashSession.find({}, req), req);
  return sessions
    .filter((session) => session.status === 'open')
    .sort((left, right) => new Date(right.openedAt || right.createdAt || 0) - new Date(left.openedAt || left.createdAt || 0))[0] || null;
};

const ensureOpenSession = async (req, openingFloat = 0) => {
  const existing = await findOpenSession(req);
  if (existing) return existing;

  const session = new CashSession({
    tenantId: getTenantId(req),
    openedBy: req?.user?.id || req?.user?._id || null,
    openedAt: new Date().toISOString(),
    openingFloat: normalizeAmount(openingFloat),
    expectedClosing: normalizeAmount(openingFloat)
  });
  await session.save();
  return session;
};

const recordCashEntry = async ({
  req,
  amount,
  direction = 'in',
  type,
  account = 'cash',
  description = '',
  sourceType = null,
  sourceId = null,
  sourceKey = null,
  customerId = null,
  orderId = null,
  category = null,
  sessionId = null
}) => {
  const normalizedAmount = normalizeAmount(amount);
  if (normalizedAmount <= 0) return null;
  if (!['in', 'out'].includes(direction)) throw new Error('Cash entry direction must be in or out');

  const tenantId = getTenantId(req);
  const duplicateQuery = sourceKey ? { sourceKey } : null;
  if (duplicateQuery) {
    const existing = await CashEntry.findOne(duplicateQuery, req);
    if (existing && (!tenantId || existing.tenantId === tenantId)) return existing;
  }

  let resolvedSessionId = sessionId;
  if (account === 'cash' && !resolvedSessionId) {
    const session = await ensureOpenSession(req);
    resolvedSessionId = session._id || session.id;
  }

  const entry = new CashEntry({
    tenantId,
    amount: normalizedAmount,
    direction,
    type: type || 'adjustment',
    account,
    description,
    sourceType,
    sourceId,
    sourceKey,
    customerId,
    orderId,
    category,
    sessionId: resolvedSessionId,
    createdBy: req?.user?.id || req?.user?._id || null,
    occurredAt: new Date().toISOString()
  });
  await entry.save();
  return entry;
};

module.exports = { normalizeAmount, findOpenSession, ensureOpenSession, recordCashEntry };