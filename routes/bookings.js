const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');
const { notify } = require('../utils/notify');

// Create booking
router.post('/', protect, restrictTo('user'), async (req, res) => {
  try {
    const { vehicleId, startTime, plannedEndTime, rentalType, notes } = req.body;
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle || vehicle.status !== 'available') {
      return res.status(400).json({ message: 'Vehicle not available' });
    }

    const hours = Math.ceil((new Date(plannedEndTime) - new Date(startTime)) / 3600000);
    const days = Math.ceil(hours / 24);
    const amount = rentalType === 'daily'
      ? days * vehicle.pricePerDay
      : hours * vehicle.pricePerHour;

    const booking = await Booking.create({
      user: req.user._id, vehicle: vehicleId, renter: vehicle.renter,
      startTime: new Date(startTime), plannedEndTime: new Date(plannedEndTime),
      rentalType, notes, totalAmount: amount,
      pickupLocation: { coordinates: vehicle.location.coordinates, name: vehicle.locationName }
    });

    await Vehicle.findByIdAndUpdate(vehicleId, { status: 'in_use' });
    await booking.populate(['vehicle', 'renter']);
    res.status(201).json({ booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// User: Get my bookings
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const filter = req.user.role === 'renter'
      ? { renter: req.user._id }
      : { user: req.user._id };
    const bookings = await Booking.find(filter)
      .populate('vehicle', 'name type model brand images pricePerHour pricePerDay')
      .populate('user', 'name email phone')
      .populate('renter', 'name businessName')
      .sort({ createdAt: -1 });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Complete booking
router.patch('/:id/complete', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const endTime = new Date();
    const hours = Math.ceil((endTime - booking.startTime) / 3600000);
    const vehicle = await Vehicle.findById(booking.vehicle);
    const finalAmount = booking.rentalType === 'hourly'
      ? hours * vehicle.pricePerHour : booking.totalAmount;

    await Booking.findByIdAndUpdate(booking._id, {
      status: 'completed', endTime, totalAmount: finalAmount, paymentStatus: 'paid'
    });
    await Vehicle.findByIdAndUpdate(booking.vehicle, { status: 'available' });
    await User.findByIdAndUpdate(booking.user, {
      $inc: { totalRides: 1, totalSpent: finalAmount }
    });

    res.json({ message: 'Booking completed', amount: finalAmount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel booking
router.patch('/:id/cancel', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('vehicle', 'name');
    if (!booking) return res.status(404).json({ message: 'Not found' });
    await Booking.findByIdAndUpdate(booking._id, {
      status: 'cancelled', cancellationReason: req.body.reason || ''
    });
    await Vehicle.findByIdAndUpdate(booking.vehicle._id || booking.vehicle, { status: 'available' });

    // Notify the renter their booking was cancelled
    if (booking.paymentStatus === 'paid') {
      await notify(req.app, {
        userId: booking.renter,
        type: 'booking_cancelled',
        title: '⚠️ Booking cancelled',
        message: `A booking for ${booking.vehicle?.name || 'your vehicle'} was cancelled by the rider.`,
        link: '/renter/bookings',
        bookingId: booking._id
      });
    }

    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
