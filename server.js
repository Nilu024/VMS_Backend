const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const visitorRoutes = require('./routes/visitors');
const roleRoutes = require('./routes/roles');

const app = express();

// Middleware
const corsOrigin = process.env.NODE_ENV === 'production' 
  ? process.env.FRONTEND_URL || 'https://yourdomain.com'
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  // Catch all handler: send back React's index.html file for client-side routing
  app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return res.status(404).json({ message: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/roles', roleRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

console.log(process.env.MONGODB_URI ? 'MongoDB URI is set' : 'MongoDB URI is NOT set');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log("✅ Connected to MongoDB");

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });

})
.catch(err => console.error("❌ MongoDB connection error:", err));

// Seed initial admin (only in development)
async function seedAdmin() {
  // Skip seeding in production for security
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  
  const User = require('./models/User');
  const bcrypt = require('bcryptjs');
  
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        name: 'System Admin'
      });
      console.log('✅ Admin user seeded: username=admin, password=admin123');
      console.log('⚠️  WARNING: Change default admin password after first login!');
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
