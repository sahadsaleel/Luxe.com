const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const adminOrderController = require('../admin/orderController');


const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason, comments } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
        }

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!['Pending', 'Processing'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Order cannot be canceled at this stage' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
        }

        if (order.paymentMethod === 'razorpay' || order.paymentMethod === 'luxewallet') {
            try {
                const refundAmount = order.finalAmount;
                const updatedWallet = await adminOrderController.processWalletRefund(userId, refundAmount, order._id, 'cancelled');

                order.status = 'Cancelled';
                order.cancelReason = reason.trim();
                order.cancelComments = comments ? comments.trim() : '';
                order.cancelRequestedOn = new Date();
                order.cancelApprovedOn = new Date();
                order.refundStatus = 'Completed';
                order.refundAmount = refundAmount;
                order.totalPrice = 0;
                order.giftWrapTotal = 0;
                order.finalAmount = 0;
                order.discount = 0;

                for (const item of order.orderedItems) {
                    item.status = 'Cancelled';
                    await Product.updateOne(
                        { _id: item.productId, 'variants._id': item.variantId },
                        { $inc: { 'variants.$.stock': item.quantity } }
                    );
                }
            } catch (refundError) {
                console.error('Refund processing failed:', refundError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process refund. Please contact support.',
                    error: refundError.message
                });
            }
        } else {
            order.status = 'Cancel Request';
            order.cancelReason = reason.trim();
            order.cancelComments = comments ? comments.trim() : '';
            order.cancelRequestedOn = new Date();
            order.refundStatus = 'Not Initiated';
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: order.status === 'Cancelled' ? 'Order cancelled and refund processed successfully' : 'Cancellation request submitted successfully',
            order: {
                status: order.status,
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            }
        });
    } catch (err) {
        console.error('Error in cancelOrder:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.user;
        const { reason, comments } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
        }

        if (!itemId || !isValidObjectId(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid item ID' });
        }

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!['Pending', 'Processing'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        if (item.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: 'Item is already cancelled' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
        }

        item.status = 'Cancelled';
        item.cancelReason = reason.trim();
        item.cancelComments = comments ? comments.trim() : '';
        item.cancelRequestedOn = new Date();
        item.cancelApprovedOn = new Date();

        const itemRefundAmount = item.totalPrice + (item.isGiftWrapped ? 100 : 0);
        
        order.totalPrice = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' ? 0 : i.totalPrice), 0);
        order.giftWrapTotal = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' ? 0 : (i.isGiftWrapped ? 100 : 0)), 0);
        
        const cancelledItemsTotal = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' ? i.totalPrice : 0), 0);
        const totalBeforeCancel = order.totalPrice + cancelledItemsTotal;
        const discountRatio = cancelledItemsTotal / totalBeforeCancel;
        const discountRefund = order.discount * discountRatio;
        order.discount -= discountRefund;
        
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - order.discount;

        const allCancelled = order.orderedItems.every(i => i.status === 'Cancelled');

        if (order.paymentMethod === 'razorpay' || order.paymentMethod === 'luxewallet') {
            try {
                const refundAmount = itemRefundAmount - discountRefund;
                const updatedWallet = await adminOrderController.processWalletRefund(userId, refundAmount, order._id, 'cancelled');

                item.refundStatus = 'Completed';
                item.refundAmount = refundAmount;

                if (allCancelled) {
                    order.status = 'Cancelled';
                    order.cancelRequestedOn = new Date();
                    order.cancelApprovedOn = new Date();
                    order.refundStatus = 'Completed';
                    order.refundAmount = (order.refundAmount || 0) + refundAmount;
                    order.totalPrice = 0;
                    order.giftWrapTotal = 0;
                    order.finalAmount = 0;
                    order.discount = 0;
                } else {
                    order.refundStatus = 'Partially Completed';
                    order.refundAmount = (order.refundAmount || 0) + refundAmount;
                }
            } catch (refundError) {
                console.error('Refund processing failed:', refundError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process refund. Please contact support.',
                    error: refundError.message
                });
            }
        } else {
            if (allCancelled) {
                order.status = 'Cancel Request';
                order.cancelRequestedOn = new Date();
                order.refundStatus = 'Not Initiated';
            }
            item.refundStatus = 'Not Initiated';
        }
        await Product.updateOne(
            { _id: item.productId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.stock': item.quantity } }
        );

        await order.save();

        return res.status(200).json({
            success: true,
            message: item.refundStatus === 'Completed' ? 'Item cancelled and refund processed successfully' : 'Item cancellation request submitted successfully',
            order: {
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            },
            allCancelled
        });
    } catch (err) {
        console.error('Error in cancelOrderItem:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const requestReturn = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason, comments } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
        }

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
        }

        if (order.returnRequestedOn) {
            return res.status(400).json({ success: false, message: 'Return already requested for this order' });
        }

        const deliveryDate = order.deliveryDate || order.createdOn;
        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 30) {
            return res.status(400).json({ success: false, message: 'Return period has expired (30 days after delivery)' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        order.status = 'Return Requested';
        order.returnRequestedOn = new Date();
        order.returnReason = reason.trim();
        order.returnComments = comments ? comments.trim() : '';

        order.orderedItems.forEach(item => {
            if (item.status !== 'Cancelled' && !item.returnRequestedOn) {
                item.status = 'Return Requested';
                item.returnRequestedOn = new Date();
                item.returnReason = reason.trim();
                item.returnComments = comments ? comments.trim() : '';
            }
        });

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return request submitted successfully'
        });
    } catch (err) {
        console.error('Error in requestReturn:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const requestReturnItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason, comments } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
        }

        if (!itemId || !isValidObjectId(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid item ID' });
        }

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        if (item.status === 'Cancelled' || item.status.includes('Return')) {
            return res.status(400).json({ success: false, message: 'Item is already cancelled or return requested' });
        }

        const deliveryDate = order.deliveryDate || order.createdOn;
        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));

        if (daysSinceDelivery > 30) {
            return res.status(400).json({ success: false, message: 'Return period has expired (30 days after delivery)' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        item.status = 'Return Requested';
        item.returnRequestedOn = new Date();
        item.returnReason = reason.trim();
        item.returnComments = comments ? comments.trim() : '';
        item.totalPrice = 0;

        order.totalPrice = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' || i.status === 'Return Requested' ? 0 : i.totalPrice), 0);
        order.giftWrapTotal = order.orderedItems.reduce((sum, i) => sum + ((i.status === 'Cancelled' || i.status === 'Return Requested') ? 0 : (i.isGiftWrapped ? 100 : 0)), 0);
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - (order.discount || 0);

        const allReturnedOrCancelled = order.orderedItems.every(i => i.status === 'Cancelled' || i.status === 'Return Requested');
        if (allReturnedOrCancelled) {
            order.status = 'Return Requested';
            order.returnRequestedOn = new Date();
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return request for item submitted successfully',
            order: {
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            },
            allReturned: allReturnedOrCancelled
        });
    } catch (err) {
        console.error('Error in requestReturnItem:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    cancelOrder,
    cancelOrderItem,
    requestReturn,
    requestReturnItem
}; 