const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['bike', 'scooter', 'electric_scooter'], required: true },
  model: { type: String, required: true },
  brand: { type: String, required: true },
  registrationNumber: { type: String, required: true, unique: true },
  renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pricePerHour: { type: Number, required: true },
  pricePerDay: { type: Number, required: true },
  status: { type: String, enum: ['available', 'in_use', 'maintenance', 'inactive'], default: 'available' },
  condition: { type: String, enum: ['excellent', 'good', 'fair'], default: 'good' },
  batteryLevel: { type: Number, default: 100 }, // for electric scooters
  fuelLevel: { type: Number, default: 100 },
  mileage: { type: Number, default: 0 },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [77.5946, 12.9716] } // [lng, lat]
  },
  locationName: { type: String, default: '' },
  images: [{ type: String }],
  features: [{ type: String }],
  totalRides: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

vehicleSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
