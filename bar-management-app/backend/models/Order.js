const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  priceAtSale: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  }
});

// Generate order number function
function generateOrderNumber() {
  const date = new Date();
  const prefix = 'ORD';
  const timestamp = date.getFullYear().toString().slice(2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
}

const OrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    default: generateOrderNumber
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  items: {
    type: [OrderItemSchema],
    required: true,
    default: []
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  profit: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'mobile_money', 'credit'],
    required: true
  }
}, {
  timestamps: true
});

// Remove pre-save hook - using default instead

const Order = mongoose.model('Order', OrderSchema);
module.exports = Order;