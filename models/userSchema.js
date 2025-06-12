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
        unique: true
    },
    googleId: {
        type: String,
        unique: true
    },
    password: {
        type: String,
        required: false
    },
    phone: {
        type: String, // Changed to String
        required: false
    },
    profileImage: {
        type: String,
        required: false
    },
    gender: {
        type: String,
        required: false // Fixed typo
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
        unique: true
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    hasCompletedPurchase: {
        type: Boolean,
        default: false
    },
    firstPurchaseDate: {
        type: Date,
        default: null
    },
    redeemed: {
        type: Boolean,
        default: false
    },
    redeemedUsers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    ],
    referralBonusAmount: {
        type: Number,
        default: 1000
    },
    totalReferralEarnings: {
        type: Number,
        default: 0
    },
    referralCount: {
        type: Number,
        default: 0
    },
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
    ]
}, { timestamps: false });

const User = mongoose.model('User', userSchema);
module.exports = User;