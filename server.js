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
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Socket.IO — real-time vehicle location updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bike_rental')
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('DB connection error:', err));
