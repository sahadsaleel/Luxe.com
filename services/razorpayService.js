const Razorpay = require('razorpay');
require('dotenv').config();


const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


const createOrder = async ({ amount, currency = 'INR', receipt }) => {
    try {
        const order = await razorpay.orders.create({
            amount: Math.round(amount),
            currency,
            receipt,
        });
        return order;
    } catch (error) {
        console.error('Razorpay order creation failed:', error);
        throw new Error('Failed to create payment order');
    }
};

const verifyPayment = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
    try {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generated_signature = hmac.digest('hex');
        return razorpay_signature === generated_signature;
    } catch (error) {
        console.error('Payment verification failed:', error);
        return false;
    }
};


const getPaymentDetails = async (paymentId) => {
    try {
        return await razorpay.payments.fetch(paymentId);
    } catch (error) {
        console.error('Failed to fetch payment details:', error);
        throw new Error('Failed to fetch payment details');
    }
};

module.exports = {
    createOrder,
    verifyPayment,
    getPaymentDetails,
    razorpay
}; 