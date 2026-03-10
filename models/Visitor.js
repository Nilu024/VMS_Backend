const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  visitorNumber: {
    type: String,
    unique: true,
    required: true
  },
  visitorName: {
    type: String,
    required: true,
    trim: true
  },
  mobileNumber: {
    type: String,
    required: true,
    trim: true
  },
  contactPersons: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  purpose: {
    type: String,
    required: true,
    trim: true
  },
  numberOfPersons: {
    type: Number,
    required: true,
    min: 1
  },
  vehicleNumber: {
    type: String,
    trim: true
  },
  visitInTime: {
    type: Date
  },
  visitOutTime: {
    type: Date
  },
  totalTimeSpent: {
    type: String
  },
  photo: {
    type: String
  },
  status: {
    type: String,
    enum: ['checked-in', 'checked-out', 'pending'],
    default: 'pending'
  },
  // Manager/HR fields
  meetingStatus: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled', 'no-show'],
  },
  meetingNotes: {
    type: String
  },
  managedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Auto-generate visitor number
visitorSchema.pre('validate', async function(next) {
  if (!this.visitorNumber) {
    const count = await mongoose.model('Visitor').countDocuments();
    this.visitorNumber = `VN${101 + count}`;
  }
  next();
});

// Auto-calculate total time spent
visitorSchema.pre('save', function(next) {
  if (this.visitInTime && this.visitOutTime) {
    const diff = new Date(this.visitOutTime) - new Date(this.visitInTime);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    this.totalTimeSpent = `${hours}h ${minutes}m`;
  }
  next();
});

module.exports = mongoose.model('Visitor', visitorSchema);
