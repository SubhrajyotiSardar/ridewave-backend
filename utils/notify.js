const Notification = require('../models/Notification');

/**
 * Creates a notification in MongoDB AND emits it live to that user's
 * Socket.IO room (if they're currently connected). This way:
 *   - If online: they see it instantly (toast / bell badge update)
 *   - If offline: it's waiting for them next time they open the app
 *
 * @param {import('express').Application} app - the Express app (to access io)
 * @param {Object} params
 * @param {String} params.userId    - recipient's user _id
 * @param {String} params.type      - one of Notification.type enum values
 * @param {String} params.title     - short headline
 * @param {String} params.message   - detail text
 * @param {String} [params.link]    - frontend route to deep-link to
 * @param {String} [params.bookingId] - related booking _id, if any
 */
async function notify(app, { userId, type, title, message, link = '', bookingId = null }) {
  try {
    const notification = await Notification.create({
      user: userId, type, title, message, link, relatedBooking: bookingId
    });

    const io = app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('new_notification', notification);
    }
    return notification;
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

module.exports = { notify };
