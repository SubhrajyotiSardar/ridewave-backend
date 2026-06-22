const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['new_booking', 'booking_cancelled', 'booking_completed', 'vehicle_approved', 'renter_approved', 'payment_received'],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  link: { type: String, default: '' }, // frontend route to navigate to on click
  relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
