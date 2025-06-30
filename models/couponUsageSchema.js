// models/couponUsageSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const CouponUsageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
  usedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CouponUsage', CouponUsageSchema);
