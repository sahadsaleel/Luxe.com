// models/Wallet.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema({
    amount: { type: Number, required: true },
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    date: { type: Date, default: Date.now },
    paymentMethod: { type: String, required: true },
    description: { type: String, required: true },
    id: { type: String, required: true, unique: true } 
});

const walletSchema = new Schema({
    balance: { type: Number, default: 0 },
    cardLastFour: { type: String, default: '1234' },
    transactions: [transactionSchema],
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);