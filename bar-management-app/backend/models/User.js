const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['owner', 'sales', 'staff'],
    default: 'sales'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// NO pre('save') - We'll hash in the controller

const User = mongoose.model('User', UserSchema);
module.exports = User;