const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, businessName, businessAddress, licenseNumber } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const allowedRoles = ['user', 'renter'];
    const userRole = allowedRoles.includes(role) ? role : 'user';

    const user = await User.create({
      name, email, phone, password, role: userRole,
      businessName: businessName || '',
      businessAddress: businessAddress || '',
      licenseNumber: licenseNumber || '',
      renterApproved: false
    });
    console.log(`✅ New ${userRole} registered & saved to DB: ${email} (id: ${user._id})`);

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, phone: user.phone,
        renterApproved: user.renterApproved,
        walletBalance: user.walletBalance
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!user.isActive) return res.status(403).json({ message: 'Account suspended' });

    const token = signToken(user._id);
    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, phone: user.phone,
        renterApproved: user.renterApproved,
        walletBalance: user.walletBalance,
        totalRides: user.totalRides
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get profile
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

// Update profile
router.patch('/me', protect, async (req, res) => {
  try {
    const { name, phone, businessName, businessAddress } = req.body;
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, businessName, businessAddress },
      { new: true }
    ).select('-password');
    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
