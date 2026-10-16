
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      trim: true,
      default: ''
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    passwordResetTokenHash: {
      type: String
    },

    passwordResetExpiresAt: {
      type: Date
    },

    isActive: {
      type: Boolean,
      default: true
    },

    hourlyRate: {
      type: Number,
      min: 0,
      default: null
    },

    role: {
      type: String,
      required: true,
      enum: ['Owner', 'Worker']
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);

