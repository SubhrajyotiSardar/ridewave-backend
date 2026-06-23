const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { expireStaleBookings } = require('../utils/bookingCleanup');

const UNPAID_BOOKING_GRACE_MINUTES = 15;

// Create booking — checks for actual DATE-RANGE conflicts instead of a
// single global vehicle.status flag, so future/non-overlapping bookings
// are no longer incorrectly blocked.
router.post('/', protect, restrictTo('user'), async (req, res) => {
  try {
    // Defensive sweep: clear out any abandoned unpaid bookings right now,
    // so they can never wrongly count as a conflict for this new request.
    await expireStaleBookings();

    const { vehicleId, startTime, plannedEndTime, rentalType, notes } = req.body;
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle || !vehicle.isApproved || vehicle.status === 'maintenance' || vehicle.status === 'inactive') {
      return res.status(400).json({ message: 'Vehicle not available' });
    }

    const newStart = new Date(startTime);
    const newEnd = new Date(plannedEndTime);
    if (isNaN(newStart) || isNaN(newEnd) || newEnd <= newStart) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    // Two ranges overlap if: existingStart < newEnd AND existingEnd > newStart.
    // Only bookings that are still "live" (not cancelled/expired/completed)
    // count as real conflicts.
    const conflict = await Booking.findOne({
      vehicle: vehicleId,
      status: { $in: ['pending', 'confirmed', 'active'] },
      startTime: { $lt: newEnd },
      plannedEndTime: { $gt: newStart }
    });
    if (conflict) {
      return res.status(409).json({ message: 'This vehicle is already booked for the selected time slot. Please choose a different time.' });
    }

    const hours = Math.ceil((newEnd - newStart) / 3600000);
    const days = Math.ceil(hours / 24);
    const amount = rentalType === 'daily'
      ? days * vehicle.pricePerDay
      : hours * vehicle.pricePerHour;

    const booking = await Booking.create({
      user: req.user._id, vehicle: vehicleId, renter: vehicle.renter,
      startTime: newStart, plannedEndTime: newEnd,
      rentalType, notes, totalAmount: amount,
      pickupLocation: { coordinates: vehicle.location.coordinates, name: vehicle.locationName },
      expiresAt: new Date(Date.now() + UNPAID_BOOKING_GRACE_MINUTES * 60 * 1000)
    });

    await booking.populate(['vehicle', 'renter']);

    // Notify the renter — booking placed, payment still pending
    await notify(req.app, {
      userId: vehicle.renter,
      type: 'new_booking',
      title: '⏳ Booking placed — payment pending',
      message: `${req.user.name} reserved your ${vehicle.name} for ₹${amount} (${rentalType}). You'll be notified once payment is confirmed.`,
      link: '/renter/bookings',
      bookingId: booking._id
    });

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
      status: 'completed', endTime, totalAmount: finalAmount, paymentStatus: 'paid', expiresAt: null
    });
    await Vehicle.findByIdAndUpdate(booking.vehicle, { status: 'available' });
    await User.findByIdAndUpdate(booking.user, {
      $inc: { totalRides: 1, totalSpent: finalAmount }
    });

    // Notify the renter that the ride finished and they earned money
    const completedVehicle = await Vehicle.findById(booking.vehicle).select('name renter');
    await notify(req.app, {
      userId: booking.renter,
      type: 'booking_completed',
      title: '✅ Ride completed',
      message: `The ride on ${completedVehicle?.name || 'your vehicle'} has ended. ₹${finalAmount} has been credited to your earnings.`,
      link: '/renter/earnings',
      bookingId: booking._id
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
      status: 'cancelled', cancellationReason: req.body.reason || '', expiresAt: null
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
