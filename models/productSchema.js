const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
    size: { type: String, required: true },
    regularPrice: { type: Number, required: true },
    salePrice: { type: Number, default: 0 },
    quantity: { type: Number, required: true }
});

const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    productBrand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        required: true
    },
    productCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    productDescription: {
        type: String,
        required: true
    },
    productImage: [{
        type: String 
    }],
    variants: [variantSchema],
    status: {
        type: String,
        enum: ['listed', 'unlisted'],
        default: 'listed'
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);