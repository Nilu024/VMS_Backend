const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Visitor = require('../models/Visitor');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Multer setup for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `visitor-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Get all visitors
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    
    // Role-based filtering
    if (req.user.role === 'manager' || req.user.role === 'hr') {
      filter.contactPersons = req.user._id;
    }
    
    if (search) {
      filter.$or = [
        { visitorName: { $regex: search, $options: 'i' } },
        { visitorNumber: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Visitor.countDocuments(filter);
    const visitors = await Visitor.find(filter)
      .populate('contactPersons', 'name role username')
      .populate('createdBy', 'name role')
      .populate('managedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ visitors, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get single visitor
router.get('/:id', authenticate, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id)
      .populate('contactPersons', 'name role username')
      .populate('createdBy', 'name role')
      .populate('managedBy', 'name role');
    
    if (!visitor) return res.status(404).json({ message: 'Visitor not found' });
    res.json(visitor);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Create visitor (admin or security)
router.post('/', authenticate, authorize('admin', 'security'), async (req, res) => {
  try {
    const {
      visitorName, mobileNumber, contactPersons, purpose,
      numberOfPersons, vehicleNumber, visitInTime
    } = req.body;

    const visitor = await Visitor.create({
      visitorName,
      mobileNumber,
      contactPersons: Array.isArray(contactPersons) ? contactPersons : [contactPersons],
      purpose,
      numberOfPersons,
      vehicleNumber,
      visitInTime: visitInTime || new Date(),
      status: 'checked-in',
      createdBy: req.user._id
    });

    const populated = await visitor.populate('contactPersons', 'name role username');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update visitor photo (security)
router.patch('/:id/photo', authenticate, authorize('admin', 'security'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded' });
    
    const visitor = await Visitor.findByIdAndUpdate(
      req.params.id,
      { photo: `/uploads/${req.file.filename}` },
      { new: true }
    ).populate('contactPersons', 'name role username');

    if (!visitor) return res.status(404).json({ message: 'Visitor not found' });
    res.json(visitor);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Check out visitor (security)
router.patch('/:id/checkout', authenticate, authorize('admin', 'security'), async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) return res.status(404).json({ message: 'Visitor not found' });
    
    if (visitor.status === 'checked-out') {
      return res.status(400).json({ message: 'Visitor already checked out' });
    }

    visitor.visitOutTime = req.body.visitOutTime || new Date();
    visitor.status = 'checked-out';
    await visitor.save();

    const populated = await visitor.populate('contactPersons', 'name role username');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update meeting status (manager/hr)
router.patch('/:id/meeting', authenticate, authorize('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { meetingStatus, meetingNotes } = req.body;
    
    const visitor = await Visitor.findByIdAndUpdate(
      req.params.id,
      { 
        meetingStatus, 
        meetingNotes,
        managedBy: req.user._id 
      },
      { new: true }
    ).populate('contactPersons', 'name role username')
     .populate('managedBy', 'name role');

    if (!visitor) return res.status(404).json({ message: 'Visitor not found' });
    res.json(visitor);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Download visitor report (security)
router.get('/report/download', authenticate, authorize('admin', 'security'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const visitors = await Visitor.find(filter)
      .populate('contactPersons', 'name role')
      .sort({ createdAt: -1 });

    // Generate CSV
    const headers = ['Visitor No', 'Name', 'Mobile', 'Purpose', 'Persons', 'Vehicle', 'In Time', 'Out Time', 'Duration', 'Status', 'Contact Persons'];
    const rows = visitors.map(v => [
      v.visitorNumber,
      v.visitorName,
      v.mobileNumber,
      v.purpose,
      v.numberOfPersons,
      v.vehicleNumber || '-',
      v.visitInTime ? new Date(v.visitInTime).toLocaleString() : '-',
      v.visitOutTime ? new Date(v.visitOutTime).toLocaleString() : '-',
      v.totalTimeSpent || '-',
      v.status,
      v.contactPersons.map(cp => cp.name).join('; ')
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=visitor-report.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get stats (admin)
router.get('/stats/summary', authenticate, authorize('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [total, checkedIn, checkedOut, todayCount] = await Promise.all([
      Visitor.countDocuments(),
      Visitor.countDocuments({ status: 'checked-in' }),
      Visitor.countDocuments({ status: 'checked-out' }),
      Visitor.countDocuments({ createdAt: { $gte: today } })
    ]);

    res.json({ total, checkedIn, checkedOut, todayCount });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
