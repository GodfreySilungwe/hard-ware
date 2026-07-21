const mongoose = require('mongoose');

const InventoryAdjustmentSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  type: {
    type: String,
    enum: ['wastage', 'damage', 'return', 'restock', 'count_correction'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  previousStock: {
    type: Number,
    required: true
  },
  newStock: {
    type: Number,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const InventoryAdjustment = mongoose.model('InventoryAdjustment', InventoryAdjustmentSchema);
module.exports = InventoryAdjustment;