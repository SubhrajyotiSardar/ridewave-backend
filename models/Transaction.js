const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['wallet_topup', 'booking_payment', 'refund', 'earning'],
    required: true
  },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'success' },
  description: { type: String, default: '' },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'upi', 'card', 'netbanking'],
    default: 'wallet'
  },
  // Simulated payment gateway reference
  gatewayRef: { type: String, default: '' },
  upiId: { type: String, default: '' },
  cardLast4: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
