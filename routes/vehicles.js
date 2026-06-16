const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const { protect, restrictTo } = require('../middleware/auth');

// Get all approved vehicles (with optional geo filter)
router.get('/', async (req, res) => {
  try {
    const { type, status, lat, lng, radius = 10000 } = req.query;
    let query = { isApproved: true };
    if (type) query.type = type;
    if (status) query.status = status;

    let vehicles;
    if (lat && lng) {
      vehicles = await Vehicle.find({
        ...query,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
            $maxDistance: parseInt(radius)
          }
        }
      }).populate('renter', 'name businessName phone');
    } else {
      vehicles = await Vehicle.find(query).populate('renter', 'name businessName phone');
    }
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single vehicle
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).populate('renter', 'name businessName phone email');
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Renter: Add vehicle
router.post('/', protect, restrictTo('renter', 'admin'), async (req, res) => {
  try {
    const { name, type, model, brand, registrationNumber, pricePerHour, pricePerDay,
      condition, locationName, lat, lng, features, images } = req.body;

    const vehicle = await Vehicle.create({
      name, type, model, brand, registrationNumber,
      pricePerHour, pricePerDay, condition, locationName,
      renter: req.user._id,
      location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      features: features || [],
      images: images || [],
      isApproved: req.user.role === 'admin'
    });
    res.status(201).json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Renter: Update vehicle
router.patch('/:id', protect, restrictTo('renter', 'admin'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Not found' });
    if (req.user.role !== 'admin' && vehicle.renter.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your vehicle' });
    }
    const { lat, lng, ...rest } = req.body;
    if (lat && lng) rest.location = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };

    const updated = await Vehicle.findByIdAndUpdate(req.params.id, rest, { new: true });
    res.json({ vehicle: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Renter: Get own vehicles
router.get('/renter/my-vehicles', protect, restrictTo('renter', 'admin'), async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ renter: req.user._id });
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Approve vehicle
router.patch('/:id/approve', protect, restrictTo('admin'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id, { isApproved: true }, { new: true }
    );
    res.json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
