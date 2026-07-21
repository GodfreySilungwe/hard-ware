const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  costPrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currentStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 5,
    min: 0
  },
  unit: {
    type: String,
    enum: ['piece', 'box', 'pack', 'meter', 'liter', 'kg', 'roll'],
    default: 'piece'
  },
  barcode: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Product = mongoose.model('Product', ProductSchema);
module.exports = Product;