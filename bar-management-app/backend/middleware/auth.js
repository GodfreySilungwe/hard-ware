const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

const jwtSecret = process.env.JWT_SECRET || 'secret_key';

const normalizeRole = (value) => {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value.map(normalizeRole).find(Boolean) || null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return value.toLowerCase().trim().replace(/[_\s]+/g, '-');
};

const hasAnyRole = (user, ...allowedRoles) => {
  if (!user) return false;

  const userRoles = [];
  if (user.role) userRoles.push(user.role);
  if (Array.isArray(user.roles)) userRoles.push(...user.roles);

  const normalizedAllowed = allowedRoles.map(normalizeRole);
  return userRoles.some((role) => normalizedAllowed.includes(normalizeRole(role)));
};

const getTenantAccessMessage = (status) => {
  switch (status) {
    case 'suspended':
      return 'This hardware is suspended. Please contact support.';
    case 'deleted':
      return 'This hardware has been deleted and cannot be used.';
    default:
      return null;
  }
};

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

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account disabled' });
    }

    if (decoded.tenantId && decoded.tenantId !== (user.tenantId || null)) {
      console.error('Token tenant mismatch', { decodedTenantId: decoded.tenantId, userTenantId: user.tenantId });
      return res.status(401).json({ message: 'Not authorized, token tenant mismatch' });
    }

    let tenant = null;
    if (user.tenantId) {
      tenant = await Tenant.findById(user.tenantId);

      if (!tenant) {
        return res.status(401).json({ message: 'Tenant not found' });
      }

      const accessMessage = getTenantAccessMessage(tenant.status);
      if (accessMessage) {
        return res.status(403).json({ message: accessMessage });
      }
    }

    const safeUser = { ...user };
    delete safeUser.password;

    req.user = safeUser;
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Check if user is owner
const isOwner = (req, res, next) => {
  if (hasAnyRole(req.user, 'owner')) {
    next();
  } else {
    res.status(403).json({ message: 'Owner access required' });
  }
};

const isOwnerOrHardwareManager = (req, res, next) => {
  if (hasAnyRole(req.user, 'owner', 'hardware-manager')) {
    next();
  } else {
    res.status(403).json({ message: 'Owner or hardware manager access required' });
  }
};

const isHardwareManager = (req, res, next) => {
  if (hasAnyRole(req.user, 'hardware-manager')) {
    next();
  } else {
    res.status(403).json({ message: 'Hardware manager access required' });
  }
};

// Check if user is sales or owner
const isSalesOrOwner = (req, res, next) => {
  if (hasAnyRole(req.user, 'sales', 'owner')) {
    next();
  } else {
    res.status(403).json({ message: 'Sales or Owner access required' });
  }
};

// Check if user is a hardware manager or owner
const isHardwareManagerOrOwner = (req, res, next) => {
  if (hasAnyRole(req.user, 'hardware-manager', 'owner')) {
    next();
  } else {
    res.status(403).json({ message: 'Hardware manager or owner access required' });
  }
};

module.exports = { protect, isOwner, isOwnerOrHardwareManager, isHardwareManager, isSalesOrOwner, isHardwareManagerOrOwner };