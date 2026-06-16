const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  plannedEndTime: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  rentalType: { type: String, enum: ['hourly', 'daily'], default: 'hourly' },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  paymentMethod: { type: String, default: 'wallet' },
  pickupLocation: {
    coordinates: [Number],
    name: String
  },
  dropoffLocation: {
    coordinates: [Number],
    name: String
  },
  distance: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  cancellationReason: { type: String, default: '' },
  rating: { type: Number },
  review: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);
