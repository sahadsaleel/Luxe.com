const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  googleId: {
    type: String,
    unique: true
    
  },
  password: {
    type: String,
    required: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  cart: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart"
    }
  ],
  wallet: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet" 
    }
  ],
  orderHistory: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    }
  ],
  createdOn: {
    type: Date,
    default: Date.now
  },
  referalCode: {
    type: String,
    // required: true,
  },
  redeemed: {
    type: Boolean,
    // required: true,
  },
  redeemedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true 
    }
  ],
  searchHistory: [
    {
      category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
      },
      brand: {
        type: String
      },
      searchOn: {
        type: Date,
        default: Date.now
      }
    }
  ],
}, { timestamps: false });




const User = mongoose.model('User', userSchema);
module.exports = User;