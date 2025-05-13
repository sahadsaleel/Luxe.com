const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    orderedItems: [{
        price: {
            type: Number
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'Address', 
        required: true
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled', 'Return Request', 'Returned']
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    deliveryMethod: {
        type: String,
        enum: ['standard', 'express'],
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['razorpay', 'luxewallet', 'cash'],
        required: true,
    },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;