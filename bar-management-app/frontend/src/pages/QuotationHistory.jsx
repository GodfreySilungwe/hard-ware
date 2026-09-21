import { useEffect, useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import { formatPriceMK } from '../utils/formatPrice';

const QuoteHistory = () => {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/quotations');
      const list = Array.isArray(response.data) ? response.data : [];
      setQuotes(list);
      setError('');
    } catch (err) {
      console.error('Failed to load quotations', err);
      setError('Unable to load quotation history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotes();
  }, []);

  const openPdf = async (quoteId) => {
    try {
      const response = await api.get(`/quotations/${quoteId}/pdf`, { responseType: 'blob' });
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/pdf' });
      const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      const signature = String.fromCharCode(...header);
      if (blob.size === 0 || signature !== '%PDF-') {
        throw new Error('The server did not return a valid PDF');
      }
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Failed to open PDF', err);
      setError('Unable to download quotation PDF.');
    }
  };

  const getPdfFile = async (quoteId, quoteNumber) => {
    const response = await api.get(`/quotations/${quoteId}/pdf`, { responseType: 'blob' });
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: 'application/pdf' });
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    const signature = String.fromCharCode(...header);
    if (blob.size === 0 || signature !== '%PDF-') {
      throw new Error('The server did not return a valid PDF');
    }

    return new File([blob], `quotation-${quoteNumber || 'draft'}.pdf`, { type: 'application/pdf' });
  };

  const sendQuote = async (quoteId, channel) => {
    try {
      const response = await api.post(`/quotations/${quoteId}/send`, { channel, customerId: '' });
      const payload = response.data;
      const quote = quotes.find((item) => String(item._id || item.id) === String(quoteId));
      const pdfFile = await getPdfFile(quoteId, quote?.quoteNumber);
      const shareText = payload.template || '';

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdfFile] }))) {
        await navigator.share({
          title: payload.subject || `Quotation ${quote?.quoteNumber || ''}`,
          text: shareText,
          files: [pdfFile]
        });
        return;
      }

      const downloadUrl = window.URL.createObjectURL(pdfFile);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = pdfFile.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      window.open(payload.url, '_blank', 'noopener,noreferrer');
      setError(`PDF downloaded. Attach ${pdfFile.name} in the ${channel} message.`);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to send quotation', err);
      setError('Unable to prepare quotation PDF for sending.');
    }
  };

  const triggerDelete = async (quoteId) => {
    try {
      await api.delete(`/quotations/${quoteId}`);
      setQuotes((current) => current.filter((quote) => quote._id !== quoteId && quote.id !== quoteId));
    } catch (err) {
      console.error('Failed to delete quotation', err);
      setError('Unable to delete quotation.');
    }
  };

  return (
    <PageContainer title="Quotation History">
      {error && <div style={styles.error}>{error}</div>}
      <UnifiedCard title="Saved Quotations">
        {loading ? (
          <div>Loading quotations...</div>
        ) : quotes.length === 0 ? (
          <div>No quotations saved yet.</div>
        ) : (
          <div style={styles.list}>
            {quotes.map((quote) => (
              <div key={quote._id || quote.id} style={styles.row}>
                <div style={styles.meta}>
                  <strong>{quote.quoteNumber || 'Quotation'}</strong>
                  <span>{quote.customerName || 'Walk-in Customer'}</span>
                  <small>{quote.issueDate || quote.createdAt?.slice(0, 10)}</small>
                </div>
                <div style={styles.amount}>{formatPriceMK(Number(quote.total || quote.subtotal || 0))}</div>
                <div style={styles.actions}>
                  <button type="button" style={styles.primary} onClick={() => openPdf(quote._id || quote.id)}>View PDF</button>
                  <button type="button" style={styles.secondary} onClick={() => sendQuote(quote._id || quote.id, 'email')}>Email</button>
                  <button type="button" style={styles.secondary} onClick={() => sendQuote(quote._id || quote.id, 'whatsapp')}>WhatsApp</button>
                  <button type="button" style={styles.danger} onClick={() => triggerDelete(quote._id || quote.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </UnifiedCard>
    </PageContainer>
  );
};

const styles = {
  error: {
    marginBottom: '12px',
    background: '#fff1f2',
    color: '#9f1239',
    border: '1px solid #fecdd3',
    borderRadius: '10px',
    padding: '10px 12px'
  },
  list: {
    display: 'grid',
    gap: '12px'
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '14px 16px',
    background: '#fff'
  },
  meta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '180px'
  },
  amount: {
    fontWeight: 700,
    minWidth: '100px',
    textAlign: 'right'
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  primary: {
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  secondary: {
    background: '#f3f4f6',
    color: '#111827',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  danger: {
    background: '#fff1f2',
    color: '#b91c1c',
    border: '1px solid #fecdd3',
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer'
  }
};

export default QuoteHistory;
