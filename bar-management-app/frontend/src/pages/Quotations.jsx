import { useEffect, useMemo, useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import { formatPriceMK } from '../utils/formatPrice';

const defaultBusinessSettings = {
  name: 'Smart Inventory App',
  address: '',
  phone: '',
  email: '',
  taxCompliant: false
};

const buildQuoteNumber = () => {
  const date = new Date();
  const stamp = date.toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `QT-${stamp}-${random}`;
};

const makeLineItem = (product = null) => ({
  id: String(Date.now() + Math.random()),
  productId: product?._id || product?.id || '',
  name: product?.name || '',
  qty: 1,
  unitPrice: Number(product?.sellingPrice || product?.costPrice || 0)
});

const getBusinessSettings = () => {
  if (typeof window === 'undefined') return defaultBusinessSettings;
  try {
    const saved = localStorage.getItem('businessSettings');
    return saved ? { ...defaultBusinessSettings, ...JSON.parse(saved) } : defaultBusinessSettings;
  } catch (error) {
    console.error('Failed to read business settings', error);
    return defaultBusinessSettings;
  }
};

const formatCurrency = (value) => formatPriceMK(Number(value || 0));

const Quotations = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [businessSettings, setBusinessSettings] = useState(defaultBusinessSettings);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [savedQuotes, setSavedQuotes] = useState([]);
  const [quote, setQuote] = useState({
    quoteNumber: buildQuoteNumber(),
    issueDate: today,
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    notes: '',
    taxRate: 0,
    items: [makeLineItem()]
  });
  const [message, setMessage] = useState('');
  const [customers, setCustomers] = useState([]);
  const [previewQuote, setPreviewQuote] = useState(null);

  useEffect(() => {
    setBusinessSettings(getBusinessSettings());
    const saved = localStorage.getItem('savedQuotes');
    if (saved) {
      try {
        setSavedQuotes(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to parse saved quotes', error);
      }
    }
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get('/products');
        const list = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.products)
            ? response.data.products
            : [];
        setProducts(list);
      } catch (error) {
        console.error('Failed to load products for quotations', error);
      }
    };

    const fetchCustomers = async () => {
      try {
        const response = await api.get('/customers');
        const list = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.customers)
            ? response.data.customers
            : [];
        setCustomers(list);
      } catch (error) {
        console.error('Failed to load customers for quotations', error);
      }
    };

    fetchProducts();
    fetchCustomers();
  }, []);

  useEffect(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) {
      setSearchResults([]);
      return;
    }

    const filtered = products.filter((product) => {
      const name = String(product?.name || '').toLowerCase();
      const code = String(product?.sku || product?.code || '').toLowerCase();
      return name.includes(term) || code.includes(term);
    }).slice(0, 8);

    setSearchResults(filtered);
  }, [productSearch, products]);

  const subtotal = useMemo(
    () => quote.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0),
    [quote.items]
  );

  const taxAmount = useMemo(
    () => subtotal * (Number(quote.taxRate || 0) / 100),
    [subtotal, quote.taxRate]
  );

  const total = subtotal + taxAmount;

  const updateQuoteField = (field, value) => {
    setQuote((current) => ({ ...current, [field]: value }));
  };

  const updateLineItem = (id, field, value) => {
    setQuote((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, [field]: field === 'qty' || field === 'unitPrice' ? Number(value || 0) : value } : item)
    }));
  };

  const addItem = (product = null) => {
    setQuote((current) => ({
      ...current,
      items: [...current.items, makeLineItem(product)]
    }));
  };

  const removeItem = (id) => {
    setQuote((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id)
    }));
  };

  const handleSelectProduct = (product) => {
    addItem(product);
    setProductSearch('');
    setSearchResults([]);
  };

  const saveDraftQuote = async () => {
    const payload = {
      ...quote,
      businessName: businessSettings.name || 'Smart Inventory App',
      businessAddress: businessSettings.address || '',
      businessPhone: businessSettings.phone || '',
      businessEmail: businessSettings.email || '',
      status: quote.status || 'draft',
      customerId: quote.customerId || '',
      taxRate: Number(quote.taxRate || 0),
      items: quote.items.filter((item) => item.name || item.productId)
    };

    try {
      const response = await api.post('/quotations', payload);
      const saved = response.data || payload;
      const existing = JSON.parse(localStorage.getItem('savedQuotes') || '[]');
      const next = [saved, ...existing.filter((item) => item.quoteNumber !== saved.quoteNumber)].slice(0, 20);
      localStorage.setItem('savedQuotes', JSON.stringify(next));
      setSavedQuotes(next);
      setQuote({ ...saved, items: saved.items?.length ? saved.items : payload.items });
      setPreviewQuote(saved);
      setMessage('✅ Quote saved to the backend.');
      setTimeout(() => setMessage(''), 2200);
    } catch (error) {
      console.error('Failed to save quotation', error);
      const existing = JSON.parse(localStorage.getItem('savedQuotes') || '[]');
      const next = [payload, ...existing.filter((item) => item.quoteNumber !== payload.quoteNumber)].slice(0, 20);
      localStorage.setItem('savedQuotes', JSON.stringify(next));
      setSavedQuotes(next);
      setMessage('⚠️ Saved locally; backend save failed.');
      setTimeout(() => setMessage(''), 2600);
    }
  };

  const exportQuoteToPdf = async () => {
    try {
      let quoteId = quote._id || quote.id;

      if (!quoteId) {
        const payload = {
          ...quote,
          businessName: businessSettings.name || 'Smart Inventory App',
          businessAddress: businessSettings.address || '',
          businessPhone: businessSettings.phone || '',
          businessEmail: businessSettings.email || '',
          status: quote.status || 'draft',
          customerId: quote.customerId || '',
          taxRate: Number(quote.taxRate || 0),
          items: quote.items.filter((item) => item.name || item.productId)
        };
        const response = await api.post('/quotations', payload);
        const saved = response.data || payload;
        quoteId = saved._id || saved.id;
        setQuote({ ...saved, items: saved.items?.length ? saved.items : payload.items });
      }

      if (!quoteId) throw new Error('Quotation was not assigned an ID');

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
      const link = document.createElement('a');
      link.href = url;
      link.download = `quotation-${quote.quoteNumber || 'draft'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('PDF downloaded.');
      setTimeout(() => setMessage(''), 2200);
    } catch (error) {
      console.error('Failed to export quotation PDF', error);
      setMessage('Unable to download quotation PDF.');
    }
  };

  const getQuotePdfFile = async () => {
    let quoteId = quote._id || quote.id;
    let currentQuote = quote;

    if (!quoteId) {
      const payload = {
        ...quote,
        businessName: businessSettings.name || 'Smart Inventory App',
        businessAddress: businessSettings.address || '',
        businessPhone: businessSettings.phone || '',
        businessEmail: businessSettings.email || '',
        status: quote.status || 'draft',
        customerId: quote.customerId || '',
        taxRate: Number(quote.taxRate || 0),
        items: quote.items.filter((item) => item.name || item.productId)
      };
      const response = await api.post('/quotations', payload);
      currentQuote = response.data || payload;
      quoteId = currentQuote._id || currentQuote.id;
      setQuote({ ...currentQuote, items: currentQuote.items?.length ? currentQuote.items : payload.items });
    }

    if (!quoteId) throw new Error('Quotation was not assigned an ID');

    const response = await api.get(`/quotations/${quoteId}/pdf`, { responseType: 'blob' });
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: 'application/pdf' });
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    const signature = String.fromCharCode(...header);
    if (blob.size === 0 || signature !== '%PDF-') {
      throw new Error('The server did not return a valid PDF');
    }

    return {
      quote: currentQuote,
      file: new File([blob], `quotation-${currentQuote.quoteNumber || quote.quoteNumber || 'draft'}.pdf`, { type: 'application/pdf' })
    };
  };

  const shareToWhatsApp = async () => {
    const lineItems = quote.items
      .filter((item) => item.name || item.productId)
      .map((item) => `- ${item.name || 'Item'} x${item.qty}: ${formatCurrency(item.qty * item.unitPrice)}`)
      .join('\n');

    const text = [
      `Quote ${quote.quoteNumber}`,
      `Customer: ${quote.customerName || 'Walk-in Customer'}`,
      `Valid until: ${quote.validUntil}`,
      '',
      lineItems || '- No items added',
      '',
      `Subtotal: ${formatCurrency(subtotal)}`,
      quote.taxRate ? `Tax (${quote.taxRate}%): ${formatCurrency(taxAmount)}` : '',
      `Total: ${formatCurrency(total)}`,
      '',
      `Thanks from ${businessSettings.name || 'Smart Inventory App'}`
    ].filter(Boolean).join('\n');

    try {
      const { quote: savedQuote, file } = await getQuotePdfFile();
      const encoded = encodeURIComponent(text);
      const phoneDigits = (savedQuote.customerPhone || quote.customerPhone || '').replace(/\D/g, '');
      const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: `Quotation ${savedQuote.quoteNumber || quote.quoteNumber || ''}`,
          text,
          files: [file]
        });
        return;
      }

      const downloadUrl = window.URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setMessage(`PDF downloaded. Attach ${file.name} in WhatsApp.`);
      setTimeout(() => setMessage(''), 3500);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Failed to share quotation PDF on WhatsApp', error);
      setMessage('Unable to prepare quotation PDF for WhatsApp.');
    }
  };

  const updateCustomerSelection = (customerId) => {
    const selectedCustomer = customers.find((customer) => String(customer._id || customer.id) === String(customerId));
    if (!selectedCustomer) {
      setQuote((current) => ({ ...current, customerId: '', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '' }));
      return;
    }

    setQuote((current) => ({
      ...current,
      customerId: selectedCustomer._id || selectedCustomer.id || '',
      customerName: selectedCustomer.name || '',
      customerPhone: selectedCustomer.phone || '',
      customerEmail: selectedCustomer.email || '',
      customerAddress: selectedCustomer.address || ''
    }));
  };

  const applyStatus = (status) => {
    setQuote((current) => ({ ...current, status }));
    setPreviewQuote((current) => (current ? { ...current, status } : current));
  };

  const resetQuote = () => {
    setQuote({
      quoteNumber: buildQuoteNumber(),
      issueDate: today,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      notes: '',
      taxRate: 0,
      status: 'draft',
      items: [makeLineItem()]
    });
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #quotation-print-area, #quotation-print-area * { visibility: visible; }
          #quotation-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 18px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <PageContainer title="Quotations">
        <div className="no-print quotation-toolbar" style={styles.toolbar}>
          <button type="button" className="quote-action" style={styles.primaryButton} onClick={saveDraftQuote}>Save Quote</button>
          <button type="button" className="quote-action" style={styles.secondaryButton} onClick={exportQuoteToPdf}>Export to PDF</button>
          <button type="button" className="quote-action" style={styles.secondaryButton} onClick={shareToWhatsApp}>Send on WhatsApp</button>
          <button type="button" className="quote-action" style={styles.secondaryButton} onClick={resetQuote}>New Quote</button>
        </div>

        {message && <div style={styles.message}>{message}</div>}

        <div className="quotation-grid" style={styles.grid}>
          <UnifiedCard title="Quote Details">
            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span>Quote #</span>
                <input value={quote.quoteNumber} onChange={(e) => updateQuoteField('quoteNumber', e.target.value)} style={styles.input} />
              </label>
              <label style={styles.field}>
                <span>Status</span>
                <select value={quote.status || 'draft'} onChange={(e) => applyStatus(e.target.value)} style={styles.input}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="approved">Approved</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label style={styles.field}>
                <span>Issue Date</span>
                <input type="date" value={quote.issueDate} onChange={(e) => updateQuoteField('issueDate', e.target.value)} style={styles.input} />
              </label>
              <label style={styles.field}>
                <span>Valid Until</span>
                <input type="date" value={quote.validUntil} onChange={(e) => updateQuoteField('validUntil', e.target.value)} style={styles.input} />
              </label>
              <label style={styles.field}>
                <span>Tax Rate (%)</span>
                <input type="number" min="0" step="0.01" value={quote.taxRate} onChange={(e) => updateQuoteField('taxRate', e.target.value)} style={styles.input} />
              </label>
            </div>
          </UnifiedCard>

          <UnifiedCard title="Customer Details">
            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span>Customer Lookup</span>
                <select value={quote.customerId || ''} onChange={(e) => updateCustomerSelection(e.target.value)} style={styles.input}>
                  <option value="">-- Select customer --</option>
                  {customers.map((customer) => (
                    <option key={customer._id || customer.id} value={customer._id || customer.id}>
                      {customer.name || customer.fullName || 'Customer'}
                    </option>
                  ))}
                </select>
              </label>
              <label style={styles.field}>
                <span>Customer Name</span>
                <input value={quote.customerName} onChange={(e) => updateQuoteField('customerName', e.target.value)} style={styles.input} />
              </label>
              <label style={styles.field}>
                <span>Phone</span>
                <input value={quote.customerPhone} onChange={(e) => updateQuoteField('customerPhone', e.target.value)} style={styles.input} />
              </label>
              <label style={styles.field}>
                <span>Email</span>
                <input type="email" value={quote.customerEmail} onChange={(e) => updateQuoteField('customerEmail', e.target.value)} style={styles.input} />
              </label>
              <label style={styles.field}>
                <span>Address</span>
                <input value={quote.customerAddress} onChange={(e) => updateQuoteField('customerAddress', e.target.value)} style={styles.input} />
              </label>
            </div>
          </UnifiedCard>
        </div>

          <UnifiedCard title="Quote Items">
          <div style={{ marginBottom: '16px' }}>
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products to add to quote"
              style={{ ...styles.input, marginBottom: '8px' }}
            />
            {searchResults.length > 0 && (
              <div style={styles.searchResults}>
                {searchResults.map((product) => (
                  <button type="button" key={product._id || product.id} style={styles.searchResult} onClick={() => handleSelectProduct(product)}>
                    <span>{product.name}</span>
                    <small>{formatCurrency(product.sellingPrice || product.costPrice || 0)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="quotation-table-wrap" style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Item</th>
                  <th style={styles.th}>Qty</th>
                  <th style={styles.th}>Unit Price</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, index) => (
                  <tr key={item.id}>
                    <td style={styles.td}>
                      <input
                        value={item.name}
                        placeholder="Item description"
                        onChange={(e) => updateLineItem(item.id, 'name', e.target.value)}
                        style={{ ...styles.input, width: '100%' }}
                      />
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="1" value={item.qty} onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)} style={{ ...styles.input, width: '80px' }} />
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateLineItem(item.id, 'unitPrice', e.target.value)} style={{ ...styles.input, width: '120px' }} />
                    </td>
                    <td style={styles.td}>{formatCurrency((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}</td>
                    <td style={styles.td}>
                      <button type="button" style={styles.deleteButton} onClick={() => removeItem(item.id)} disabled={quote.items.length === 1}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '12px' }}>
            <button type="button" style={styles.secondaryButton} onClick={() => setPreviewQuote(quote)}>Preview Quote</button>
            <button type="button" style={styles.primaryButton} onClick={() => addItem()}>Add Line Item</button>
          </div>
        </UnifiedCard>

        {previewQuote && (
          <UnifiedCard title="Quote Detail Preview">
            <div className="quotation-preview-header" style={styles.previewHeader}>
              <div>
                <strong>{previewQuote.quoteNumber || 'Quote'}</strong>
                <div style={{ color: '#6b7280', fontSize: '12px' }}>{previewQuote.customerName || 'Walk-in Customer'}</div>
              </div>
              <div style={{ ...styles.statusBadge, background: previewQuote.status === 'accepted' ? '#dcfce7' : previewQuote.status === 'rejected' ? '#fee2e2' : previewQuote.status === 'approved' ? '#dbeafe' : '#f3f4f6', color: previewQuote.status === 'accepted' ? '#166534' : previewQuote.status === 'rejected' ? '#991b1b' : '#1f2937' }}>
                {String(previewQuote.status || 'draft').toUpperCase()}
              </div>
            </div>

            <div className="quotation-preview-grid" style={styles.previewGrid}>
              <div><strong>Issue date:</strong> {previewQuote.issueDate}</div>
              <div><strong>Valid until:</strong> {previewQuote.validUntil}</div>
              <div><strong>Phone:</strong> {previewQuote.customerPhone || '—'}</div>
              <div><strong>Email:</strong> {previewQuote.customerEmail || '—'}</div>
            </div>

            <div className="quotation-summary" style={styles.summaryBox}>
              <div style={styles.summaryRow}><span>Subtotal</span><strong>{formatCurrency(previewQuote.subtotal || subtotal)}</strong></div>
              {Number(previewQuote.taxRate || quote.taxRate || 0) > 0 && (
                <div style={styles.summaryRow}><span>Tax ({previewQuote.taxRate || quote.taxRate}%)</span><strong>{formatCurrency(previewQuote.taxAmount || taxAmount)}</strong></div>
              )}
              <div style={{ ...styles.summaryRow, fontSize: '20px', fontWeight: 700 }}>
                <span>Total</span>
                <span>{formatCurrency(previewQuote.total || total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" style={styles.secondaryButton} onClick={() => window.print()}>Print Preview</button>
              <button type="button" style={styles.primaryButton} onClick={() => setPreviewQuote(null)}>Close</button>
            </div>
          </UnifiedCard>
        )}

        <UnifiedCard title="Quote Summary">
          <textarea
            value={quote.notes}
            onChange={(e) => updateQuoteField('notes', e.target.value)}
            placeholder="Optional notes, terms, or delivery instructions"
            style={{ ...styles.input, minHeight: '120px', resize: 'vertical', width: '100%' }}
          />

          <div id="quotation-print-area" className="quotation-print-area" style={styles.printArea}>
            <div className="quotation-company-header" style={styles.companyHeader}>
              <div>
                <h2 className="companyName" style={styles.companyName}>{businessSettings.name || 'Smart Inventory App'}</h2>
                {businessSettings.address && <div>{businessSettings.address}</div>}
                {businessSettings.phone && <div>{businessSettings.phone}</div>}
                {businessSettings.email && <div>{businessSettings.email}</div>}
              </div>
              <div className="quotation-header-card" style={styles.quoteHeaderCard}>
                <div style={{ fontWeight: 700, fontSize: '22px', marginBottom: '8px' }}>QUOTE/INV</div>
                <div><strong>Quote #:</strong> {quote.quoteNumber}</div>
                <div><strong>Issue Date:</strong> {quote.issueDate}</div>
                <div><strong>Valid Until:</strong> {quote.validUntil}</div>
              </div>
            </div>

            <div style={styles.customerBlock}>
              <div><strong>Customer:</strong> {quote.customerName || 'Walk-in Customer'}</div>
              {quote.customerPhone && <div><strong>Phone:</strong> {quote.customerPhone}</div>}
              {quote.customerEmail && <div><strong>Email:</strong> {quote.customerEmail}</div>}
              {quote.customerAddress && <div><strong>Address:</strong> {quote.customerAddress}</div>}
            </div>

            <table style={styles.printTable}>
              <thead>
                <tr>
                  <th style={styles.printTh}>Item</th>
                  <th style={styles.printTh}>Qty</th>
                  <th style={styles.printTh}>Rate</th>
                  <th style={styles.printTh}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.printTd}>{item.name || 'Untitled item'}</td>
                    <td style={styles.printTd}>{item.qty}</td>
                    <td style={styles.printTd}>{formatCurrency(item.unitPrice)}</td>
                    <td style={styles.printTd}>{formatCurrency((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="quotation-summary" style={styles.summaryBox}>
              <div style={styles.summaryRow}><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
              {Number(quote.taxRate || 0) > 0 && (
                <div style={styles.summaryRow}><span>Tax ({quote.taxRate}%)</span><strong>{formatCurrency(taxAmount)}</strong></div>
              )}
              <div style={{ ...styles.summaryRow, fontSize: '20px', fontWeight: 700 }}>
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {quote.notes && (
              <div style={styles.notesBox}>
                <strong>Notes:</strong>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>{quote.notes}</div>
              </div>
            )}

            <div style={styles.signatureBlock}>
              <div style={styles.signatureTitle}>Director</div>
              <div style={styles.signatureLine}>________________________________________</div>
              <div style={styles.signatureLabel}>Signature</div>
            </div>

            <div style={styles.footerNote}>
              Thank you for the opportunity to serve you. This quotation is valid for the stated period.
            </div>
          </div>
        </UnifiedCard>

        {savedQuotes.length > 0 && (
          <UnifiedCard title="Saved Drafts">
            <div style={styles.savedList}>
              {savedQuotes.map((savedQuote) => (
                <button type="button" key={savedQuote.quoteNumber} style={styles.savedItem} onClick={() => setQuote(savedQuote)}>
                  <span>{savedQuote.quoteNumber}</span>
                  <small>{savedQuote.customerName || 'Walk-in Customer'}</small>
                </button>
              ))}
            </div>
          </UnifiedCard>
        )}
      </PageContainer>
    </>
  );
};

const styles = {
  toolbar: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '18px'
  },
  primaryButton: {
    background: '#1f2937',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 600
  },
  secondaryButton: {
    background: '#f3f4f6',
    color: '#111827',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 600
  },
  message: {
    background: '#ecfdf5',
    color: '#065f46',
    padding: '10px 14px',
    borderRadius: '10px',
    marginBottom: '16px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '18px',
    marginBottom: '18px'
  },
  formGrid: {
    display: 'grid',
    gap: '14px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontWeight: 600,
    color: '#374151'
  },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    padding: '10px 12px',
    fontSize: '14px',
    background: '#fff'
  },
  tableWrap: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '10px'
  },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    color: '#374151',
    borderBottom: '1px solid #e5e7eb'
  },
  td: {
    padding: '10px 8px',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'top'
  },
  deleteButton: {
    border: '1px solid #ef4444',
    background: '#fff1f2',
    color: '#b91c1c',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer'
  },
  searchResults: {
    display: 'grid',
    gap: '8px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '8px'
  },
  searchResult: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer'
  },
  printArea: {
    marginTop: '24px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    padding: '28px',
    color: '#1f2937'
  },
  companyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '24px',
    alignItems: 'flex-start',
    marginBottom: '18px',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '18px'
  },
  companyName: {
    margin: 0,
    fontSize: '30px',
    fontWeight: 800,
    color: '#111827'
  },
  quoteHeaderCard: {
    background: '#111827',
    color: '#fff',
    padding: '14px 18px',
    borderRadius: '12px',
    minWidth: '220px'
  },
  customerBlock: {
    display: 'grid',
    gap: '6px',
    marginBottom: '18px',
    paddingBottom: '18px',
    borderBottom: '1px solid #e5e7eb'
  },
  printTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '20px'
  },
  printTh: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '1px solid #d1d5db',
    background: '#f3f4f6',
    fontWeight: 700
  },
  printTd: {
    padding: '10px 8px',
    borderBottom: '1px solid #f3f4f6'
  },
  summaryBox: {
    width: '320px',
    marginLeft: 'auto',
    display: 'grid',
    gap: '10px',
    borderTop: '2px solid #111827',
    paddingTop: '16px'
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px'
  },
  notesBox: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: '16px',
    marginTop: '20px',
    color: '#374151'
  },
  signatureBlock: {
    width: '240px',
    marginTop: '42px',
    color: '#1f2937'
  },
  signatureTitle: {
    fontWeight: 700,
    marginBottom: '32px'
  },
  signatureLine: {
    fontSize: '12px',
    whiteSpace: 'nowrap'
  },
  signatureLabel: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#6b7280'
  },
  footerNote: {
    marginTop: '28px',
    textAlign: 'center',
    color: '#6b7280',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '18px'
  },
  savedList: {
    display: 'grid',
    gap: '10px'
  },
  savedItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '10px 12px',
    cursor: 'pointer'
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '18px'
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '18px'
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 10px',
    borderRadius: '999px',
    fontWeight: 700,
    fontSize: '11px'
  }
};

export default Quotations;
