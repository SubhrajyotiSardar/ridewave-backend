const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const { protect, restrictTo } = require('../middleware/auth');

const guard = [protect, restrictTo('admin')];

// Dashboard stats
router.get('/stats', guard, async (req, res) => {
  try {
    const [totalUsers, totalRenters, totalVehicles, totalBookings, pendingVehicles, pendingRenters] =
      await Promise.all([
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'renter' }),
        Vehicle.countDocuments({ isApproved: true }),
        Booking.countDocuments(),
        Vehicle.countDocuments({ isApproved: false }),
        User.countDocuments({ role: 'renter', renterApproved: false })
      ]);
    const revenueAgg = await Booking.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;
    const activeRides = await Booking.countDocuments({ status: 'active' });
    res.json({ totalUsers, totalRenters, totalVehicles, totalBookings, totalRevenue, activeRides, pendingVehicles, pendingRenters });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users
router.get('/users', guard, async (req, res) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const filter = role ? { role } : {};
    const users = await User.find(filter).select('-password')
      .skip((page - 1) * limit).limit(parseInt(limit)).sort({ createdAt: -1 });
    const total = await User.countDocuments(filter);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Toggle user active/suspend
router.patch('/users/:id/toggle-status', guard, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `User ${user.isActive ? 'activated' : 'suspended'}`, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Approve renter
router.patch('/renters/:id/approve', guard, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id, { renterApproved: true }, { new: true }
    ).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all vehicles (including unapproved)
router.get('/vehicles', guard, async (req, res) => {
  try {
    const vehicles = await Vehicle.find().populate('renter', 'name email businessName').sort({ createdAt: -1 });
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all bookings
router.get('/bookings', guard, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user', 'name email phone')
      .populate('vehicle', 'name type brand')
      .populate('renter', 'name businessName')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete vehicle
router.delete('/vehicles/:id', guard, async (req, res) => {
  try {
    await Vehicle.findByIdAndDelete(req.params.id);
    res.json({ message: 'Vehicle deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
