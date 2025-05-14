const mongoose = require('mongoose');
const { Schema } = mongoose;

const addressSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    address: [
        {
            addressType: {
                type: String,
                required: true,
                enum: ['Home', 'Work', 'Other'],
            },
            name: {
                type: String,
                required: true,
            },
            landMark: {
                type: String,
                required: true,
            },
            city: {
                type: String,
                required: true,
            },
            state: {
                type: String,
                required: true,
            },
            pincode: {
                type: String,
                required: true,
            },
            phone: {
                type: String,
                required: true,
            },
            altPhone: {
                type: String,
            },
            isDefault: {
                type: Boolean,
                default: false,
            },
        },
    ],
});

const Address = mongoose.model('Address', addressSchema);
module.exports = Address;