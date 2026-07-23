const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');

async function ensureDefaultOwnerUser() {
  const ownerConfig = {
    username: process.env.DEFAULT_OWNER_USERNAME || 'gsilungwe',
    email: process.env.DEFAULT_OWNER_EMAIL || 'silungwegod@gmail.com',
    password: process.env.DEFAULT_OWNER_PASSWORD || 'Password123',
    fullName: process.env.DEFAULT_OWNER_FULL_NAME || 'Godfrey Silungwe',
    phone: process.env.DEFAULT_OWNER_PHONE || '0995718815',
    role: 'owner'
  };

  const existingOwner = await User.findOne({
    $or: [
      { email: ownerConfig.email },
      { username: ownerConfig.username },
      { role: 'owner' }
    ]
  });

  if (existingOwner) {
    const updates = {};

    if (existingOwner.role !== 'owner') {
      updates.role = 'owner';
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
    isActive: true
  });

  await owner.save();
  return owner;
}

// Register
router.post('/register', async (req, res) => {
  try {
    await ensureDefaultOwnerUser();

    const { username, email, password, fullName, role } = req.body;

    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists' 
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName,
      role: role || 'sales'
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      'secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt:', { username, password: password ? '[REDACTED]' : undefined, body: req.body });

    const user = await User.findOne({ 
      $or: [{ username }, { email: username }] 
    });
    console.log('Login lookup result:', !!user, user ? { id: user._id, username: user.username, email: user.email, role: user.role, isActive: user.isActive } : null);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account disabled' });
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
      'secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
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

    const decoded = jwt.verify(token, 'secret_key');
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove password before returning
    if (user.password) delete user.password;

    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
module.exports.ensureDefaultOwnerUser = ensureDefaultOwnerUser;