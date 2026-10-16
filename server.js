
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const Job = require('./models/job');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const {
  createPayslipPdfBuffer,
  formatPayslipCurrency,
  formatPayslipDate
} = require('./payroll/payroll-pdf');
const {
  calculateWeeklyTax,
  getAustralianFinancialYearStart,
  roundMoney
} = require('./payroll/payroll-calculations');
const { isClockInPastGracePeriod } = require('./worker-time-rules');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();

app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login', 'login.html'));
});const jobUploadDirectory = path.join(__dirname, '.private-uploads', 'jobs');
fs.mkdirSync(jobUploadDirectory, { recursive: true });

const payslipsDirectory = path.join(__dirname, '.private-uploads', 'payslips');
fs.mkdirSync(payslipsDirectory, { recursive: true });

const photoExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const completionPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: jobUploadDirectory,
    filename: (req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${photoExtensions[file.mimetype] || ''}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(
      photoExtensions[file.mimetype]
        ? null
        : new Error('Only JPG, PNG, and WebP photos are supported.'),
      Boolean(photoExtensions[file.mimetype])
    );
  }
});

function parseCompletionPhotos(req, res, next) {
  completionPhotoUpload.array('photos')(req, res, error => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    next();
  });
}

function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone || '',
    email: user.email,
    role: user.role,
    isActive: user.isActive !== false,
    hourlyRate: user.hourlyRate ?? null
  };
}

function requireSelf(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Please sign in.' });
  }

  if (String(req.session.userId) !== req.params.id) {
    return res.status(403).json({ message: 'You cannot change another account.' });
  }

  next();
}

async function requireOwner(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Please sign in as an owner.' });
  }

  try {
    const owner = await User.findById(req.session.userId);

    if (!owner || owner.role !== 'Owner' || owner.isActive === false) {
      return res.status(403).json({ message: 'Owner access is required.' });
    }

    req.owner = owner;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify owner access.' });
  }
}

async function requireWorker(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Please sign in as a worker.' });
  }

  try {
    const worker = await User.findById(req.session.userId);

    if (!worker || worker.role !== 'Worker' || worker.isActive === false) {
      return res.status(403).json({ message: 'Active worker access is required.' });
    }

    req.worker = worker;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify worker access.' });
  }
}

async function requireCompletedJobAccess(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Please sign in to view this job.' });
  }

  try {
    const user = await User.findById(req.session.userId);
    const job = await Job.findById(req.params.id);

    if (!user || !job) {
      return res.status(404).json({ message: 'Completed job not found.' });
    }

    const isOwner = user.role === 'Owner' && user.isActive !== false;
    const isAssignedWorker = user.role === 'Worker' &&
      user.isActive !== false && job.assignedWorker === user.name;

    if (!isOwner && !isAssignedWorker) {
      return res.status(403).json({ message: 'You cannot view this completed job.' });
    }

    req.completedJob = job;
    req.completedJobViewer = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify job access.' });
  }
}

function getWeekRange(value) {
  const requestedDate = value || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return null;

  const start = new Date(`${requestedDate}T00:00:00.000Z`);
  if (Number.isNaN(start.valueOf()) || start.toISOString().slice(0, 10) !== requestedDate) {
    return null;
  }

  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function getBrisbaneParts(value) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function getBrisbaneWallMinutes(value) {
  const parts = getBrisbaneParts(value);

  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  ) / 60000;
}

function getSourceClockTime(job, kind, source, manualTime) {
  if (source === 'actual') {
    const value = kind === 'in' ? job.clockInAt : job.clockOutAt;
    if (!value) return '';
    const parts = getBrisbaneParts(value);
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  }

  if (source === 'manual') return manualTime || '';
  return kind === 'in' ? job.startTime : job.endTime;
}

function brisbaneTimeToDate(dateValue, timeValue, dayOffset = 0) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset, hour - 10, minute));
}

function getApprovedClockAt(job, kind, source, manualTime, clockInSource, manualClockIn) {
  const actualValue = kind === 'in' ? job.clockInAt : job.clockOutAt;
  if (source === 'actual') return actualValue ? new Date(actualValue) : null;

  const timeValue = getSourceClockTime(job, kind, source, manualTime);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) return null;

  let dateValue = job.date;
  const clockInTime = getSourceClockTime(job, 'in', clockInSource, manualClockIn);
  if (kind === 'out' && clockInSource === 'actual' && job.clockInAt) {
    const actualClockIn = getBrisbaneParts(job.clockInAt);
    dateValue = `${actualClockIn.year}-${String(actualClockIn.month).padStart(2, '0')}-${String(actualClockIn.day).padStart(2, '0')}`;
  }

  const nextDay = kind === 'out' && clockInTime && timeValue < clockInTime ? 1 : 0;
  return brisbaneTimeToDate(dateValue, timeValue, nextDay);
}

function getApprovedClockMinutes(job, kind, source, manualTime, clockInSource, manualClockIn) {
  const approvedAt = kind === 'in' ? job.approvedClockInAt : job.approvedClockOutAt;
  const clockAt = approvedAt || getApprovedClockAt(
    job,
    kind,
    source,
    manualTime,
    clockInSource,
    manualClockIn
  );

  return clockAt ? getBrisbaneWallMinutes(clockAt) : null;
}

function getApprovedJobMinutes(job) {
  const clockInSource = job.approvedClockInSource ||
    (job.clockInAt ? 'actual' : String(job.status).toLowerCase() === 'finished' ? 'manual' : 'scheduled');
  const clockOutSource = job.approvedClockOutSource ||
    (job.clockOutAt ? 'actual' : String(job.status).toLowerCase() === 'finished' ? 'manual' : 'scheduled');
  const clockInMinutes = getApprovedClockMinutes(job, 'in', clockInSource, '', clockInSource, '');
  const clockOutMinutes = getApprovedClockMinutes(job, 'out', clockOutSource, '', clockInSource, '');

  return clockInMinutes === null || clockOutMinutes === null
    ? null
    : Math.max(0, clockOutMinutes - clockInMinutes);
}

function aggregateYtdPayroll(jobs, workersByName) {
  const payrollByWorkerWeek = new Map();

  jobs.forEach(job => {
    const minutes = getApprovedJobMinutes(job);
    if (!minutes) return;

    const worker = workersByName.get(job.assignedWorker);
    const hourlyRate = job.approvedHourlyRate ?? worker?.hourlyRate ?? null;
    const hasRate = hourlyRate !== null && Number.isFinite(Number(hourlyRate)) && Number(hourlyRate) >= 0;
    const weekStart = getWeekRange(job.date).start;
    const key = `${job.assignedWorker}\u0000${weekStart}`;
    const weekly = payrollByWorkerWeek.get(key) || {
      name: job.assignedWorker,
      weekStart,
      minutes: 0,
      gross: 0,
      missingRate: false
    };

    weekly.minutes += minutes;
    if (!hasRate) {
      weekly.gross = null;
      weekly.missingRate = true;
    } else if (weekly.gross !== null) {
      weekly.gross += roundMoney((minutes / 60) * Number(hourlyRate));
    }
    payrollByWorkerWeek.set(key, weekly);
  });

  const ytdByWorker = new Map();
  [...payrollByWorkerWeek.values()]
    .sort((first, second) => first.weekStart.localeCompare(second.weekStart))
    .forEach(weekly => {
      const ytd = ytdByWorker.get(weekly.name) || {
        minutes: 0,
        gross: 0,
        superAmount: 0,
        tax: 0,
        missingRate: false
      };
      ytd.minutes += weekly.minutes;
      if (weekly.missingRate || weekly.gross === null) {
        ytd.missingRate = true;
        ytd.gross = null;
        ytd.superAmount = null;
        ytd.tax = null;
      } else if (!ytd.missingRate) {
        ytd.gross += weekly.gross;
        ytd.superAmount += roundMoney(weekly.gross * 0.12);
        const taxYearStart = getAustralianFinancialYearStart(getWeekRange(weekly.weekStart).end);
        ytd.tax += calculateWeeklyTax(weekly.gross, taxYearStart);
      }
      ytdByWorker.set(weekly.name, ytd);
    });

  return [...ytdByWorker.entries()].map(([name, ytd]) => ({
    name,
    minutes: ytd.minutes,
    rate: ytd.missingRate || !ytd.minutes
      ? null
      : roundMoney(ytd.gross / (ytd.minutes / 60)),
    gross: ytd.missingRate ? null : roundMoney(ytd.gross),
    superAmount: ytd.superAmount === null ? null : roundMoney(ytd.superAmount),
    tax: ytd.tax === null ? null : roundMoney(ytd.tax),
    netPay: ytd.gross === null || ytd.tax === null
      ? null
      : roundMoney(ytd.gross - ytd.tax)
  }));
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working' });
});

app.post('/api/password-reset/request', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return res.status(503).json({
        message: 'Password reset email is not configured. Please contact the administrator.'
      });
    }

    const user = await User.findOne({ email });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetTokenHash = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
      user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: smtpUser, pass: smtpPass }
      });
      const resetUrl = new URL('/reset%20password/reset-password.html', process.env.APP_URL || 'http://localhost:3000');
      resetUrl.searchParams.set('token', resetToken);

      try {
        await transporter.sendMail({
          from: smtpFrom,
          to: user.email,
          subject: 'Reset your JobFlow password',
          text: `Use this link within 30 minutes to reset your password: ${resetUrl}`
        });
      } catch (error) {
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpiresAt = undefined;
        await user.save();
        throw error;
      }
    }

    res.json({
      message: 'If an account exists for that email, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Unable to send the reset email. Please try again later.' });
  }
});

app.post('/api/password-reset/confirm', async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');

    if (!token || password.length < 8) {
      return res.status(400).json({
        message: 'A valid reset link and a password of at least 8 characters are required.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'This reset link is invalid or has expired. Please request a new one.'
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    req.session.userId = String(user._id);

    res.json({
      message: 'Password updated.',
      user: toPublicUser(user)
    });
  } catch (error) {
    console.error('Password reset confirmation error:', error);
    res.status(500).json({ message: 'Unable to reset the password. Please try again later.' });
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();

    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    if (user.role === 'Worker' && user.isActive === false) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    req.session.userId = String(user._id);

    res.json({
      message: 'Login successful.',
      user: toPublicUser(user)
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

app.get('/api/workers', requireOwner, async (req, res) => {
  try {
    const workers = await User.find({ role: 'Worker' }).sort({ name: 1 });
    res.json(workers.map(toPublicUser));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load workers.' });
  }
});

app.post('/api/workers', requireOwner, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || !phone || password.length < 8) {
      return res.status(400).json({
        message: 'Name, email, phone, and a password of at least 8 characters are required.'
      });
    }

    const worker = await User.create({
      name,
      phone,
      email,
      password: await bcrypt.hash(password, 10),
      role: 'Worker',
      isActive: true
    });

    res.status(201).json({
      message: 'Worker added.',
      worker: toPublicUser(worker)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'That email is already in use.' });
    }

    res.status(400).json({ message: error.message });
  }
});

app.patch('/api/workers/:id/status', requireOwner, async (req, res) => {
  try {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ message: 'A worker status is required.' });
    }

    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'Worker' },
      { isActive: req.body.isActive },
      { new: true, runValidators: true }
    );

    if (!worker) {
      return res.status(404).json({ message: 'Worker not found.' });
    }

    res.json({
      message: req.body.isActive ? 'Worker activated.' : 'Worker deactivated.',
      worker: toPublicUser(worker)
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.patch('/api/workers/:id/rate', requireOwner, async (req, res) => {
  try {
    const hourlyRate = req.body.hourlyRate === null || req.body.hourlyRate === ''
      ? null
      : Number(req.body.hourlyRate);

    if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      return res.status(400).json({ message: 'Hourly rate must be a non-negative number.' });
    }

    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'Worker' },
      { hourlyRate },
      { new: true, runValidators: true }
    );

    if (!worker) {
      return res.status(404).json({ message: 'Worker not found.' });
    }

    res.json({ message: 'Hourly rate updated.', worker: toPublicUser(worker) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/jobs/:id/clock-in', requireWorker, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (
      job.assignedWorker !== req.worker.name ||
      String(job.status).toLowerCase() !== 'accepted'
    ) {
      return res.status(403).json({ message: 'This job is not assigned to you.' });
    }

    if (job.clockInAt || job.clockOutAt) {
      return res.status(409).json({ message: 'Clock-in has already been recorded.' });
    }

    if (isClockInPastGracePeriod(job)) {
      return res.status(409).json({
        message: 'Clock-in is unavailable more than 1 hour after the scheduled start time.'
      });
    }

    job.clockInAt = new Date();
    job.hoursApprovalStatus = 'Not Submitted';
    await job.save();
    res.json(job);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/jobs/:id/clock-out', requireWorker, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (
      job.assignedWorker !== req.worker.name ||
      String(job.status).toLowerCase() !== 'accepted'
    ) {
      return res.status(403).json({ message: 'This job is not assigned to you.' });
    }

    if (!job.clockInAt || job.clockOutAt) {
      return res.status(409).json({ message: 'A valid clock-in is required first.' });
    }

    job.clockOutAt = new Date();
    job.hoursApprovalStatus = 'Not Submitted';
    job.hoursApprovedAt = null;
    job.hoursApprovedBy = null;
    job.approvedClockInSource = null;
    job.approvedClockOutSource = null;
    await job.save();

    res.json(job);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post('/api/jobs/:id/completion', requireWorker, parseCompletionPhotos, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (
      job.assignedWorker !== req.worker.name ||
      String(job.status).toLowerCase() !== 'accepted'
    ) {
      return res.status(403).json({ message: 'This job is not assigned to you.' });
    }

    if (job.completionSubmittedAt) {
      return res.status(409).json({ message: 'This job has already been submitted.' });
    }

    job.completionNote = String(req.body.note || '').trim();
    job.completionPhotos = (req.files || []).map(file => file.filename);
    job.completionSubmittedAt = new Date();
    job.status = 'Finished';
    job.hoursApprovalStatus = 'Pending';
    job.hoursApprovedAt = null;
    job.hoursApprovedBy = null;
    job.approvedClockInSource = null;
    job.approvedClockOutSource = null;
    job.approvedClockInAt = null;
    job.approvedClockOutAt = null;
    job.approvedHourlyRate = null;
    await job.save();

    res.json({ message: 'Completed job submitted for approval.', job });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/timesheets', requireOwner, async (req, res) => {
  try {
    const week = getWeekRange(req.query.weekStart);

    if (!week) {
      return res.status(400).json({ message: 'A valid weekStart date is required.' });
    }

    const jobs = await Job.find({
      date: { $gte: week.start, $lte: week.end },
      assignedWorker: { $type: 'string', $ne: '' }
    }).sort({ date: 1, startTime: 1, assignedWorker: 1 });

    res.json({
      weekStart: week.start,
      weekEnd: week.end,
      jobs: jobs.map(job => {
        return {
          id: String(job._id),
          title: job.title,
          date: job.date,
          startTime: job.startTime,
          endTime: job.endTime,
          status: job.status,
          location: job.location,
          assignedWorker: job.assignedWorker,
          clockInAt: job.clockInAt,
          clockOutAt: job.clockOutAt,
          hoursApprovalStatus: job.hoursApprovalStatus || 'Not Submitted',
          approvedClockInSource: job.approvedClockInSource,
          approvedClockOutSource: job.approvedClockOutSource,
          approvedClockInAt: job.approvedClockInAt,
          approvedClockOutAt: job.approvedClockOutAt,
          approvedHourlyRate: job.approvedHourlyRate,
          completionSubmittedAt: job.completionSubmittedAt,
          payslipSentAt: job.payslipSentAt,
          approvedTotalMinutes: getApprovedJobMinutes(job)
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load weekly timesheets.' });
  }
});

app.get('/api/worker/payslip', requireWorker, async (req, res) => {
  try {
    const week = getWeekRange(req.query.weekStart);
    if (!week) {
      return res.status(400).json({ message: 'A valid weekStart date is required.' });
    }

    const workerName = req.worker.name;
    const yearStart = getAustralianFinancialYearStart(week.end);

    const currentJobs = await Job.find({
      date: { $gte: week.start, $lte: week.end },
      assignedWorker: workerName,
      hoursApprovalStatus: 'Approved'
    }).sort({ date: 1, startTime: 1 });

    const priorJobs = await Job.find({
      date: { $gte: yearStart, $lt: week.start },
      assignedWorker: workerName,
      hoursApprovalStatus: 'Approved'
    }).sort({ date: 1, startTime: 1 });

    const workersByName = new Map([[workerName, req.worker]]);
    const priorYtdList = aggregateYtdPayroll(priorJobs, workersByName);
    const priorYtd = priorYtdList.length ? priorYtdList[0] : {
      minutes: 0,
      gross: 0,
      superAmount: 0,
      tax: 0,
      net: 0,
      missingRate: false
    };

    const days = Array(7).fill(0);
    let currentMinutes = 0;
    let currentGross = 0;
    let missingRate = false;

    currentJobs.forEach(job => {
      const jobMinutes = getApprovedJobMinutes(job) || 0;
      const jobDate = new Date(`${job.date}T00:00:00`);
      const dayIndex = (jobDate.getDay() + 6) % 7;
      days[dayIndex] += jobMinutes;
      currentMinutes += jobMinutes;

      const hourlyRate = job.approvedHourlyRate ?? req.worker.hourlyRate;
      if (hourlyRate === null || hourlyRate === undefined || !Number.isFinite(Number(hourlyRate)) || Number(hourlyRate) < 0) {
        missingRate = true;
      } else {
        currentGross += roundMoney((jobMinutes / 60) * Number(hourlyRate));
      }
    });

    if (missingRate) {
      currentGross = null;
    }

    const currentSuper = currentGross === null ? null : roundMoney(currentGross * 0.12);
    const currentTax = currentGross === null ? null : calculateWeeklyTax(currentGross, yearStart);
    const currentNet = currentGross === null ? null : roundMoney(currentGross - currentTax);

    const ytdMinutes = priorYtd.minutes + currentMinutes;
    let ytdGross = null;
    let ytdSuper = null;
    let ytdTax = null;
    let ytdNet = null;

    if (!priorYtd.missingRate && !missingRate && currentGross !== null) {
      ytdGross = roundMoney((priorYtd.gross || 0) + currentGross);
      ytdSuper = roundMoney((priorYtd.superAmount || 0) + currentSuper);
      ytdTax = roundMoney((priorYtd.tax || 0) + currentTax);
      ytdNet = roundMoney(ytdGross - ytdTax);
    }

    res.json({
      worker: {
        name: req.worker.name,
        hourlyRate: req.worker.hourlyRate
      },
      weekStart: week.start,
      weekEnd: week.end,
      yearStart,
      days,
      isSent: currentJobs.length > 0 && currentJobs.every(j => Boolean(j.payslipSentAt)),
      current: {
        minutes: currentMinutes,
        gross: currentGross,
        superAmount: currentSuper,
        tax: currentTax,
        net: currentNet,
        hourlyRate: req.worker.hourlyRate
      },
      ytd: {
        minutes: ytdMinutes,
        gross: ytdGross,
        superAmount: ytdSuper,
        tax: ytdTax,
        net: ytdNet,
        hourlyRate: req.worker.hourlyRate
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/worker/payslip/download', requireWorker, async (req, res) => {
  try {
    const week = getWeekRange(req.query.weekStart);
    if (!week) {
      return res.status(400).json({ message: 'A valid weekStart date is required.' });
    }

    const workerName = req.worker.name;
    const workerSlug = workerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const pdfFilename = `payslip-${workerSlug}-${week.start}.pdf`;
    const pdfPath = path.join(payslipsDirectory, pdfFilename);

    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
      return res.sendFile(pdfPath);
    }

    // Generate on the fly if not yet on disk
    const yearStart = getAustralianFinancialYearStart(week.end);
    const currentJobs = await Job.find({
      date: { $gte: week.start, $lte: week.end },
      assignedWorker: workerName,
      hoursApprovalStatus: 'Approved'
    }).sort({ date: 1, startTime: 1 });

    const priorJobs = await Job.find({
      date: { $gte: yearStart, $lt: week.start },
      assignedWorker: workerName,
      hoursApprovalStatus: 'Approved'
    }).sort({ date: 1, startTime: 1 });

    const workersByName = new Map([[workerName, req.worker]]);
    const priorYtdList = aggregateYtdPayroll(priorJobs, workersByName);
    const priorYtd = priorYtdList.length ? priorYtdList[0] : {
      minutes: 0,
      gross: 0,
      superAmount: 0,
      tax: 0,
      net: 0,
      missingRate: false
    };

    let currentMinutes = 0;
    const lines = [];
    currentJobs.forEach(job => {
      const minutes = getApprovedJobMinutes(job) || 0;
      currentMinutes += minutes;
      const rate = job.approvedHourlyRate ?? req.worker.hourlyRate ?? 0;
      const amount = roundMoney((minutes / 60) * rate);
      lines.push({
        title: job.title || 'Job',
        date: job.date,
        minutes,
        rate,
        amount
      });
    });

    const gross = lines.reduce((total, job) => total + job.amount, 0);
    const currentTax = calculateWeeklyTax(gross, yearStart);
    const currentSuper = roundMoney(gross * 0.12);
    const currentRate = currentMinutes > 0 ? roundMoney(gross / (currentMinutes / 60)) : Number(req.worker.hourlyRate || 0);

    const ytd = {
      minutes: priorYtd.minutes + currentMinutes,
      rate: priorYtd.minutes + currentMinutes > 0
        ? roundMoney(((priorYtd.gross || 0) + gross) / ((priorYtd.minutes + currentMinutes) / 60))
        : currentRate,
      gross: roundMoney((priorYtd.gross || 0) + gross),
      superAmount: roundMoney((priorYtd.superAmount || 0) + currentSuper),
      tax: roundMoney((priorYtd.tax || 0) + currentTax),
      netPay: roundMoney(((priorYtd.gross || 0) - (priorYtd.tax || 0)) + gross - currentTax)
    };

    const payslip = {
      worker: req.worker,
      week,
      jobs: lines,
      minutes: currentMinutes,
      rate: currentRate,
      gross,
      superAmount: currentSuper,
      tax: currentTax,
      netPay: roundMoney(gross - currentTax),
      current: {
        minutes: currentMinutes,
        rate: currentRate,
        superAmount: currentSuper,
        gross,
        tax: currentTax,
        netPay: roundMoney(gross - currentTax)
      },
      ytd
    };

    const pdfBuffer = await createPayslipPdfBuffer(payslip);
    try {
      fs.writeFileSync(pdfPath, pdfBuffer);
    } catch (e) {}

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/payroll/ytd', requireOwner, async (req, res) => {
  try {
    const through = String(req.query.through || '');
    const week = getWeekRange(through);
    if (!week) {
      return res.status(400).json({ message: 'A valid payroll period end date is required.' });
    }

    const yearStart = getAustralianFinancialYearStart(through);
    const jobs = await Job.find({
      date: { $gte: yearStart, $lt: week.start },
      assignedWorker: { $type: 'string', $ne: '' },
      hoursApprovalStatus: 'Approved'
    }).sort({ date: 1, startTime: 1, assignedWorker: 1 });
    const workerNames = [...new Set(jobs.map(job => job.assignedWorker))];
    const workerRecords = await User.find({ role: 'Worker', name: { $in: workerNames } });
    const workersByName = new Map(workerRecords.map(worker => [worker.name, worker]));

    res.json({
      yearStart,
      through,
      workers: aggregateYtdPayroll(jobs, workersByName)
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load year-to-date payroll.' });
  }
});

app.post('/api/payroll/send-payslips', requireOwner, async (req, res) => {
  try {
    const week = getWeekRange(req.body.weekStart);
    if (!week) {
      return res.status(400).json({ message: 'A valid weekStart date is required.' });
    }

    const jobs = await Job.find({
      date: { $gte: week.start, $lte: week.end },
      assignedWorker: { $type: 'string', $ne: '' },
      hoursApprovalStatus: 'Approved'
    }).sort({ date: 1, startTime: 1, assignedWorker: 1 });

    const workerNames = [...new Set(jobs.map(job => job.assignedWorker))];
    if (!workerNames.length) {
      return res.status(400).json({ message: 'No approved hours to pay for this week.' });
    }

    const workerRecords = await User.find({ role: 'Worker', name: { $in: workerNames } });
    const workersByName = new Map(workerRecords.map(worker => [worker.name, worker]));
    const payrollByWorker = new Map();
    const yearStart = getAustralianFinancialYearStart(week.end);
    const priorJobs = week.start > yearStart
      ? await Job.find({
        date: { $gte: yearStart, $lt: week.start },
        assignedWorker: { $in: workerNames },
        hoursApprovalStatus: 'Approved'
      }).sort({ date: 1, startTime: 1, assignedWorker: 1 })
      : [];
    const priorYtdByName = new Map(
      aggregateYtdPayroll(priorJobs, workersByName).map(worker => [worker.name, worker])
    );

    jobs.forEach(job => {
      const minutes = getApprovedJobMinutes(job) || 0;
      if (!minutes) return;

      const worker = workersByName.get(job.assignedWorker);
      const hourlyRate = job.approvedHourlyRate ?? worker?.hourlyRate ?? null;
      const amount = hourlyRate !== null && Number.isFinite(Number(hourlyRate)) && Number(hourlyRate) >= 0
        ? roundMoney((minutes / 60) * Number(hourlyRate))
        : null;
      const payroll = payrollByWorker.get(job.assignedWorker) || {
        worker,
        minutes: 0,
        jobs: []
      };
      payroll.minutes += minutes;
      payroll.jobs.push({
        title: job.title || 'Job',
        date: job.date,
        minutes,
        rate: hourlyRate,
        amount
      });
      payrollByWorker.set(job.assignedWorker, payroll);
    });

    const payrollEntries = [...payrollByWorker.values()];
    if (!payrollEntries.length) {
      return res.status(400).json({ message: 'No approved hours to pay for this week.' });
    }

    const missingRate = payrollEntries.find(entry => entry.jobs.some(job => job.amount === null));
    if (missingRate) {
      return res.status(409).json({ message: `Set an hourly rate for ${missingRate.worker.name} before pushing payslips.` });
    }

    const missingYtdRate = payrollEntries.find(entry =>
      priorYtdByName.get(entry.worker.name)?.gross === null
    );
    if (missingYtdRate) {
      return res.status(409).json({ message: `Set rates for ${missingYtdRate.worker.name}'s historical hours before pushing payslips.` });
    }

    const payslips = await Promise.all(payrollEntries.map(async entry => {
      const gross = entry.jobs.reduce((total, job) => total + job.amount, 0);
      const currentTax = calculateWeeklyTax(gross, yearStart);
      const currentSuper = roundMoney(gross * 0.12);
      const currentRate = entry.minutes > 0 ? roundMoney(gross / (entry.minutes / 60)) : Number(entry.worker.hourlyRate);
      const prior = priorYtdByName.get(entry.worker.name) || {
        minutes: 0,
        gross: 0,
        superAmount: 0,
        tax: 0,
        rate: currentRate
      };
      const ytd = {
        minutes: prior.minutes + entry.minutes,
        rate: prior.minutes + entry.minutes > 0
          ? roundMoney((prior.gross + gross) / ((prior.minutes + entry.minutes) / 60))
          : currentRate,
        gross: roundMoney(prior.gross + gross),
        superAmount: roundMoney(prior.superAmount + currentSuper),
        tax: roundMoney(prior.tax + currentTax),
        netPay: roundMoney(prior.netPay ?? (prior.gross - prior.tax) + gross - currentTax)
      };
      const payslip = {
        worker: entry.worker,
        week,
        jobs: entry.jobs,
        minutes: entry.minutes,
        rate: currentRate,
        gross,
        superAmount: currentSuper,
        tax: currentTax,
        netPay: roundMoney(gross - currentTax),
        current: {
          minutes: entry.minutes,
          rate: currentRate,
          superAmount: currentSuper,
          gross,
          tax: currentTax,
          netPay: roundMoney(gross - currentTax)
        },
        ytd
      };
      payslip.pdf = await createPayslipPdfBuffer(payslip);
      return payslip;
    }));

    // Save generated PDF files to payslipsDirectory
    for (const payslip of payslips) {
      const workerSlug = (payslip.worker?.name || 'worker').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const pdfPath = path.join(payslipsDirectory, `payslip-${workerSlug}-${week.start}.pdf`);
      try {
        fs.writeFileSync(pdfPath, payslip.pdf);
      } catch (e) {
        console.error('Failed to write payslip PDF to disk:', e);
      }
    }

    // Mark all jobs in this week as payslipSentAt
    const now = new Date();
    await Job.updateMany(
      {
        _id: { $in: jobs.map(j => j._id) }
      },
      {
        $set: { payslipSentAt: now }
      }
    );

    res.json({
      message: `Payslips pushed to ${payslips.length} ${payslips.length === 1 ? 'worker' : 'workers'} in app.`,
      sentCount: payslips.length,
      recipientCount: payslips.length
    });
  } catch (error) {
    console.error('Send payroll payslips error:', error);
    res.status(500).json({ message: error.message || 'Unable to push payslips.' });
  }
});

app.patch('/api/jobs/:id/hours-approval/undo', requireOwner, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }
    if (!job.completionSubmittedAt || job.hoursApprovalStatus !== 'Approved') {
      return res.status(409).json({ message: 'This job does not have an approved timesheet to undo.' });
    }

    job.hoursApprovalStatus = 'Pending';
    job.hoursApprovedAt = null;
    job.hoursApprovedBy = null;
    job.approvedClockInSource = null;
    job.approvedClockOutSource = null;
    job.approvedClockInAt = null;
    job.approvedClockOutAt = null;
    job.approvedHourlyRate = null;
    await job.save();

    res.json({ message: 'Approval undone. The timesheet is awaiting approval again.', job });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.patch('/api/jobs/:id/hours-approval', requireOwner, async (req, res) => {
  try {
    const clockInSource = String(req.body.clockInSource || '');
    const clockOutSource = String(req.body.clockOutSource || '');

    const clockInManual = String(req.body.clockInManual || '').trim();
    const clockOutManual = String(req.body.clockOutManual || '').trim();
    const allowedSources = ['actual', 'scheduled', 'manual'];

    if (!allowedSources.includes(clockInSource) || !allowedSources.includes(clockOutSource)) {
      return res.status(400).json({ message: 'Choose a valid source for both clock entries.' });
    }

    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (
      !job.completionSubmittedAt ||
      String(job.status).toLowerCase() !== 'finished' ||
      job.hoursApprovalStatus === 'Approved'
    ) {
      return res.status(409).json({ message: 'This timesheet is not awaiting approval.' });
    }

    if (clockInSource === 'actual' && !job.clockInAt) {
      return res.status(400).json({ message: 'No actual clock-in is recorded; choose scheduled or manual time.' });
    }

    if (clockOutSource === 'actual' && !job.clockOutAt) {
      return res.status(400).json({ message: 'No actual clock-out is recorded; choose scheduled or manual time.' });
    }

    if (clockInSource === 'manual' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clockInManual)) {
      return res.status(400).json({ message: 'Enter a valid manual clock-in time.' });
    }

    if (clockOutSource === 'manual' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clockOutManual)) {
      return res.status(400).json({ message: 'Enter a valid manual clock-out time.' });
    }

    const approvedClockInAt = getApprovedClockAt(
      job,
      'in',
      clockInSource,
      clockInManual,
      clockInSource,
      clockInManual
    );
    const approvedClockOutAt = getApprovedClockAt(
      job,
      'out',
      clockOutSource,
      clockOutManual,
      clockInSource,
      clockInManual
    );

    if (!approvedClockInAt || !approvedClockOutAt || approvedClockOutAt <= approvedClockInAt) {
      return res.status(400).json({ message: 'Approved clock-out must be later than clock-in.' });
    }

    job.hoursApprovalStatus = 'Approved';
    job.approvedClockInSource = clockInSource;
    job.approvedClockOutSource = clockOutSource;
    job.approvedClockInAt = approvedClockInAt;
    job.approvedClockOutAt = approvedClockOutAt;
    const assignedWorker = await User.findOne({ role: 'Worker', name: job.assignedWorker });
    job.approvedHourlyRate = assignedWorker?.hourlyRate ?? null;
    job.hoursApprovedAt = new Date();
    job.hoursApprovedBy = req.owner._id;
    await job.save();

    res.json({ message: 'Hours approved.', job });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/jobs/:id/completed-details', requireCompletedJobAccess, async (req, res) => {
  try {
    const job = req.completedJob;

    if (!job.completionSubmittedAt || String(job.status).toLowerCase() !== 'finished') {
      return res.status(409).json({ message: 'This job has not been submitted as finished.' });
    }

    const worker = await User.findOne({ role: 'Worker', name: job.assignedWorker })
      .select('name phone email');
    const actualMinutes = job.clockInAt && job.clockOutAt
      ? Math.max(0, getBrisbaneWallMinutes(job.clockOutAt) - getBrisbaneWallMinutes(job.clockInAt))
      : null;
    const clockInSource = job.approvedClockInSource ||
      (job.clockInAt ? 'actual' : 'scheduled');
    const clockOutSource = job.approvedClockOutSource ||
      (job.clockOutAt ? 'actual' : 'scheduled');
    const approvedClockInAt = job.approvedClockInAt || getApprovedClockAt(
      job,
      'in',
      clockInSource,
      '',
      clockInSource,
      ''
    );
    const approvedClockOutAt = job.approvedClockOutAt || getApprovedClockAt(
      job,
      'out',
      clockOutSource,
      '',
      clockInSource,
      ''
    );

    res.json({
      id: String(job._id),
      title: job.title,
      date: job.date,
      startTime: job.startTime,
      endTime: job.endTime,
      location: job.location,
      description: job.description,
      clientName: job.clientName,
      clientPhone: job.clientPhone,
      assignedWorker: job.assignedWorker,
      worker: worker ? toPublicUser(worker) : null,
      clockInAt: job.clockInAt,
      clockOutAt: job.clockOutAt,
      actualMinutes,
      hoursApprovalStatus: job.hoursApprovalStatus || 'Not Submitted',
      approvedClockInSource: job.approvedClockInSource,
      approvedClockOutSource: job.approvedClockOutSource,
      approvedClockInAt: job.approvedClockInAt,
      approvedClockOutAt: job.approvedClockOutAt,
      suggestedClockInAt: approvedClockInAt,
      suggestedClockOutAt: approvedClockOutAt,
      approvedMinutes: Math.max(
        0,
        getBrisbaneWallMinutes(approvedClockOutAt) - getBrisbaneWallMinutes(approvedClockInAt)
      ),
      completionNote: job.completionNote,
      completionPhotos: job.completionPhotos.map(filename => ({
        url: `/api/completed-jobs/${job._id}/photos/${encodeURIComponent(filename)}`,
        alt: `${job.title} completed work photo`
      })),
      completionSubmittedAt: job.completionSubmittedAt,
      hoursApprovedAt: job.hoursApprovedAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load completed job details.' });
  }
});

app.get('/api/completed-jobs/:id/photos/:filename', requireCompletedJobAccess, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const job = req.completedJob;

    if (!job || !job.completionPhotos.includes(filename)) {
      return res.status(404).json({ message: 'Photo not found.' });
    }

    res.sendFile(path.join(jobUploadDirectory, filename));
  } catch (error) {
    res.status(404).json({ message: 'Photo not found.' });
  }
});

app.put('/api/users/:id/profile', requireSelf, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({
        message: 'Name and email are required.'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    user.name = name;
    user.phone = phone;
    user.email = email;
    await user.save();

    res.json({
      message: 'Profile updated.',
      user: toPublicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'That email is already in use.' });
    }

    res.status(400).json({ message: error.message });
  }
});

app.put('/api/users/:id/password', requireSelf, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!currentPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: 'Enter your current password and a new password of at least 8 characters.'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create a new job
app.post('/api/jobs', requireOwner, async (req, res) => {
  try {
    const job = new Job(req.body);
    const savedJob = await job.save();

    res.status(201).json(savedJob);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});
// Get all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: 'Please sign in to view jobs.' });
    }

    const viewer = await User.findById(req.session.userId);
    if (!viewer || viewer.isActive === false || !['Owner', 'Worker'].includes(viewer.role)) {
      return res.status(403).json({ message: 'Active Owner or Worker access is required.' });
    }

    const filter = viewer.role === 'Owner' ? {} : { assignedWorker: viewer.name };
    const jobs = await Job.find(filter).sort({
      date: 1,
      startTime: 1
    });

    res.json(jobs);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// Get one job
app.get('/api/jobs/:id', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: 'Please sign in to view this job.' });
    }

    const viewer = await User.findById(req.session.userId);
    if (!viewer || viewer.isActive === false || !['Owner', 'Worker'].includes(viewer.role)) {
      return res.status(403).json({ message: 'Active Owner or Worker access is required.' });
    }

    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: 'Job not found'
      });
    }

    if (viewer.role === 'Worker' && job.assignedWorker !== viewer.name) {
      return res.status(403).json({ message: 'This job is not assigned to you.' });
    }

    const responseJob = job.toObject();
    responseJob.clockInWindowExpired =
      viewer.role === 'Worker' && isClockInPastGracePeriod(job);
    res.json(responseJob);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});


// Update one job
app.put('/api/jobs/:id', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: 'Please sign in to update this job.' });
    }

    const viewer = await User.findById(req.session.userId);
    if (!viewer || viewer.isActive === false || !['Owner', 'Worker'].includes(viewer.role)) {
      return res.status(403).json({ message: 'Active Owner or Worker access is required.' });
    }

    if (viewer.role === 'Worker') {
      const fields = Object.keys(req.body);
      if (fields.length !== 1 || fields[0] !== 'status') {
        return res.status(403).json({ message: 'Workers can only respond to their assigned job offers.' });
      }
      if (!['Accepted', 'Declined'].includes(req.body.status)) {
        return res.status(400).json({ message: 'Workers can only accept or decline an offer.' });
      }

      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ message: 'Job not found.' });
      if (job.assignedWorker !== viewer.name) {
        return res.status(403).json({ message: 'This job is not assigned to you.' });
      }
      if (String(job.status).toLowerCase() !== 'pending') {
        return res.status(409).json({ message: 'This offer is no longer awaiting a response.' });
      }

      job.status = req.body.status;
      await job.save();
      return res.json(job);
    }

    if (viewer.role !== 'Owner') {
      return res.status(403).json({ message: 'Owner access is required.' });
    }

    const updates = { ...req.body };
    delete updates.clockInAt;
    delete updates.clockOutAt;
    delete updates.hoursApprovalStatus;
    delete updates.hoursApprovedAt;
    delete updates.hoursApprovedBy;
    delete updates.approvedHourlyRate;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found.' });

    const assignmentChanged = Object.hasOwn(req.body, 'assignedWorker') &&
      String(req.body.assignedWorker || '') !== String(job.assignedWorker || '');
    Object.assign(job, updates);

    if (assignmentChanged) {
      job.status = req.body.status || 'Pending';
      job.clockInAt = null;
      job.clockOutAt = null;
      job.hoursApprovalStatus = 'Not Submitted';
      job.hoursApprovedAt = null;
      job.hoursApprovedBy = null;
      job.approvedClockInSource = null;
      job.approvedClockOutSource = null;
      job.approvedClockInAt = null;
      job.approvedClockOutAt = null;
      job.approvedHourlyRate = null;
      job.completionSubmittedAt = null;
      job.completionNote = '';
      job.completionPhotos = [];
    }

    await job.save();
    res.json(job);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
