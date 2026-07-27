const jwt = require('jsonwebtoken');
const User = require('../models/User');

const jwtSecret = process.env.JWT_SECRET || 'secret_key';

// Verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const safeUser = { ...user };
    delete safeUser.password;

    req.user = safeUser;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Check if user is owner
const isOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    next();
  } else {
    res.status(403).json({ message: 'Owner access required' });
  }
};

// Check if user is sales or owner
const isSalesOrOwner = (req, res, next) => {
  if (req.user && (req.user.role === 'sales' || req.user.role === 'owner')) {
    next();
  } else {
    res.status(403).json({ message: 'Sales or Owner access required' });
  }
};

// Check if user is a hardware manager or owner
const isHardwareManagerOrOwner = (req, res, next) => {
  if (req.user && (req.user.role === 'hardware-manager' || req.user.role === 'owner')) {
    next();
  } else {
    res.status(403).json({ message: 'Hardware manager or owner access required' });
  }
};

module.exports = { protect, isOwner, isSalesOrOwner, isHardwareManagerOrOwner };