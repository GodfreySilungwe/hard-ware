const express = require('express');
const CashEntry = require('../models/CashEntry');
const CashSession = require('../models/CashSession');
const Customer = require('../models/Customer');
const { protect, isHardwareManagerOrOwner } = require('../middleware/auth');
const { findOpenSession, ensureOpenSession, normalizeAmount, recordCashEntry } = require('../lib/cashLedger');
const { settleCustomerCreditBalance } = require('../lib/customerAccountSync');

const router = express.Router();

const tenantRecords = (records, req) => {
  const tenantId = req.user?.tenantId || null;
  return (records || []).filter((record) => !tenantId || record.tenantId === tenantId);
};

const getSessionEntries = async (sessionId, req) => tenantRecords(
  await CashEntry.find(sessionId ? { sessionId } : {}, req),
  req
);

const calculateBalance = (entries, openingFloat = 0) => normalizeAmount(
  normalizeAmount(openingFloat) + entries.reduce((balance, entry) => (
    balance + (entry.direction === 'out' ? -Number(entry.amount || 0) : Number(entry.amount || 0))
  ), 0)
);

router.get('/summary', protect, async (req, res) => {
  try {
    const [sessions, entries] = await Promise.all([
      CashSession.find({}, req),
      CashEntry.find({}, req)
    ]);
    const scopedSessions = tenantRecords(sessions, req);
    const scopedEntries = tenantRecords(entries, req);
    const openSession = scopedSessions.find((session) => session.status === 'open') || null;
    const selectedSession = req.query.sessionId
      ? scopedSessions.find((session) => (session._id || session.id) === req.query.sessionId)
      : openSession;
    const sessionEntries = selectedSession
      ? scopedEntries.filter((entry) => entry.sessionId === (selectedSession._id || selectedSession.id))
      : [];
    const accountBalances = {};

    for (const entry of scopedEntries) {
      const account = entry.account || 'cash';
      accountBalances[account] = normalizeAmount((accountBalances[account] || 0) + (
        entry.direction === 'out' ? -Number(entry.amount || 0) : Number(entry.amount || 0)
      ));
    }

    res.json({
      openSession,
      session: selectedSession,
      balance: calculateBalance(sessionEntries, selectedSession?.openingFloat || 0),
      accountBalances,
      entries: sessionEntries.sort((left, right) => new Date(right.occurredAt || right.createdAt || 0) - new Date(left.occurredAt || left.createdAt || 0))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/entries', protect, async (req, res) => {
  try {
    const entries = await getSessionEntries(req.query.sessionId, req);
    const filtered = entries
      .filter((entry) => !req.query.account || entry.account === req.query.account)
      .filter((entry) => !req.query.type || entry.type === req.query.type)
      .sort((left, right) => new Date(right.occurredAt || right.createdAt || 0) - new Date(left.occurredAt || left.createdAt || 0));
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/sessions', protect, isHardwareManagerOrOwner, async (req, res) => {
  try {
    if (await findOpenSession(req)) return res.status(400).json({ message: 'A cash session is already open' });
    const openingFloat = normalizeAmount(req.body?.openingFloat);
    if (openingFloat < 0) return res.status(400).json({ message: 'Opening float cannot be negative' });
    const session = await ensureOpenSession(req, openingFloat);
    res.status(201).json(session);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/sessions/:id/close', protect, isHardwareManagerOrOwner, async (req, res) => {
  try {
    const session = await CashSession.findById(req.params.id, req);
    if (!session || session.status !== 'open') return res.status(404).json({ message: 'Open cash session not found' });
    const entries = await getSessionEntries(req.params.id, req);
    const expectedClosing = calculateBalance(entries, session.openingFloat);
    const countedCash = normalizeAmount(req.body?.countedCash);
    if (countedCash < 0) return res.status(400).json({ message: 'Counted cash cannot be negative' });
    session.expectedClosing = expectedClosing;
    session.countedCash = countedCash;
    session.variance = normalizeAmount(countedCash - expectedClosing);
    session.status = 'closed';
    session.closedAt = new Date().toISOString();
    session.closedBy = req.user?.id || req.user?._id || null;
    await session.save();
    res.json(session);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/entries', protect, isHardwareManagerOrOwner, async (req, res) => {
  try {
    const amount = normalizeAmount(req.body?.amount);
    if (amount <= 0) return res.status(400).json({ message: 'Amount must be greater than zero' });
    const direction = req.body?.direction || (req.body?.type === 'expense' ? 'out' : 'in');
    const entry = await recordCashEntry({
      req,
      amount,
      direction,
      account: req.body?.account || 'cash',
      type: req.body?.type || 'adjustment',
      category: req.body?.category || null,
      description: req.body?.description || '',
      sourceType: 'manual',
      sourceKey: req.body?.idempotencyKey || null
    });
    res.status(201).json(entry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/receivables/payments', protect, async (req, res) => {
  try {
    const customer = await Customer.findById(req.body?.customerId, req);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    const amount = normalizeAmount(req.body?.amount);
    const balance = normalizeAmount(customer.creditBalance);
    if (amount <= 0 || amount > balance) return res.status(400).json({ message: 'Payment must be greater than zero and cannot exceed the customer balance' });
    settleCustomerCreditBalance(customer, amount);
    customer.creditSettlements = Array.isArray(customer.creditSettlements) ? customer.creditSettlements : [];
    customer.creditSettlements.push({ amount, settledAt: new Date().toISOString(), account: req.body?.account || 'cash' });
    await customer.save();
    const entry = await recordCashEntry({
      req,
      amount,
      account: req.body?.account || 'cash',
      type: 'receivable_payment',
      description: req.body?.description || `Payment from ${customer.name || 'customer'}`,
      customerId: customer._id || customer.id,
      sourceType: 'customer',
      sourceId: customer._id || customer.id,
      sourceKey: req.body?.idempotencyKey || `receivable:${customer._id || customer.id}:${Date.now()}`
    });
    res.status(201).json({ customer, entry });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;