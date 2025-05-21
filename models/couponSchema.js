const mongoose = require('mongoose');
const { Schema } = mongoose;

const CouponSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Coupon name is required'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    trim: true,
    uppercase: true,
    minlength: [4, 'Code must be at least 4 characters'],
    maxlength: [20, 'Code cannot exceed 20 characters'],
    match: [/^[A-Z0-9]+$/, 'Code must contain only uppercase letters and numbers']
  },
  discountValue: {
    type: Number,
    required: [true, 'Discount percentage is required'],
    min: [0, 'Discount cannot be negative'],
    max: [100, 'Discount cannot exceed 100%']
  },
  minimumPrice: {
    type: Number,
    required: [true, 'Minimum cart value is required'],
    min: [0, 'Minimum cart value cannot be negative']
  },
  validFrom: {
    type: Date,
    required: [true, 'Start date is required']
  },
  expireOn: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  usageLimit: {
    type: Number,
    min: [0, 'Usage limit cannot be negative'],
    default: 0 // 0 means unlimited
  },
  usageCount: {
    type: Number,
    default: 0,
    min: [0, 'Usage count cannot be negative']
  },
  usedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  isList: {
    type: Boolean,
    default: true
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

CouponSchema.virtual('isActive').get(function () {
  const now = new Date();
  return this.isList && now >= this.validFrom && now <= this.expireOn;
});

CouponSchema.pre('save', function (next) {
  if (this.usageLimit > 0 && this.usageCount > this.usageLimit) {
    return next(new Error('Usage count exceeds limit'));
  }
  if (this.validFrom > this.expireOn) {
    return next(new Error('Start date must be before expiry date'));
  }
  next();
});

module.exports = mongoose.model('Coupon', CouponSchema);