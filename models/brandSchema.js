const mongoose = require('mongoose');
const { Schema } = mongoose;

const brandSchema = new Schema({
    brandName: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
      brandImage: {
        type: String,
        required: true,
      },
      cloudinaryPublicId: { 
        type: String,
      },
      description: {
        type: String,
        required: true
      },
      isListed: {
        type: Boolean,
        default: true
      },
      isBlocked: {
        type: Boolean,
        default: false,
      },
      offers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Offer' }],
      createdAt: {
        type: Date,
        default: Date.now,
      },
},{ timestamps: true });

const Brand = mongoose.model('Brand', brandSchema);
module.exports = Brand;