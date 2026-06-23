require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const Vehicle = require('./models/Vehicle');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', methods: ['GET', 'POST'] }
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '8mb' }));

// Expose io to route handlers via req.app.get('io')
app.set('io', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Quick DB verification endpoint — shows real counts, useful for confirming data is actually saved
app.get('/api/db-check', async (req, res) => {
  try {
    const User = require('./models/User');
    const Vehicle = require('./models/Vehicle');
    const Booking = require('./models/Booking');
    const userCount = await User.countDocuments();
    const vehicleCount = await Vehicle.countDocuments();
    const bookingCount = await Booking.countDocuments();
    const dbName = mongoose.connection.db.databaseName;
    const host = mongoose.connection.host;
    res.json({
      connectedTo: { database: dbName, host },
      counts: { users: userCount, vehicles: vehicleCount, bookings: bookingCount },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Socket.IO — real-time vehicle location updates + targeted notifications
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Each logged-in client joins a private room keyed by their user ID,
  // so the server can push notifications to a SPECIFIC user (e.g. a renter)
  // instead of broadcasting to everyone.
  socket.on('join_user_room', (userId) => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} joined room user:${userId}`);
  });

  // Renter updates vehicle location
  socket.on('update_vehicle_location', async ({ vehicleId, lat, lng, status }) => {
    try {
      const updated = await Vehicle.findByIdAndUpdate(
        vehicleId,
        { location: { type: 'Point', coordinates: [lng, lat] }, status: status || 'available' },
        { new: true }
      ).populate('renter', 'name businessName');
      // Broadcast to all connected clients (map viewers)
      io.emit('vehicle_location_updated', {
        vehicleId, lat, lng, status: updated.status,
        name: updated.name, type: updated.type,
        pricePerHour: updated.pricePerHour
      });
    } catch (err) {
      console.error('Location update error:', err.message);
    }
  });

  // Client subscribes to all vehicle positions (for the map)
  socket.on('get_all_vehicles', async () => {
    try {
      const vehicles = await Vehicle.find({ isApproved: true })
        .select('name type model brand location status pricePerHour pricePerDay locationName rating')
        .populate('renter', 'name businessName');
      socket.emit('all_vehicles', vehicles);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// MongoDB connection
const { expireStaleBookings } = require('./utils/bookingCleanup');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bike_rental')
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // Sweep for abandoned unpaid bookings every 60s, freeing up their
    // date range so other riders can book that slot again.
    setInterval(expireStaleBookings, 60 * 1000);
    expireStaleBookings(); // run once immediately on boot too
  })
  .catch(err => console.error('DB connection error:', err));
