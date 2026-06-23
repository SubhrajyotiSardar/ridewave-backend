const Booking = require('../models/Booking');

/**
 * Finds all bookings that are still 'pending' (unpaid) past their
 * expiresAt timestamp and marks them as 'expired'. This is what frees
 * up a date range that was reserved by an abandoned checkout.
 *
 * Called periodically (see server.js setInterval) AND defensively before
 * every new booking conflict check, so expiry is never more than a few
 * seconds stale even between sweep intervals.
 */
async function expireStaleBookings() {
  try {
    const now = new Date();
    const result = await Booking.updateMany(
      { status: 'pending', paymentStatus: 'pending', expiresAt: { $ne: null, $lte: now } },
      { $set: { status: 'expired' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`🧹 Expired ${result.modifiedCount} unpaid booking(s) past their grace period`);
    }
    return result.modifiedCount;
  } catch (err) {
    console.error('Booking expiry sweep error:', err.message);
    return 0;
  }
}

module.exports = { expireStaleBookings };
