const mongoose = require('mongoose');

const PurchaseOrderItemSchema = new mongoose.Schema({
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
  costPrice: {
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
const generateOrderNumber = () => {
  const date = new Date();
  const prefix = 'PO';
  const timestamp = date.getFullYear().toString().slice(2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
};

const PurchaseOrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    default: generateOrderNumber
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  items: {
    type: [PurchaseOrderItemSchema],
    required: true,
    default: []
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'ordered', 'received', 'cancelled'],
    default: 'pending'
  },
  expectedDelivery: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  receivedDate: {
    type: Date
  }
}, {
  timestamps: true
});

const PurchaseOrder = mongoose.model('PurchaseOrder', PurchaseOrderSchema);
module.exports = PurchaseOrder;