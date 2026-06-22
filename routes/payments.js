const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { protect, restrictTo } = require('../middleware/auth');
const { notify } = require('../utils/notify');

// Helper: generate fake gateway ref
const gatewayRef = () => 'RW' + Date.now() + Math.random().toString(36).slice(2,7).toUpperCase();

// ── WALLET TOP-UP ─────────────────────────────────────────────────────────────
router.post('/wallet/topup', protect, async (req, res) => {
  try {
    const { amount, paymentMethod, upiId, cardNumber, cardExpiry, cardCvv } = req.body;
    if (!amount || amount < 50) return res.status(400).json({ message: 'Minimum top-up is ₹50' });
    if (amount > 10000) return res.status(400).json({ message: 'Maximum top-up is ₹10,000' });

    // Simulate payment gateway validation
    if (paymentMethod === 'upi') {
      if (!upiId || !upiId.includes('@'))
        return res.status(400).json({ message: 'Invalid UPI ID. Format: name@bank' });
    }
    if (paymentMethod === 'card') {
      if (!cardNumber || cardNumber.replace(/\s/g,'').length !== 16)
        return res.status(400).json({ message: 'Invalid card number (16 digits required)' });
      if (!cardExpiry || !cardExpiry.match(/^\d{2}\/\d{2}$/))
        return res.status(400).json({ message: 'Invalid expiry. Format: MM/YY' });
      if (!cardCvv || cardCvv.length < 3)
        return res.status(400).json({ message: 'Invalid CVV' });
    }

    const user = await User.findById(req.user._id);
    const balanceBefore = user.walletBalance;
    const balanceAfter = balanceBefore + Number(amount);

    // Update wallet
    await User.findByIdAndUpdate(req.user._id, { walletBalance: balanceAfter });

    // Record transaction
    const txn = await Transaction.create({
      user: req.user._id,
      type: 'wallet_topup',
      amount: Number(amount),
      balanceBefore,
      balanceAfter,
      description: `Wallet topped up via ${paymentMethod.toUpperCase()}`,
      paymentMethod,
      gatewayRef: gatewayRef(),
      upiId: paymentMethod === 'upi' ? upiId : '',
      cardLast4: paymentMethod === 'card' ? cardNumber.slice(-4) : '',
      status: 'success'
    });

    res.json({
      message: `₹${amount} added to wallet successfully`,
      walletBalance: balanceAfter,
      transaction: txn
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PAY FOR BOOKING ───────────────────────────────────────────────────────────
router.post('/pay-booking/:bookingId', protect, async (req, res) => {
  try {
    const { paymentMethod, upiId, cardNumber, cardExpiry, cardCvv } = req.body;
    const booking = await Booking.findById(req.params.bookingId).populate('vehicle');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.user.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your booking' });
    if (booking.paymentStatus === 'paid')
      return res.status(400).json({ message: 'Already paid' });

    const amount = booking.totalAmount;
    const user = await User.findById(req.user._id);

    // Validate payment method
    if (paymentMethod === 'wallet') {
      if (user.walletBalance < amount)
        return res.status(400).json({
          message: `Insufficient wallet balance. Need ₹${amount}, have ₹${user.walletBalance}`,
          shortfall: amount - user.walletBalance
        });
    }
    if (paymentMethod === 'upi') {
      if (!upiId || !upiId.includes('@'))
        return res.status(400).json({ message: 'Invalid UPI ID' });
    }
    if (paymentMethod === 'card') {
      if (!cardNumber || cardNumber.replace(/\s/g,'').length !== 16)
        return res.status(400).json({ message: 'Invalid card number' });
      if (!cardExpiry || !cardExpiry.match(/^\d{2}\/\d{2}$/))
        return res.status(400).json({ message: 'Invalid expiry. Format: MM/YY' });
      if (!cardCvv || cardCvv.length < 3)
        return res.status(400).json({ message: 'Invalid CVV' });
    }

    const balanceBefore = user.walletBalance;
    const balanceAfter = paymentMethod === 'wallet' ? balanceBefore - amount : balanceBefore;

    // Deduct wallet if wallet payment
    if (paymentMethod === 'wallet') {
      await User.findByIdAndUpdate(req.user._id, { walletBalance: balanceAfter });
    }

    // Mark booking as paid
    await Booking.findByIdAndUpdate(booking._id, {
      paymentStatus: 'paid',
      paymentMethod,
      status: 'confirmed'
    });

    // Rider transaction
    await Transaction.create({
      user: req.user._id,
      type: 'booking_payment',
      amount,
      balanceBefore,
      balanceAfter,
      description: `Payment for booking - ${booking.vehicle?.name}`,
      paymentMethod,
      booking: booking._id,
      gatewayRef: gatewayRef(),
      upiId: paymentMethod === 'upi' ? upiId : '',
      cardLast4: paymentMethod === 'card' ? cardNumber.slice(-4) : '',
      status: 'success'
    });

    // Renter earning transaction
    await Transaction.create({
      user: booking.renter,
      type: 'earning',
      amount,
      balanceBefore: 0,
      balanceAfter: 0,
      description: `Earning from booking - ${booking.vehicle?.name}`,
      paymentMethod,
      booking: booking._id,
      gatewayRef: gatewayRef(),
      status: 'success'
    });

    // Update user total spent
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalSpent: amount } });

    // ── Notify the renter: a booking just came in and is paid ──────────────
    await notify(req.app, {
      userId: booking.renter,
      type: 'new_booking',
      title: '🛵 New booking received!',
      message: `${req.user.name} booked your ${booking.vehicle?.name} for ₹${amount}. Payment confirmed.`,
      link: '/renter/bookings',
      bookingId: booking._id
    });

    // ── Notify the rider too: payment confirmation ──────────────────────────
    await notify(req.app, {
      userId: req.user._id,
      type: 'payment_received',
      title: '✅ Booking confirmed',
      message: `Your booking for ${booking.vehicle?.name} is confirmed. Enjoy your ride!`,
      link: '/dashboard/bookings',
      bookingId: booking._id
    });

    res.json({
      message: 'Payment successful!',
      amount,
      paymentMethod,
      gatewayRef: gatewayRef(),
      walletBalance: balanceAfter
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── REFUND ────────────────────────────────────────────────────────────────────
router.post('/refund/:bookingId', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('vehicle');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.paymentStatus !== 'paid')
      return res.status(400).json({ message: 'No payment to refund' });
    if (booking.status !== 'cancelled')
      return res.status(400).json({ message: 'Booking must be cancelled first' });

    const user = await User.findById(booking.user);
    const refundAmount = booking.totalAmount;
    const balanceBefore = user.walletBalance;
    const balanceAfter = balanceBefore + refundAmount;

    // Refund to wallet always
    await User.findByIdAndUpdate(booking.user, { walletBalance: balanceAfter });
    await Booking.findByIdAndUpdate(booking._id, { paymentStatus: 'refunded' });

    await Transaction.create({
      user: booking.user,
      type: 'refund',
      amount: refundAmount,
      balanceBefore,
      balanceAfter,
      description: `Refund for cancelled booking - ${booking.vehicle?.name}`,
      paymentMethod: 'wallet',
      booking: booking._id,
      gatewayRef: gatewayRef(),
      status: 'success'
    });

    res.json({ message: `₹${refundAmount} refunded to wallet`, walletBalance: balanceAfter });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── TRANSACTION HISTORY ───────────────────────────────────────────────────────
router.get('/transactions', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const filter = { user: req.user._id };
    if (type) filter.type = type;

    const transactions = await Transaction.find(filter)
      .populate('booking', 'vehicle startTime totalAmount')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(filter);
    const user = await User.findById(req.user._id).select('walletBalance totalSpent');

    res.json({ transactions, total, walletBalance: user.walletBalance, totalSpent: user.totalSpent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── WALLET BALANCE ────────────────────────────────────────────────────────────
router.get('/wallet', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance totalSpent name');
    const recentTxns = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 }).limit(5);
    res.json({ walletBalance: user.walletBalance, totalSpent: user.totalSpent, recentTxns });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: ALL TRANSACTIONS ───────────────────────────────────────────────────
router.get('/admin/all', protect, restrictTo('admin'), async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('user', 'name email role')
      .populate('booking', 'vehicle totalAmount')
      .sort({ createdAt: -1 })
      .limit(100);
    const stats = await Transaction.aggregate([
      { $match: { status: 'success' } },
      { $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }}
    ]);
    res.json({ transactions, stats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
