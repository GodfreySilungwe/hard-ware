import { useState, useEffect } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import ReceiptModal from '../components/common/ReceiptModal';
import { formatPriceMK } from '../utils/formatPrice';

const POS = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [clearCartOpen, setClearCartOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [productsRes, customersRes, categoriesRes] = await Promise.all([
        api.get('/products'),
        api.get('/customers'),
        api.get('/categories')
      ]);
      setProducts(productsRes.data);
      setCustomers(customersRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    }
  };

  const addToCart = (product) => {
    if (product.currentStock <= 0) {
      setError(`⚠️ ${product.name} is out of stock!`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          setError(`⚠️ Not enough stock for ${product.name}`);
          setTimeout(() => setError(''), 3000);
          return prev;
        }
        return prev.map(item =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
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
        paymentMethod: paymentMethod
      };

      const response = await api.post('/orders', orderData);
      
      const newOrder = response.data;
      setReceiptOrder(newOrder);
      
      setSuccess(`✅ Order ${newOrder.orderNumber} completed!`);
      setCart([]);
      setSelectedCustomer('');
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

  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === 'all'
      ? true
      : product.category?._id === selectedCategory || product.category === selectedCategory;

    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query ||
      product.name?.toLowerCase().includes(query) ||
      product.unit?.toLowerCase().includes(query) ||
      product.category?.name?.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

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

      <style>{`
        @media (max-width: 768px) {
          .pos-mobile-stack {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .pos-mobile-product-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            max-height: none !important;
            padding: 2px 0 !important;
          }
          .pos-mobile-category-filter {
            gap: 6px !important;
          }
          .pos-mobile-category-btn {
            padding: 7px 12px !important;
            font-size: 12px !important;
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
        {/* Left: Product Grid */}
        <div style={styles.productSection} className="pos-mobile-product-section">
          <UnifiedCard title="Hardware Products">
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
                onClick={() => setSelectedCategory('all')}
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
                  onClick={() => setSelectedCategory(cat._id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div style={styles.productGrid} className="pos-mobile-product-grid">
              {filteredProducts.map((product, index) => (
                <button
                  key={product._id}
                  className={`fade-in delay-${(index % 6) + 1} pos-mobile-product-btn`}
                  style={{
                    ...styles.productBtn,
                    ...(product.currentStock <= 0 ? styles.productOutOfStock : {})
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
              ))}
              {filteredProducts.length === 0 && (
                <div style={styles.emptyState}>No hardware products found</div>
              )}
            </div>
          </UnifiedCard>
        </div>

        {/* Right: Cart */}
        <div style={styles.cartSection} className="pos-mobile-cart-section">
          <UnifiedCard title={`🛒 Cart (${totalItems} items)`}>
            <div style={styles.customerSection}>
              <select
                style={styles.customerSelect}
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
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

            {cart.length > 0 && (
              <div style={styles.totals}>
                <div style={styles.totalRow}>
                  <span>Subtotal:</span>
                  <span style={styles.totalAmount}>{formatPriceMK(subtotal)}</span>
                </div>
                <div style={styles.totalRow}>
                  <span>Items:</span>
                  <span>{totalItems}</span>
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
                  onClick={() => setPaymentMethod('cash')}
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
                  onClick={() => setPaymentMethod('card')}
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
                  💳 Card
                </button>
                <button
                  className="payment-btn pos-mobile-payment-btn"
                  style={{
                    ...styles.paymentBtn,
                    ...(paymentMethod === 'mobile_money' ? styles.paymentBtnActive : {})
                  }}
                  onClick={() => setPaymentMethod('mobile_money')}
                  onMouseEnter={(e) => {
                    if (paymentMethod !== 'mobile_money') {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (paymentMethod !== 'mobile_money') {
                      e.currentTarget.style.backgroundColor = 'white';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  📱 Mobile Money
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
                {loading ? '⏳ Processing...' : `💰 Checkout ${formatPriceMK(subtotal)}`}
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
  customerSection: {
    marginBottom: '15px'
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

export default POS;