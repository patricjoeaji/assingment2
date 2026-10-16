
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },

    date: {
      type: String,
      required: true
    },

    startTime: {
      type: String,
      required: true
    },

    endTime: {
      type: String,
      required: true
    },

    location: {
      type: String,
      required: true
    },

    description: {
      type: String,
      default: ''
    },

    clientName: {
      type: String,
      required: true
    },

    clientPhone: {
      type: String,
      required: true
    },

    status: {
      type: String,
      default: 'Pending'
    },


assignedWorker: {
  type: String,
  default: null
},

clockInAt: {
  type: Date,
  default: null
},

clockOutAt: {
  type: Date,
  default: null
},

hoursApprovalStatus: {
  type: String,
  enum: ['Not Submitted', 'Pending', 'Approved'],
  default: 'Not Submitted'
},

hoursApprovedAt: {
  type: Date,
  default: null
},

hoursApprovedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null
},

approvedClockInSource: {
  type: String,
  enum: ['actual', 'scheduled', 'manual'],
  default: null
},

approvedClockOutSource: {
  type: String,
  enum: ['actual', 'scheduled', 'manual'],
  default: null
},

approvedClockInAt: {
  type: Date,
  default: null
},

approvedClockOutAt: {
  type: Date,
  default: null
},
approvedHourlyRate: {
  type: Number,
  min: 0,
  default: null
},

completionNote: {
  type: String,
  trim: true,
  default: ''
},

completionPhotos: {
  type: [String],
  default: []
},

completionSubmittedAt: {
  type: Date,
  default: null
},

payslipSentAt: {
  type: Date,
  default: null
}


  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Job', jobSchema);
