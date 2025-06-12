const mongoose = require('mongoose');
const { Schema } = mongoose;

const generateOrderId = async () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const prefix = `LUX${year}${month}${day}`;

    const today = new Date().toISOString().split('T')[0];
    const count = await mongoose.models.Order.countDocuments({
        createdOn: { $gte: new Date(today) },
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
        randomPart += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return `${prefix}-${sequence}-${randomPart}`;
};

const orderSchema = new Schema({
    orderId: {
        type: String,
        unique: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    orderedItems: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
        },
        variantId: {
            type: Schema.Types.ObjectId,
        },
        quantity: {
            type: Number,
        },
        price: {
            type: Number,
        },
        totalPrice: {
            type: Number,
        },
        offerDiscount: {
            type: Number,
            default: 0,
        },
        isGiftWrapped: {
            type: Boolean,
        },
        cancelReason: {
            type: String,
            required: false,
        },
        cancelComments: {
            type: String,
            required: false,
        },
        status: {
            type: String,
            required: false,
            enum: ['Active', 'Cancelled', 'Return Requested', 'Return Approved'],
            default: 'Active',
        },
        returnReason: {
            type: String,
            required: false,
        },
        returnComments: {
            type: String,
            required: false,
        },
        returnRequestedOn: {
            type: Date,
            required: false,
        },
        returnApprovedOn: {
            type: Date,
            required: false,
        },
    }],
    totalPrice: {
        type: Number,
        required: true,
    },
    giftWrapTotal: {
        type: Number,
        default: 0,
    },
    shipping: {
        type: Number,
        default: 0,
    },
    discount: {
        type: Number,
        default: 0,
    },
    offerDiscountTotal: {
        type: Number,
        default: 0,
    },
    finalAmount: {
        type:Number,
        required: true,
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true,
    },
    addressDetails: {
        addressType: String,
        name: String,
        landMark: String,
        city: String,
        state: String,
        pincode: String,
        phone: String,
        altPhone: String,
    },
    invoiceDate: {
        type: Date,
    },
    deliveryDate: {
        type: Date,
    }, 
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Partialy Returned', 'Cancel Request'],
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true,
    },
    couponApplied: {
        type: Boolean,
        default: false,
    },
    couponCode: {
        type: String,
    },
    deliveryMethod: {
        type: String,
        enum: ['standard', 'express'],
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['razorpay', 'luxewallet', 'cash on delivery'],
        required: true,
    },
    returnRequestedOn: {
        type: Date,
    }, 
    returnReason: {
        type: String,
    }, 
    returnComments: {
        type: String,
    }, 
    refundAmount: {
        type: Number,
        default: 0
    },
    refundStatus: {
        type: String,
        enum: ['Not Initiated', 'Initiated', 'Completed', 'Failed'],
        default: 'Not Initiated'
    },
    refundDate: {
        type: Date
    },
    refundMethod: {
        type: String,
        enum: ['wallet', 'bank', 'original_method'],
        default: 'wallet'
    },
    refundReason: {
        type: String
    },
});

orderSchema.pre('save', async function (next) {
    if (!this.orderId) {
        this.orderId = await generateOrderId();
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
   