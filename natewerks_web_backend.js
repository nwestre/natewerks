const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected')).catch(err => console.log(err));

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  subscriptionStatus: { type: String, default: 'inactive' },
  stripeCustomerId: String,
  role: { type: String, default: 'user' } // 'admin' or 'user'
});

const User = mongoose.model('User', UserSchema);

// Announcement Schema
const AnnouncementSchema = new mongoose.Schema({
  title: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const Announcement = mongoose.model('Announcement', AnnouncementSchema);

// Register User
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const newUser = new User({ name, email, password });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login User
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    res.json({ message: 'Login successful', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Stripe Subscription
app.post('/subscribe', async (req, res) => {
  const { userId, paymentMethodId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId }
      });
      user.stripeCustomerId = customer.id;
    }

    const subscription = await stripe.subscriptions.create({
      customer: user.stripeCustomerId,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      expand: ['latest_invoice.payment_intent']
    });

    user.subscriptionStatus = 'active';
    await user.save();

    res.json({ message: 'Subscription successful', subscription });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Announcement (Admin Only)
app.post('/announcements', async (req, res) => {
  const { title, message, adminId } = req.body;
  try {
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const newAnnouncement = new Announcement({ title, message });
    await newAnnouncement.save();
    res.status(201).json({ message: 'Announcement created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Announcements
app.get('/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User Reports (Admin Only)
app.get('/reports/users', async (req, res) => {
  const { adminId } = req.query;
  try {
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
