const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, 'Quantity must be at least 1']
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative']
    },
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price cannot be negative']
    },
    status: {
      type: String,
      default: 'placed'
    },
    cancellationReason: {
      type: String,
      default: 'none'
    },
    isGiftWrapped: {
      type: Boolean,
      default: false
    },
    appliedOffer: {
      offerId: { type: Schema.Types.ObjectId, ref: 'Offer' },
      offerName: { type: String },
      offerType: { type: String, enum: ['product', 'categories', 'brand'] }, 
      discountPercentage: { type: Number, min: 0 },
      discountAmount: { type: Number, min: 0 },
      endDate: { type: Date }
    }
  }],
  
  coupon: {
    code: { type: String, default: '' },
    discount: { type: Number, default: 0 },
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' }
  }
});

module.exports = mongoose.model('Cart', cartSchema);