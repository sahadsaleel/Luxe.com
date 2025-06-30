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
  discountAmount: {
    type: Number,
    required: [true, 'Discount amount is required'],
    min: [0, 'Discount cannot be negative']
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
    default: 0 
  },
  usageCount: {
    type: Number,
    default: 0,
    min: [0, 'Usage count cannot be negative']
  },
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
  if (this.discountAmount >= this.minimumPrice) {
    return next(new Error('Discount amount cannot be greater than or equal to minimum cart value'));
  }
  next();
});

module.exports = mongoose.model('Coupon', CouponSchema);