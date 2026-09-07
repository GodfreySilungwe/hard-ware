import { useState, useEffect, useRef } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import ReceiptModal from '../components/common/ReceiptModal';
import { formatPriceMK } from '../utils/formatPrice';

const POS = () => {
  const [loadedProducts, setLoadedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [businessSettings, setBusinessSettings] = useState({ taxCompliant: false });
  const [clearCartOpen, setClearCartOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [productOffset, setProductOffset] = useState(0);
  const [visibleProductCount, setVisibleProductCount] = useState(20);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [backendSearchResults, setBackendSearchResults] = useState([]);
  const [backendSearchLoading, setBackendSearchLoading] = useState(false);
  const productGridRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    loadData();
    const savedBusiness = localStorage.getItem('businessSettings');
    if (savedBusiness) {
      try {
        setBusinessSettings(JSON.parse(savedBusiness));
      } catch (err) {
        console.error('Failed to parse business settings', err);
      }
    }

    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const loadProducts = async (offset = 0, category = selectedCategory) => {
    if (loadingProducts) return;
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('offset', String(offset));
      if (category && category !== 'all') {
        params.append('category', category);
      }
      const response = await api.get(`/products?${params.toString()}`);
      const nextProducts = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.products)
          ? response.data.products
          : [];
      setLoadedProducts((prev) => (offset === 0 ? nextProducts : [...(Array.isArray(prev) ? prev : []), ...nextProducts]));
      setProductOffset(offset + nextProducts.length);
      setHasMoreProducts(nextProducts.length === 20);
      if (offset === 0) {
        setVisibleProductCount(20);
      }
    } catch (err) {
      console.error('Error loading products:', err);
      setError('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  const resetProducts = async (category = selectedCategory) => {
    setLoadedProducts([]);
    setProductOffset(0);
    setVisibleProductCount(20);
    setHasMoreProducts(true);
    setBackendSearchResults([]);
    setSearchTerm('');
    await loadProducts(0, category);
  };

  const loadData = async () => {
    try {
      const [customersRes, categoriesRes] = await Promise.all([
        api.get('/customers'),
        api.get('/categories')
      ]);
      const customerData = customersRes.data;
      setCustomers(Array.isArray(customerData) ? customerData : Array.isArray(customerData?.customers) ? customerData.customers : []);
      setCategories(categoriesRes.data);
      await loadProducts(0, selectedCategory);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    }
  };

  const handleCategorySelect = async (categoryId) => {
    setSelectedCategory(categoryId);
    await resetProducts(categoryId);
  };

  const handleProductScroll = () => {
    if (!productGridRef.current || searchTerm.trim()) return;
    const { scrollTop, scrollHeight, clientHeight } = productGridRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (!nearBottom) return;

    if (visibleProductCount < loadedProducts.length) {
      setVisibleProductCount((prev) => Math.min(prev + 10, loadedProducts.length));
    }
    if (loadedProducts.length - visibleProductCount <= 10 && hasMoreProducts && !loadingProducts) {
      loadProducts(productOffset, selectedCategory);
    }
  };

  const playAddToCartSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = audioContextRef.current || new AudioCtx();
      audioContextRef.current = audioContext;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.12);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.25);
    } catch (err) {
      console.warn('Unable to play cart sound:', err);
    }
  };

  const addToCart = (product) => {
    if (product.currentStock <= 0) {
      setError(`⚠️ ${product.name} is out of stock!`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    const existingCartItem = cart.find(item => item._id === product._id);
    if (existingCartItem && existingCartItem.quantity >= product.currentStock) {
      setError(`⚠️ Not enough stock for ${product.name}`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        return prev.map(item =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    playAddToCartSound();
    setHighlightedProductId(product._id);
    setFeedbackMessage(`${product.name} added to cart`);

    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    feedbackTimerRef.current = window.setTimeout(() => {
      setHighlightedProductId(null);
      setFeedbackMessage('');
    }, 800);
  };

  const removeFromCart = (productId) => {
    setCart(prev => {
      const existing = prev.find(item => item._id === productId);
      if (existing && existing.quantity === 1) {
        return prev.filter(item => item._id !== productId);
      }
      return prev.map(item =>
        item._id === productId
          ? { ...item, quantity: item.quantity - 1 }
          : item
      );
    });
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setClearCartOpen(false);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
  const taxRate = 0.175;
  const discountNumber = Math.max(0, Number(discountAmount) || 0);
  const cappedDiscount = Math.min(discountNumber, subtotal);
  const discountedTotal = Math.max(0, subtotal - cappedDiscount);
  const taxAmount = businessSettings.taxCompliant ? discountedTotal - discountedTotal / (1 + taxRate) : 0;
  const netAmount = businessSettings.taxCompliant ? discountedTotal - taxAmount : discountedTotal;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const checkout = async () => {
    if (cart.length === 0) {
      setError('Cart is empty!');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const orderData = {
        items: cart.map(item => ({
          product: item._id,
          quantity: item.quantity
        })),
        customer: selectedCustomer || null,
        paymentMethod: paymentMethod,
        paidAmount: Number(paidAmount) || 0,
        discountAmount: cappedDiscount,
        taxCompliant: businessSettings.taxCompliant,
        taxAmount,
        netAmount
      };

      const response = await api.post('/orders', orderData);
      
      const createdOrder = response.data;
      const populatedOrderResponse = await api.get(`/orders/${createdOrder._id}`);
      setReceiptOrder(populatedOrderResponse.data);
      
      setSuccess(`✅ Order ${createdOrder.orderNumber} completed!`);
      setCart([]);
      setSelectedCustomer('');
      setPaymentMethod('cash');
      setDiscountAmount('');
      setPaidAmount('');

      await loadData();
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.message || 'Checkout failed!');
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const localSearchMatches = loadedProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'all'
      ? true
      : product.category?._id === selectedCategory || product.category === selectedCategory;

    const query = searchTerm.trim().toLowerCase();
    if (!matchesCategory || !query) {
      return false;
    }

    return (
      product.name?.toLowerCase().includes(query) ||
      product.unit?.toLowerCase().includes(query) ||
      product.category?.name?.toLowerCase().includes(query)
    );
  });

  const hasLocalSearchMatches = localSearchMatches.length > 0;

  useEffect(() => {
    let cancel = false;
    const query = searchTerm.trim();

    if (!query) {
      setBackendSearchResults([]);
      setBackendSearchLoading(false);
      return () => { cancel = true; };
    }

    if (hasLocalSearchMatches) {
      setBackendSearchResults([]);
      setBackendSearchLoading(false);
      return () => { cancel = true; };
    }

    const timeout = setTimeout(async () => {
      setBackendSearchLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('search', query);
        params.append('limit', '3');
        if (selectedCategory && selectedCategory !== 'all') {
          params.append('category', selectedCategory);
        }
        const response = await api.get(`/products?${params.toString()}`);
        if (!cancel) {
          setBackendSearchResults(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        console.error('Error searching products:', err);
        if (!cancel) {
          setBackendSearchResults([]);
        }
      } finally {
        if (!cancel) {
          setBackendSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancel = true;
      clearTimeout(timeout);
    };
  }, [searchTerm, selectedCategory, hasLocalSearchMatches]);

  const displayedProducts = loadedProducts.slice(0, visibleProductCount);
  const filteredProducts = searchTerm.trim()
    ? (localSearchMatches.length > 0 ? localSearchMatches : backendSearchResults)
    : displayedProducts;

  return (
    <PageContainer title="🛒 Point of Sale">
      <DeleteConfirmModal
        open={clearCartOpen}
        title="Clear cart"
        description="Type delete to remove all items from the current cart."
        onCancel={() => setClearCartOpen(false)}
        onConfirm={handleClearCart}
      />
      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
      {feedbackMessage && <div style={styles.feedbackToast}>{feedbackMessage}</div>}

      <style>{`
        .pos-mobile-sticky-total {
          display: none;
        }

        @media (max-width: 1024px) {
          .pos-mobile-category-filter {
            gap: 6px !important;
          }
          .pos-mobile-category-filter button {
            display: none !important;
          }
          .pos-mobile-category-btn {
            padding: 7px 12px !important;
            font-size: 12px !important;
          }
        }

        @media (max-width: 768px) {
          .pos-mobile-sticky-total {
            display: flex !important;
          }
          .pos-mobile-stack {
            padding-bottom: 92px;
          }
          .pos-mobile-stack {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .pos-mobile-product-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            max-height: 500px !important;
            overflow-y: auto !important;
            padding: 2px 0 !important;
          }
          .pos-mobile-cart-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
            padding: 10px 0 !important;
          }
          .pos-mobile-action-buttons {
            flex-direction: row !important;
          }
          .pos-mobile-payment-options {
            flex-wrap: wrap !important;
          }
          .pos-mobile-payment-btn {
            flex: 1 1 calc(50% - 6px) !important;
          }
        }

        @media (max-width: 480px) {
          .pos-mobile-product-grid {
            grid-template-columns: 1fr !important;
            max-height: 500px !important;
            overflow-y: auto !important;
          }
          .pos-mobile-payment-btn {
            flex-basis: 100% !important;
          }
          .pos-mobile-product-btn {
            min-height: 108px !important;
            padding: 10px !important;
          }
          .pos-mobile-cart-item-actions {
            width: 100% !important;
            justify-content: flex-end !important;
          }
        }
      `}</style>

      <div style={styles.posLayout} className="pos-mobile-stack">
        <div className="pos-mobile-sticky-total" style={styles.mobileStickyTotal}>
          <div>
            <div style={styles.mobileStickyLabel}>Cart total</div>
            <strong style={styles.mobileStickyAmount}>{formatPriceMK(discountedTotal)}</strong>
          </div>
          <span style={styles.mobileStickyItems}>{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
        </div>
        {/* Left: Product Grid */}
        <div style={styles.productSection} className="pos-mobile-product-section">
          <UnifiedCard title="Smart Inventory App">
            <div style={styles.categoryFilter} className="pos-mobile-category-filter">
              <input
                type="text"
                placeholder="Search products"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
              <button
                className="category-btn pos-mobile-category-btn"
                style={{
                  ...styles.categoryBtn,
                  ...(selectedCategory === 'all' ? styles.categoryBtnActive : {})
                }}
                onClick={() => handleCategorySelect('all')}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat._id}
                  className="category-btn pos-mobile-category-btn"
                  style={{
                    ...styles.categoryBtn,
                    ...(selectedCategory === cat._id ? styles.categoryBtnActive : {})
                  }}
                  onClick={() => handleCategorySelect(cat._id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div
              style={styles.productGrid}
              className="pos-mobile-product-grid"
              ref={productGridRef}
              onScroll={handleProductScroll}
            >
              {loadingProducts && loadedProducts.length === 0 ? (
                <div style={styles.emptyState}>Loading products...</div>
              ) : filteredProducts.length === 0 ? (
                <div style={styles.emptyState}>No Smart Inventory App products found</div>
              ) : (
                filteredProducts.map((product, index) => (
                  <button
                    key={product._id}
                    className={`fade-in delay-${(index % 6) + 1} pos-mobile-product-btn`}
                    style={{
                      ...styles.productBtn,
                      ...(product.currentStock <= 0 ? styles.productOutOfStock : {}),
                      ...(highlightedProductId === product._id ? styles.productBtnActive : {})
                    }}
                    onClick={() => addToCart(product)}
                    disabled={product.currentStock <= 0}
                    onMouseEnter={(e) => {
                      if (product.currentStock > 0) {
                        e.currentTarget.style.transform = 'translateY(-6px)';
                        e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';
                        e.currentTarget.style.borderColor = '#e94560';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                      e.currentTarget.style.borderColor = '#e0e0e0';
                    }}
                  >
                    <div style={styles.productName}>{product.name}</div>
                    <div style={styles.productPrice}>{formatPriceMK(product.sellingPrice)}</div>
                    <div style={styles.productUnit}>{product.unit || 'piece'}</div>
                    <div style={styles.productStock}>
                      {product.currentStock > 0 ? `📦 ${product.currentStock}` : '❌ Out of Stock'}
                    </div>
                  </button>
                ))
              )}
              {loadingProducts && loadedProducts.length > 0 && (
                <div style={styles.loadingMore}>Loading more products…</div>
              )}
            </div>
          </UnifiedCard>
        </div>

        {/* Right: Cart */}
        <div style={{ ...styles.cartSection, ...(feedbackMessage ? styles.cartSectionActive : {}) }} className="pos-mobile-cart-section">
          <UnifiedCard title={`🛒 Cart (${totalItems} items)`}>
            <div style={styles.customerSection}>
              <select
                style={styles.customerSelect}
                value={selectedCustomer}
                onChange={(e) => {
                  const newCustomer = e.target.value;
                  setSelectedCustomer(newCustomer);
                  if (!newCustomer && paymentMethod === 'credit') {
                    setPaymentMethod('cash');
                    setPaidAmount('');
                  }
                }}
              >
                <option value="">Walk-in Customer</option>
                {customers.map(customer => (
                  <option key={customer._id} value={customer._id}>
                    {customer.name} - {customer.phone}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.cartItems}>
              {cart.length === 0 ? (
                <div style={styles.emptyCart}>🛒 Cart is empty</div>
              ) : (
                cart.map(item => (
                  <div key={item._id} style={styles.cartItem} className="pos-mobile-cart-item">
                    <div style={styles.cartItemInfo}>
                      <div style={styles.cartItemName}>{item.name}</div>
                      <div style={styles.cartItemPrice}>
                        {formatPriceMK(item.sellingPrice)} x {item.quantity}
                      </div>
                    </div>

                    <div style={styles.cartItemActions} className="pos-mobile-cart-item-actions">
                      <button
                        style={styles.cartItemBtn}
                        onClick={() => removeFromCart(item._id)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f0f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        −
                      </button>
                      <span style={styles.cartItemQty}>{item.quantity}</span>
                      <button
                        style={styles.cartItemBtn}
                        onClick={() => addToCart(item)}
                        disabled={item.quantity >= item.currentStock}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f0f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {paymentMethod === 'credit' && cart.length > 0 && (
              <div style={styles.creditPaidSection}>
                <label style={styles.creditPaidLabel}>Amount paid (optional):</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ padding: '8px 10px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {cart.length > 0 && (
              <div style={styles.totals}>
                <div style={styles.totalRow}>
                  <span>Subtotal:</span>
                  <span style={styles.totalAmount}>{formatPriceMK(subtotal)}</span>
                </div>

                <div style={styles.discountRow}>
                  <span>Discount:</span>
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder="0.00"
                    style={styles.discountInput}
                  />
                </div>

                <div style={styles.totalRow}>
                  <span>Items:</span>
                  <span>{totalItems}</span>
                </div>

                <div style={styles.totalRowBig}>
                  <span><strong>TOTAL:</strong></span>
                  <span style={styles.totalAmount}>{formatPriceMK(discountedTotal)}</span>
                </div>
              </div>
            )}

            <div style={styles.paymentSection}>
              <label style={styles.paymentLabel}>Payment Method:</label>
              <div style={styles.paymentOptions} className="pos-mobile-payment-options">
                <button
                  className="payment-btn pos-mobile-payment-btn"
                  style={{
                    ...styles.paymentBtn,
                    ...(paymentMethod === 'cash' ? styles.paymentBtnActive : {})
                  }}
                  onClick={() => { setPaymentMethod('cash'); setPaidAmount(''); }}
                  onMouseEnter={(e) => {
                    if (paymentMethod !== 'cash') {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (paymentMethod !== 'cash') {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  💵 Cash
                </button>
                <button
                  className="payment-btn pos-mobile-payment-btn"
                  style={{
                    ...styles.paymentBtn,
                    ...(paymentMethod === 'card' ? styles.paymentBtnActive : {})
                  }}
                  onClick={() => { setPaymentMethod('card'); setPaidAmount(''); }}
                  onMouseEnter={(e) => {
                    if (paymentMethod !== 'card') {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (paymentMethod !== 'card') {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  💳 Bank
                </button>
                <button
                  className="payment-btn pos-mobile-payment-btn"
                  style={{
                    ...styles.paymentBtn,
                    ...(paymentMethod === 'airtel_money' ? styles.paymentBtnActive : {})
                  }}
                  onClick={() => { setPaymentMethod('airtel_money'); setPaidAmount(''); }}
                  onMouseEnter={(e) => {
                    if (paymentMethod !== 'airtel_money') {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (paymentMethod !== 'airtel_money') {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  📱 Airtel Money
                </button>
                <button
                  className="payment-btn pos-mobile-payment-btn"
                  style={{
                    ...styles.paymentBtn,
                    ...(paymentMethod === 'mpamba' ? styles.paymentBtnActive : {})
                  }}
                  onClick={() => { setPaymentMethod('mpamba'); setPaidAmount(''); }}
                  onMouseEnter={(e) => {
                    if (paymentMethod !== 'mpamba') {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (paymentMethod !== 'mpamba') {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  📱 Mpamba
                </button>
              <button
                className="payment-btn pos-mobile-payment-btn"
                style={{
                  ...styles.paymentBtn,
                  ...(paymentMethod === 'credit' ? styles.paymentBtnActive : {})
                }}
                onClick={() => { setPaymentMethod('credit'); setPaidAmount(''); }}
                disabled={!selectedCustomer}
                onMouseEnter={(e) => {
                  if (paymentMethod !== 'credit' && selectedCustomer) {
                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (paymentMethod !== 'credit') {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                🧾 Credit
              </button>
              </div>
            </div>

            <div style={styles.actionButtons} className="pos-mobile-action-buttons">
              <button
                className="btn-modern btn-danger-modern"
                style={styles.checkoutBtn}
                onClick={() => setClearCartOpen(true)}
                disabled={cart.length === 0}
                onMouseEnter={(e) => {
                  if (cart.length > 0) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(231, 76, 60, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                🗑️ Clear
              </button>
              <button
                className="btn-modern btn-success-modern"
                style={{
                  ...styles.checkoutBtn,
                  ...styles.checkoutBtnSuccess,
                  ...(loading ? styles.checkoutBtnLoading : {})
                }}
                onClick={checkout}
                disabled={cart.length === 0 || loading}
                onMouseEnter={(e) => {
                  if (cart.length > 0 && !loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(46, 204, 113, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? '⏳ Processing...' : `💰 Checkout ${formatPriceMK(discountedTotal)}`}
              </button>
            </div>
          </UnifiedCard>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
          businessSettings={businessSettings}
        />
      )}
    </PageContainer>
  );
};

const styles = {
  posLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: '20px',
    alignItems: 'start',
    width: '100%',
    overflowX: 'hidden'
  },
  productSection: {
    minHeight: '500px',
    width: '100%'
  },
  cartSection: {
    minHeight: '500px',
    width: '100%'
  },
  cartSectionActive: {
    animation: 'cartPulse 0.6s ease'
  },
  mobileStickyTotal: {
    position: 'fixed',
    left: '12px',
    right: '12px',
    bottom: '12px',
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: '12px',
    backgroundColor: '#1a1a2e',
    color: 'white',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
  },
  mobileStickyLabel: {
    fontSize: '11px',
    opacity: 0.75,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  },
  mobileStickyAmount: {
    display: 'block',
    marginTop: '2px',
    fontSize: '18px',
    color: '#ffd166'
  },
  mobileStickyItems: {
    fontSize: '13px',
    opacity: 0.85
  },
  categoryFilter: {
    display: 'flex',
    gap: '8px',
    marginBottom: '15px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  searchInput: {
    flex: '1 1 220px',
    minWidth: '0',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    minHeight: '38px'
  },
  categoryBtn: {
    padding: '6px 16px',
    borderRadius: '20px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.3s ease',
    minHeight: '38px'
  },
  categoryBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  productGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
    maxHeight: '500px',
    overflowY: 'auto',
    padding: '2px',
    width: '100%'
  },
  productBtn: {
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    width: '100%',
    minHeight: '120px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
  },
  productOutOfStock: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  productBtnActive: {
    transform: 'scale(1.02)',
    boxShadow: '0 0 0 3px rgba(46, 204, 113, 0.22)',
    borderColor: '#2ecc71',
    backgroundColor: '#f5fff9'
  },
  productName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1a1a2e'
  },
  productPrice: {
    fontSize: '16px',
    color: '#e94560',
    fontWeight: 'bold',
    marginTop: '4px'
  },
productUnit: {
  fontSize: '11px',
  color: '#999',
  marginTop: '2px',
  textTransform: 'capitalize'
},
  productStock: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px'
  },
  emptyState: {
    textAlign: 'center',
    color: '#888',
    padding: '40px 0',
    gridColumn: '1 / -1'
  },
  loadingMore: {
    textAlign: 'center',
    color: '#666',
    padding: '12px 0',
    gridColumn: '1 / -1'
  },
  customerSection: {
    marginBottom: '15px'
  },
  creditPaidSection: {
    marginBottom: '15px'
  },
  creditPaidLabel: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500'
  },
  customerSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    backgroundColor: 'white'
  },
  cartItems: {
    maxHeight: '280px',
    overflowY: 'auto',
    marginBottom: '15px'
  },
  emptyCart: {
    textAlign: 'center',
    color: '#888',
    padding: '30px 0'
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  cartItemInfo: {
    flex: 1
  },
  cartItemName: {
    fontSize: '14px',
    fontWeight: '500'
  },
  cartItemPrice: {
    fontSize: '12px',
    color: '#888'
  },
  cartItemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  cartItemBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease'
  },
  cartItemQty: {
    fontWeight: 'bold',
    minWidth: '20px',
    textAlign: 'center'
  },
  totals: {
    padding: '12px 0',
    borderTop: '2px solid #e0e0e0',
    marginBottom: '15px'
  },
  discountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '16px',
    padding: '4px 0',
    gap: '12px'
  },
  discountInput: {
    width: '120px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    textAlign: 'right',
    backgroundColor: '#fbfbfb'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '16px',
    padding: '4px 0'
  },
  totalAmount: {
    fontWeight: 'bold',
    color: '#e94560',
    fontSize: '20px'
  },
  paymentSection: {
    marginBottom: '15px'
  },
  paymentLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '8px'
  },
  paymentOptions: {
    display: 'flex',
    gap: '8px'
  },
  paymentBtn: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    flex: 1,
    minHeight: '44px',
    transition: 'all 0.3s ease'
  },
  paymentBtnActive: {
    backgroundColor: '#e94560',
    color: 'white',
    borderColor: '#e94560'
  },
  actionButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  checkoutBtn: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    width: '100%',
    minHeight: '48px'
  },
  checkoutBtnSuccess: {
    backgroundColor: '#2ecc71',
    color: 'white'
  },
  checkoutBtnLoading: {
    opacity: 0.7,
    cursor: 'wait'
  },
  feedbackToast: {
    backgroundColor: '#eaf8ee',
    color: '#1f7a3d',
    padding: '10px 14px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #bfe8c8',
    fontWeight: '600'
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #f5c6cb'
  },
  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #c3e6cb'
  }
};

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes cartPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.01); box-shadow: 0 0 0 4px rgba(46, 204, 113, 0.12); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(styleSheet);

export default POS;