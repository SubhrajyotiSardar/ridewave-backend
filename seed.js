require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Vehicle = require('./models/Vehicle');
const Booking = require('./models/Booking');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bike_rental';

// Kolkata-area coordinates for realistic demo
const kolkataLocations = [
  { lat: 22.5726, lng: 88.3639, name: 'Park Street' },
  { lat: 22.5958, lng: 88.3612, name: 'Salt Lake' },
  { lat: 22.5448, lng: 88.3426, name: 'Tollygunge' },
  { lat: 22.6130, lng: 88.3990, name: 'New Town' },
  { lat: 22.5354, lng: 88.3514, name: 'Ballygunge' },
  { lat: 22.5800, lng: 88.4200, name: 'EM Bypass' },
  { lat: 22.5550, lng: 88.3200, name: 'Behala' },
  { lat: 22.6400, lng: 88.4100, name: 'Rajarhat' }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // ── SAFETY LOCK ──────────────────────────────────────────────────────────
  // Prevent accidentally wiping real user data. Demo accounts are recognized
  // by their fixed seed emails — if ANY other user exists, seeding is blocked
  // unless --force is explicitly passed.
  const demoEmails = [
    'admin@bikerental.com', 'rohit@renter.com', 'priya@renter.com',
    'arjun@user.com', 'sneha@user.com'
  ];
  const forceFlag = process.argv.includes('--force');
  const existingUsers = await User.find({});
  const realUsers = existingUsers.filter(u => !demoEmails.includes(u.email));

  if (realUsers.length > 0 && !forceFlag) {
    console.log('\n🛑 SEED BLOCKED — Real user data detected!\n');
    console.log(`Found ${realUsers.length} non-demo account(s) in the database:`);
    realUsers.forEach(u => console.log(`   - ${u.name} (${u.email}) [${u.role}]`));
    console.log('\nRunning seed now would PERMANENTLY DELETE this data.');
    console.log('If you are absolutely sure you want to wipe everything and reset to demo data, run:');
    console.log('\n   npm run seed -- --force\n');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (forceFlag && realUsers.length > 0) {
    console.log(`⚠️  --force flag detected. Wiping ${realUsers.length} real account(s) as requested...\n`);
  }

  // Clear existing data
  await User.deleteMany({});
  await Vehicle.deleteMany({});
  await Booking.deleteMany({});

  // Create admin
  const admin = await User.create({
    name: 'Admin User', email: 'admin@bikerental.com',
    phone: '9000000001', password: 'Admin@123', role: 'admin',
    isVerified: true, isActive: true
  });

  // Create renters
  const renters = await User.create([
    {
      name: 'Rohit Sharma', email: 'rohit@renter.com', phone: '9000000002',
      password: 'Renter@123', role: 'renter', businessName: 'Rohit Rides',
      businessAddress: 'Salt Lake, Kolkata', licenseNumber: 'WB-1234',
      renterApproved: true, isVerified: true, isActive: true
    },
    {
      name: 'Priya Mehta', email: 'priya@renter.com', phone: '9000000003',
      password: 'Renter@123', role: 'renter', businessName: 'Priya Wheels',
      businessAddress: 'Park Street, Kolkata', licenseNumber: 'WB-5678',
      renterApproved: true, isVerified: true, isActive: true
    }
  ]);

  // Create users
  const users = await User.create([
    {
      name: 'Arjun Das', email: 'arjun@user.com', phone: '9000000004',
      password: 'User@123', role: 'user', isVerified: true,
      walletBalance: 1500, totalRides: 5, totalSpent: 2200
    },
    {
      name: 'Sneha Roy', email: 'sneha@user.com', phone: '9000000005',
      password: 'User@123', role: 'user', isVerified: true,
      walletBalance: 800, totalRides: 2, totalSpent: 900
    }
  ]);

  // Create vehicles
  const vehicleData = [
    { name: 'Hero Splendor', type: 'bike', model: 'Splendor Plus', brand: 'Hero', reg: 'WB01A1001', ph: 50, pd: 350, renter: renters[0]._id, loc: kolkataLocations[0], cond: 'excellent', feat: ['Helmet included', 'Insurance covered'] },
    { name: 'Honda Activa', type: 'scooter', model: 'Activa 6G', brand: 'Honda', reg: 'WB01A1002', ph: 60, pd: 400, renter: renters[0]._id, loc: kolkataLocations[1], cond: 'excellent', feat: ['USB charging', 'Storage compartment'] },
    { name: 'Ola S1 Pro', type: 'electric_scooter', model: 'S1 Pro', brand: 'Ola', reg: 'WB01A1003', ph: 80, pd: 550, renter: renters[0]._id, loc: kolkataLocations[2], cond: 'excellent', feat: ['Zero emission', 'App-connected', '120km range'] },
    { name: 'Bajaj Pulsar', type: 'bike', model: 'Pulsar 150', brand: 'Bajaj', reg: 'WB01A1004', ph: 70, pd: 480, renter: renters[1]._id, loc: kolkataLocations[3], cond: 'good', feat: ['Disc brake', 'Sporty look'] },
    { name: 'TVS Jupiter', type: 'scooter', model: 'Jupiter 125', brand: 'TVS', reg: 'WB01A1005', ph: 55, pd: 380, renter: renters[1]._id, loc: kolkataLocations[4], cond: 'good', feat: ['Large boot space', 'Comfortable ride'] },
    { name: 'Ather 450X', type: 'electric_scooter', model: '450X Gen 3', brand: 'Ather', reg: 'WB01A1006', ph: 90, pd: 600, renter: renters[1]._id, loc: kolkataLocations[5], cond: 'excellent', feat: ['Fast charging', 'Smart dashboard', '105km range'] },
    { name: 'Royal Enfield', type: 'bike', model: 'Classic 350', brand: 'Royal Enfield', reg: 'WB01A1007', ph: 120, pd: 800, renter: renters[0]._id, loc: kolkataLocations[6], cond: 'good', feat: ['Retro style', 'Long distance comfort'] },
    { name: 'Suzuki Access', type: 'scooter', model: 'Access 125', brand: 'Suzuki', reg: 'WB01A1008', ph: 58, pd: 390, renter: renters[1]._id, loc: kolkataLocations[7], cond: 'excellent', feat: ['SEP engine', 'Fuel efficient'] }
  ];

  const vehicles = [];
  for (const v of vehicleData) {
    const vehicle = await Vehicle.create({
      name: v.name, type: v.type, model: v.model, brand: v.brand,
      registrationNumber: v.reg, pricePerHour: v.ph, pricePerDay: v.pd,
      renter: v.renter, condition: v.cond, features: v.feat,
      locationName: v.loc.name, isApproved: true, status: 'available',
      location: { type: 'Point', coordinates: [v.loc.lng, v.loc.lat] },
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
      ratingCount: Math.floor(Math.random() * 50) + 5,
      totalRides: Math.floor(Math.random() * 100) + 10,
      batteryLevel: v.type === 'electric_scooter' ? Math.floor(Math.random() * 40) + 60 : 100
    });
    vehicles.push(vehicle);
  }

  console.log('✅ Seed completed!');
  console.log('--- LOGIN CREDENTIALS ---');
  console.log('Admin:  admin@bikerental.com / Admin@123');
  console.log('Renter: rohit@renter.com / Renter@123');
  console.log('Renter: priya@renter.com / Renter@123');
  console.log('User:   arjun@user.com / User@123');
  console.log('User:   sneha@user.com / User@123');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
