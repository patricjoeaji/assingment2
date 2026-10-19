const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  weekStart: {
    type: String,
    required: true
  },
  weekEnd: {
    type: String,
    required: true
  },
  sentAt: {
    type: Date,
    required: true
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  snapshot: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true
});

payslipSchema.index(
  { workerId: 1, weekStart: 1 },
  { unique: true }
);

module.exports = mongoose.model('Payslip', payslipSchema);
