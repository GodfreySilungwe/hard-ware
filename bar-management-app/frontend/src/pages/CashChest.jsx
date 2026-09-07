import { useEffect, useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import Button from '../components/common/Button';
import UnifiedCard from '../components/common/UnifiedCard';
import { formatPriceMK } from '../utils/formatPrice';
import { useAuth } from '../context/AuthContext';

const emptyExpense = { amount: '', category: 'general', description: '' };
const emptyPayment = { customerId: '', amount: '', description: '' };

const CashChest = () => {
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [expense, setExpense] = useState(emptyExpense);
  const [payment, setPayment] = useState(emptyPayment);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [varianceExplanation, setVarianceExplanation] = useState('');
  const { user } = useAuth();
  const isManager = user?.role === 'hardware-manager' || user?.role === 'owner';

  const load = async () => {
    setLoading(true);
    try {
      const [summaryResponse, customerResponse] = await Promise.all([
        api.get('/cash/summary'),
        api.get('/customers')
      ]);
      setSummary(summaryResponse.data);
      const customerData = customerResponse.data;
      setCustomers(Array.isArray(customerData) ? customerData : customerData.customers || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load cash chest');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runAction = async (action, successMessage) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save cash movement');
    } finally {
      setSaving(false);
    }
  };

  const openSession = () => runAction(
    () => api.post('/cash/sessions', { openingFloat: Number(openingFloat) || 0 }),
    'Cash session opened'
  );

  const closeSession = () => {
    if (!summary?.session?._id) return;
    const expectedCash = Number(summary.balance || 0);
    const variance = Math.round((Number(countedCash) - expectedCash) * 100) / 100;
    if (variance !== 0 && !varianceExplanation.trim()) {
      setError('Please explain the cash variance before closing the session');
      return;
    }
    return runAction(
      () => api.post(`/cash/sessions/${summary.session._id}/close`, {
        countedCash: Number(countedCash) || 0,
        varianceExplanation: varianceExplanation.trim()
      }),
      'Cash session closed and reconciled'
    );
  };

  const addExpense = () => runAction(async () => {
    await api.post('/cash/entries', {
      amount: Number(expense.amount),
      type: 'expense',
      direction: 'out',
      category: expense.category,
      description: expense.description
    });
    setExpense(emptyExpense);
  }, 'Expense recorded');

  const receivePayment = () => runAction(async () => {
    await api.post('/cash/receivables/payments', {
      customerId: payment.customerId,
      amount: Number(payment.amount),
      description: payment.description
    });
    setPayment(emptyPayment);
  }, 'Receivable payment recorded');

  if (loading) return <PageContainer title="Cash Chest"><p>Loading cash chest...</p></PageContainer>;

  const session = summary?.session;
  const entries = summary?.entries || [];
  const cashMetrics = summary?.cashMetrics || {};
  const displayedOpeningFloat = Number(cashMetrics.openingFloat ?? session?.openingFloat ?? 0);
  const expectedCash = Number(cashMetrics.expectedCash ?? summary?.balance ?? displayedOpeningFloat);
  const accounts = Object.entries(summary?.accountBalances || {}).filter(([account]) => account !== 'cash');

  return (
    <PageContainer title="Cash Chest">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Cash Chest</h2>
          <p style={styles.subtitle}>Track cash, receivables, expenses, and reconciliation.</p>
        </div>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </div>

      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.metrics}>
        <div style={styles.metric}><span>Expected cash</span><strong>{formatPriceMK(expectedCash)}</strong></div>
        <div style={styles.metric}><span>Opening float</span><strong>{formatPriceMK(displayedOpeningFloat)}</strong></div>
        <div style={styles.metric}><span>Sales receipts</span><strong>{formatPriceMK(cashMetrics.salesReceipts || 0)}</strong></div>
        <div style={styles.metric}><span>Receivables collected</span><strong>{formatPriceMK(cashMetrics.receivableCollections || 0)}</strong></div>
        <div style={styles.metric}><span>Expenses</span><strong>{formatPriceMK(cashMetrics.expenses || 0)}</strong></div>
        <div style={styles.metric}><span>Variance</span><strong style={{ color: cashMetrics.variance ? '#b42318' : '#147d4b' }}>{cashMetrics.variance === null || cashMetrics.variance === undefined ? 'Not reconciled' : formatPriceMK(cashMetrics.variance)}</strong></div>
        <div style={styles.metric}><span>Session</span><strong>{session ? 'Open' : 'Closed'}</strong></div>
        {accounts.map(([account, balance]) => <div style={styles.metric} key={account}><span>{account.replace('_', ' ')}</span><strong>{formatPriceMK(balance)}</strong></div>)}
      </div>

      {!session && isManager ? (
        <UnifiedCard title="Open cash session">
          <div style={styles.formRow}>
            <label style={styles.label}>Opening float<input type="number" min="0" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} style={styles.input} /></label>
            <Button disabled={saving} onClick={openSession}>Open Session</Button>
          </div>
        </UnifiedCard>
      ) : session && isManager ? (
        <UnifiedCard title="Close and reconcile session">
          <div style={styles.formRow}>
            <label style={styles.label}>Expected cash<input value={formatPriceMK(expectedCash)} readOnly style={styles.input} /></label>
            <label style={styles.label}>Counted cash<input type="number" min="0" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} style={styles.input} /></label>
            {countedCash !== '' && Number(countedCash) !== expectedCash && (
              <label style={styles.label}>Variance explanation<textarea required value={varianceExplanation} onChange={(e) => setVarianceExplanation(e.target.value)} placeholder="Explain the difference" style={styles.input} /></label>
            )}
            <Button disabled={saving || countedCash === ''} onClick={closeSession}>Close Session</Button>
          </div>
        </UnifiedCard>
      ) : !session ? (
        <UnifiedCard title="Cash Chest unavailable">
          <p>The cash chest is only available after a manager opens a cash session.</p>
        </UnifiedCard>
      ) : null}

      {session && !isManager && (
        <UnifiedCard title="Active cash session">
          <p>This session was opened by a manager. You can view movements and record customer payments, but only a manager can open, close, or record expenses.</p>
        </UnifiedCard>
      )}

      <div style={styles.grid}>
        {isManager && <UnifiedCard title="Record expense">
          <div style={styles.form}>
            <input type="number" min="0" placeholder="Amount" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} style={styles.input} />
            <input placeholder="Category" value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })} style={styles.input} />
            <input placeholder="Description" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} style={styles.input} />
            <Button disabled={saving || !expense.amount} onClick={addExpense}>Record Expense</Button>
          </div>
        </UnifiedCard>}
        <UnifiedCard title="Receive customer payment">
          <div style={styles.form}>
            <select value={payment.customerId} onChange={(e) => setPayment({ ...payment, customerId: e.target.value })} style={styles.input}>
              <option value="">Select customer</option>
              {customers.filter((customer) => Number(customer.creditBalance || 0) > 0).map((customer) => <option key={customer._id} value={customer._id}>{customer.name} ({formatPriceMK(customer.creditBalance)})</option>)}
            </select>
            <input type="number" min="0" placeholder="Amount" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} style={styles.input} />
            <input placeholder="Description" value={payment.description} onChange={(e) => setPayment({ ...payment, description: e.target.value })} style={styles.input} />
            <Button disabled={saving || !payment.customerId || !payment.amount} onClick={receivePayment}>Record Payment</Button>
          </div>
        </UnifiedCard>
      </div>

      <UnifiedCard title="Recent cash movements">
        <div style={styles.table}>
          {entries.length === 0 && <p>No cash movements in this session.</p>}
          {entries.map((entry) => <div style={styles.entry} key={entry._id}>
            <div><strong>{entry.type?.replace(/_/g, ' ')}</strong><small>{entry.description || entry.category || entry.account}</small></div>
            <strong style={{ color: entry.direction === 'out' ? '#b42318' : '#147d4b' }}>{entry.direction === 'out' ? '-' : '+'}{formatPriceMK(entry.amount)}</strong>
          </div>)}
        </div>
      </UnifiedCard>
      {session?.status === 'closed' && cashMetrics.varianceExplanation && (
        <div style={styles.varianceNote}>
          <strong>Variance explanation:</strong> {cashMetrics.varianceExplanation}
        </div>
      )}
    </PageContainer>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px' },
  title: { margin: 0 }, subtitle: { color: '#667085', margin: '6px 0 0' },
  success: { background: '#ecfdf3', color: '#067647', padding: '12px', marginBottom: '16px', borderRadius: '8px' },
  error: { background: '#fef3f2', color: '#b42318', padding: '12px', marginBottom: '16px', borderRadius: '8px' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' },
  metric: { background: '#fff', border: '1px solid #eaecf0', borderRadius: '8px', padding: '16px', display: 'grid', gap: '8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', margin: '20px 0' },
  form: { display: 'grid', gap: '12px' }, formRow: { display: 'flex', alignItems: 'end', gap: '16px', flexWrap: 'wrap' },
  label: { display: 'grid', gap: '6px', color: '#344054', fontWeight: '600', minWidth: '180px' },
  input: { padding: '10px 12px', border: '1px solid #d0d5dd', borderRadius: '6px', fontSize: '14px', background: '#fff' },
  table: { display: 'grid', gap: '2px' }, entry: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eaecf0' },
  varianceNote: { background: '#fffaeb', color: '#93370d', border: '1px solid #fedf89', borderRadius: '8px', padding: '12px 16px', marginTop: '20px' },
};

export default CashChest;