const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const TenantInvite = require('../models/TenantInvite');
const dynamodb = require('../lib/dynamodb');
const { protect, isOwner } = require('../middleware/auth');

const jwtSecret = process.env.JWT_SECRET || 'secret_key';

function getTenantAccessMessage(status) {
  switch (status) {
    case 'suspended':
      return 'This hardware is suspended. Please contact support.';
    case 'deleted':
      return 'This hardware has been deleted and cannot be used.';
    default:
      return null;
  }
}

function getOwnerConfig() {
  return {
    username: process.env.DEFAULT_OWNER_USERNAME || 'gsilungwe',
    email: process.env.DEFAULT_OWNER_EMAIL || 'silungwegod@gmail.com',
    password: process.env.DEFAULT_OWNER_PASSWORD || 'Password123',
    fullName: process.env.DEFAULT_OWNER_FULL_NAME || 'Godfrey Silungwe',
    phone: process.env.DEFAULT_OWNER_PHONE || '0995718815',
    role: 'owner'
  };
}

function shouldPromoteToOwner(user, ownerConfig = getOwnerConfig()) {
  if (!user) return false;

  if (user.role === 'owner') return true;
  if (user.role === 'hardware-manager') return false;

  const normalizedUsername = (user.username || '').toLowerCase();
  const normalizedEmail = (user.email || '').toLowerCase();
  const ownerUsername = (ownerConfig?.username || '').toLowerCase();
  const ownerEmail = (ownerConfig?.email || '').toLowerCase();

  return normalizedUsername === ownerUsername || normalizedEmail === ownerEmail;
}

async function deleteTenantAndRelatedData(tenantId, userId = null) {
  if (!tenantId && !userId) return;

  const entityTypes = ['tenant', 'tenantinvite', 'user', 'category', 'customer', 'inventoryadjustment', 'order', 'product', 'purchaseorder', 'supplier'];

  for (const entityType of entityTypes) {
    const records = await dynamodb.listEntities(entityType);
    const matches = (records || []).filter((record) => {
      const recordTenantId = record?.tenantId || null;
      const recordOwnerId = record?.ownerId || null;
      const recordId = record?.id || record?._id || null;

      return (
        (tenantId && recordTenantId === tenantId) ||
        (userId && (recordOwnerId === userId || recordId === userId))
      );
    });

    for (const record of matches) {
      const recordId = record?.id || record?._id;
      if (recordId) {
        await dynamodb.deleteEntity(entityType, recordId);
      }
    }
  }
}

async function normalizeOwnerAccount(user) {
  if (!user) return null;

  const ownerConfig = getOwnerConfig();
  const shouldBeOwner = shouldPromoteToOwner(user, ownerConfig) && user.role !== 'hardware-manager';

  if (!shouldBeOwner) {
    return null;
  }

  const updates = {};

  if (user.role !== 'owner') {
    updates.role = 'owner';
  }

  if (user.tenantId) {
    updates.tenantId = null;
  }

  if (!user.isActive) {
    updates.isActive = true;
  }

  if (!user.fullName && ownerConfig.fullName) {
    updates.fullName = ownerConfig.fullName;
  }

  if (!user.phone && ownerConfig.phone) {
    updates.phone = ownerConfig.phone;
  }

  if (user.registrationStatus === 'pending' || user.registrationStatus === 'rejected') {
    updates.registrationStatus = 'approved';
  }

  if (Object.keys(updates).length > 0) {
    Object.assign(user, updates);
    await user.save();
  }

  return user;
}

async function ensureDefaultOwnerUser() {
  const ownerConfig = getOwnerConfig();

  const existingOwners = await User.find({ role: 'owner' });
  const matchingOwner = (existingOwners || []).find((candidate) => {
    const candidateEmail = (candidate.email || '').toLowerCase();
    const candidateUsername = (candidate.username || '').toLowerCase();
    const configuredEmail = (ownerConfig.email || '').toLowerCase();
    const configuredUsername = (ownerConfig.username || '').toLowerCase();

    return candidateEmail === configuredEmail || candidateUsername === configuredUsername || candidate.role === 'owner';
  });

  const existingOwner = matchingOwner || existingOwners?.[0] || null;

  if (existingOwner) {
    const updates = {};

    if (existingOwner.role !== 'owner') {
      updates.role = 'owner';
    }

    if (existingOwner.tenantId) {
      updates.tenantId = null;
    }

    if (!existingOwner.fullName && ownerConfig.fullName) {
      updates.fullName = ownerConfig.fullName;
    }

    if (!existingOwner.phone && ownerConfig.phone) {
      updates.phone = ownerConfig.phone;
    }

    if (!existingOwner.isActive) {
      updates.isActive = true;
    }

    if (existingOwner.registrationStatus === 'pending' || existingOwner.registrationStatus === 'rejected') {
      updates.registrationStatus = 'approved';
    }

    if (Object.keys(updates).length > 0) {
      Object.assign(existingOwner, updates);
      await existingOwner.save();
    }

    return existingOwner;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(ownerConfig.password, salt);
  const owner = new User({
    ...ownerConfig,
    password: hashedPassword,
    isActive: true,
    registrationStatus: 'approved'
  });

  await owner.save();
  return owner;
}

// Register (approval-based tenant signup)
router.post('/register', async (req, res) => {
  try {
    await ensureDefaultOwnerUser();

    const { username, email, password, fullName, inviteToken, tenantName, hardwareName } = req.body;

    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let tenant = null;
    if (inviteToken) {
      const invite = await TenantInvite.findOne({ token: inviteToken });
      if (!invite || invite.status !== 'approved') {
        return res.status(400).json({ message: 'Invite not found or not approved' });
      }
      tenant = await Tenant.findById(invite.tenantId);
    }

    if (!tenant && tenantName) {
      tenant = new Tenant({
        name: tenantName,
        hardwareName: hardwareName || tenantName,
        status: 'pending',
        ownerId: null
      });
      await tenant.save();
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName,
      role: 'hardware-manager',
      tenantId: tenant ? tenant._id || tenant.id : null,
      isActive: false,
      registrationStatus: 'pending'
    });

    await user.save();

    res.status(201).json({
      message: 'Registration submitted for owner approval',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Owner-only hardware manager creation
router.post('/create-hardware-manager', protect, isOwner, async (req, res) => {
  try {
    const { username, email, password, fullName, tenantName, hardwareName } = req.body || {};

    if (!username || !email || !password || !fullName || !tenantName || !hardwareName) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const tenant = new Tenant({
      name: tenantName,
      hardwareName,
      status: 'active',
      ownerId: req.user?._id || req.user?.id
    });
    await tenant.save();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const manager = new User({
      username,
      email,
      password: hashedPassword,
      fullName,
      role: 'hardware-manager',
      tenantId: tenant._id || tenant.id,
      isActive: true
    });
    await manager.save();

    res.status(201).json({
      tenant,
      user: {
        id: manager._id,
        username: manager.username,
        email: manager.email,
        fullName: manager.fullName,
        role: manager.role,
        tenantId: manager.tenantId
      }
    });
  } catch (error) {
    console.error('Hardware manager creation error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/pending-registrations', protect, isOwner, async (req, res) => {
  try {
    const users = await User.find({ isActive: false });
    const pending = users.filter((user) => {
      if (user.role !== 'hardware-manager' && user.role !== 'owner') {
        return false;
      }
      return user.registrationStatus !== 'rejected' && user.registrationStatus !== 'approved';
    });
    res.json(pending);
  } catch (error) {
    console.error('Pending registrations error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/approve-registration/:id', protect, isOwner, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    if (user.isActive) {
      return res.status(400).json({ message: 'Registration already approved' });
    }

    let tenant = null;
    if (user.tenantId) {
      tenant = await Tenant.findById(user.tenantId);
    }

    if (!tenant) {
      tenant = new Tenant({
        name: req.body?.tenantName || user.fullName || 'Hardware',
        hardwareName: req.body?.hardwareName || req.body?.tenantName || user.fullName || 'Hardware',
        status: 'active',
        ownerId: req.user?._id || req.user?.id
      });
      await tenant.save();
      user.tenantId = tenant._id || tenant.id;
    }

    if (tenant.status !== 'active') {
      tenant.status = 'active';
      await tenant.save();
    }

    user.isActive = true;
    user.role = 'hardware-manager';
    user.registrationStatus = 'approved';
    await user.save();

    res.json({
      message: 'Registration approved successfully',
      tenant,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId
      }
    });
  } catch (error) {
    console.error('Approve registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/reject-registration/:id', protect, isOwner, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    if (user.registrationStatus === 'rejected') {
      return res.status(400).json({ message: 'Registration already rejected' });
    }

    await deleteTenantAndRelatedData(user.tenantId, user._id || user.id);
    await user.delete();

    res.json({
      message: 'Registration rejected and its data removed',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Owner-only sales account creation
router.post('/create-sales-account', protect, isOwner, async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body || {};
    const tenantId = req.user?.tenantId || req.body?.tenantId;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({ message: 'Username, email, password, and full name are required' });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName,
      role: 'sales',
      tenantId,
      isActive: true
    });

    await user.save();

    res.status(201).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Sales account creation error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Owner-only tenant summary
router.get('/tenant-summary', protect, isOwner, async (req, res) => {
  try {
    const tenants = await Tenant.find();
    const users = await User.find();
    const activeTenants = tenants.filter((tenant) => tenant.status === 'active').length;
    const suspendedTenants = tenants.filter((tenant) => tenant.status === 'suspended').length;
    const summary = {
      totalTenants: activeTenants + suspendedTenants,
      activeTenants,
      suspendedTenants,
      pendingTenants: tenants.filter((tenant) => tenant.status === 'pending').length,
      hardwareManagers: users.filter((user) => user.role === 'hardware-manager').length,
      salesAccounts: users.filter((user) => user.role === 'sales').length
    };
    res.json(summary);
  } catch (error) {
    console.error('Tenant summary error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Global owner can manage tenants/bars
router.get('/tenants', protect, isOwner, async (req, res) => {
  try {
    const tenants = await Tenant.find();
    const enrichedTenants = await Promise.all(tenants.map(async (tenant) => {
      let ownerInfo = null;
      if (tenant.ownerId) {
        const owner = await User.findById(tenant.ownerId);
        ownerInfo = owner ? {
          id: owner._id || owner.id,
          fullName: owner.fullName || owner.username,
          username: owner.username,
          email: owner.email,
          phone: owner.phone
        } : null;
      }

      const tenantId = tenant._id || tenant.id;
      const registeredManager = await User.findOne({
        tenantId,
        role: 'hardware-manager'
      });

      const registeredManagerInfo = registeredManager ? {
        id: registeredManager._id || registeredManager.id,
        fullName: registeredManager.fullName || registeredManager.username,
        username: registeredManager.username,
        email: registeredManager.email,
        phone: registeredManager.phone,
        role: registeredManager.role,
        registrationStatus: registeredManager.registrationStatus
      } : null;

      return {
        ...tenant,
        ownerInfo,
        registeredManagerInfo
      };
    }));

    res.json(enrichedTenants);
  } catch (error) {
    console.error('Tenant list error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/tenants/:id/suspend', protect, isOwner, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ message: 'Bar not found' });
    }

    tenant.status = 'suspended';
    tenant.suspendedAt = new Date().toISOString();
    tenant.suspensionReason = req.body?.reason || 'Suspended by owner';
    await tenant.save();

    const users = await User.find({ tenantId: tenant._id || tenant.id });
    for (const user of users) {
      user.isActive = false;
      await user.save();
    }

    res.json({ message: 'Bar suspended successfully', tenant });
  } catch (error) {
    console.error('Tenant suspend error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/tenants/:id/restore', protect, isOwner, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ message: 'Bar not found' });
    }

    tenant.status = 'active';
    tenant.restoredAt = new Date().toISOString();
    tenant.suspensionReason = '';
    await tenant.save();

    const users = await User.find({ tenantId: tenant._id || tenant.id });
    for (const user of users) {
      if (user.role !== 'owner') {
        user.isActive = true;
        await user.save();
      }
    }

    res.json({ message: 'Bar restored successfully', tenant });
  } catch (error) {
    console.error('Tenant restore error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/tenants/:id', protect, isOwner, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ message: 'Hardware not found' });
    }

    const tenantId = tenant._id || tenant.id;
    const tenantUsers = await User.find({ tenantId });
    for (const tenantUser of tenantUsers) {
      await deleteTenantAndRelatedData(tenantId, tenantUser._id || tenantUser.id);
      await tenantUser.delete();
    }
    await deleteTenantAndRelatedData(tenantId, tenant.ownerId || null);
    await tenant.delete();

    res.json({ message: 'Hardware and all related data removed successfully', tenant });
  } catch (error) {
    console.error('Tenant delete error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/tenants/:id/delete', protect, isOwner, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ message: 'Hardware not found' });
    }

    const tenantId = tenant._id || tenant.id;
    const tenantUsers = await User.find({ tenantId });
    for (const tenantUser of tenantUsers) {
      await deleteTenantAndRelatedData(tenantId, tenantUser._id || tenantUser.id);
      await tenantUser.delete();
    }
    await deleteTenantAndRelatedData(tenantId, tenant.ownerId || null);
    await tenant.delete();

    res.json({ message: 'Hardware and all related data removed successfully', tenant });
  } catch (error) {
    console.error('Tenant delete error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Global owner can create public invite link for hardware managers
router.post('/create-invite', protect, isOwner, async (req, res) => {
  try {
    const { tenantId, tenantName, hardwareName, expiresInDays = 7 } = req.body || {};
    const tenant = tenantId ? await Tenant.findById(tenantId) : null;
    const invite = new TenantInvite({
      token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tenantId: tenant ? tenant._id || tenant.id : null,
      tenantName: tenantName || tenant?.name || 'Hardware',
      hardwareName: hardwareName || tenant?.hardwareName || 'Hardware',
      status: 'approved',
      expiresAt: new Date(Date.now() + (Number(expiresInDays) || 7) * 24 * 60 * 60 * 1000).toISOString()
    });
    await invite.save();
    res.status(201).json({ invite });
  } catch (error) {
    console.error('Invite creation error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const username = body.username || body.email || body.userName || body.login;
    const password = body.password;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    console.log('Login attempt:', { username, password: password ? '[REDACTED]' : undefined, body });

    const user = await User.findOne({ 
      $or: [{ username }, { email: username }] 
    });
    console.log('Login lookup result:', !!user, user ? { id: user._id, username: user.username, email: user.email, role: user.role, isActive: user.isActive } : null);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await normalizeOwnerAccount(user);

    let tenant = null;
    if (user.tenantId) {
      tenant = await Tenant.findById(user.tenantId);
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account disabled' });
    }

    const accessMessage = getTenantAccessMessage(tenant?.status);
    if (accessMessage) {
      return res.status(403).json({ message: accessMessage });
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (compareError) {
      console.error('Password compare error:', compareError);
    }

    if (!isMatch && user.password === password) {
      isMatch = true;
    }

    console.log('Login password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const tenantStatus = tenant?.status || 'active';
    const suspensionMessage = getTenantAccessMessage(tenantStatus);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantStatus,
        suspensionMessage
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get current user - ADD THIS
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await normalizeOwnerAccount(user);

    let tenant = null;
    if (user.tenantId) {
      tenant = await Tenant.findById(user.tenantId);
    }

    const tenantStatus = tenant?.status || 'active';
    const suspensionMessage = getTenantAccessMessage(tenantStatus);

    const userPayload = {
      ...user,
      tenantStatus,
      suspensionMessage
    };

    // Remove password before returning
    if (userPayload.password) delete userPayload.password;

    res.json(userPayload);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
module.exports.ensureDefaultOwnerUser = ensureDefaultOwnerUser;
module.exports.getTenantAccessMessage = getTenantAccessMessage;
module.exports.shouldPromoteToOwner = shouldPromoteToOwner;