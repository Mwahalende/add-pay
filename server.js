const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup static folder for uploads and public
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://user1:malafiki@leodb.5mf7q.mongodb.net/?retryWrites=true&w=majority&appName=leodb';
mongoose.connect(MONGODB_URI, 
).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err));

// Schemas
const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  imageUrl: String,
});

const orderSchema = new mongoose.Schema({
  customerName: String,
  phone: String,
  productId: mongoose.Types.ObjectId,
  productName: String,
  amount: Number,
  paymentStatus: { type: String, default: 'pending' }, // pending or success
  transactionId: String,
  createdAt: { type: Date, default: Date.now },
});

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

// ZenoPay Credentials (replace these!)
const ZENOPAY_API_KEY = 'vV7UzbXSJjWp7yUNWZ7_3TV4I0aFAVfsDMPzaAeaHDLaywYpDtoLDebdnAW_17kXe2pny9_Ut9k41cSAYWWvxQ';
const ZENOPAY_ACCOUNT_ID = 'zp72709255';

// Routes

// Add product (Admin)
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Image required' });

    const product = new Product({
      name,
      description,
      price: Number(price),
      imageUrl: `/uploads/${req.file.filename}`,
    });
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all products
app.get('/api/products', async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

// Update product
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const updateData = { name, description, price: Number(price) };

    if (req.file) {
      updateData.imageUrl = `/uploads/${req.file.filename}`;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const result = await Product.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Place order & initiate payment
app.post('/api/order', async (req, res) => {
  try {
    const { customerName, phone, productId } = req.body;

    // Find product
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Create order with pending payment
    const order = new Order({
      customerName,
      phone,
      productId,
      productName: product.name,
      amount: product.price,
      paymentStatus: 'pending',
    });
    await order.save();

    // Initiate payment with ZenoPay
    const payResponse = await axios.post('https://api.zenopay.co.tz/pay', {
      api_key: ZENOPAY_API_KEY,
      account_id: ZENOPAY_ACCOUNT_ID,
      amount: product.price,
      phone,
      reference: `Order_${order._id}`,
      payment_channel: 'AIRTEL', // can extend to allow others
      callback_url: 'https://yourdomain.com/api/zeno-callback' // change to your real domain
    });

    if (payResponse.data.success) {
      res.json({ orderId: order._id, paymentData: payResponse.data });
    } else {
      res.status(400).json({ error: 'Payment initiation failed', details: payResponse.data });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ZenoPay callback for payment confirmation
app.post('/api/zeno-callback', async (req, res) => {
  try {
    const { reference, transactionId, status } = req.body;

    // Extract order id from reference
    const orderId = reference.replace('Order_', '');
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    if (status === 'success') {
      order.paymentStatus = 'success';
      order.transactionId = transactionId;
      await order.save();
    }

    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Error');
  }
});

// Get all orders (Admin)
app.get('/api/admin/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
