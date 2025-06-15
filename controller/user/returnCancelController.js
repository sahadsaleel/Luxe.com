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

        for (const item of order.orderedItems) {
            item.status = 'Cancelled';
            const result = await Product.updateOne(
                { _id: item.productId, 'variants._id': item.variantId },
                { $inc: { 'variants.$.quantity': item.quantity } }
            );
            if (result.matchedCount === 0) {
                console.error(`Product or variant not found for productId: ${item.productId}, variantId: ${item.variantId}`);
            }
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

        const itemGiftWrap = item.isGiftWrapped ? 100 : 0;
        const itemTotal = item.totalPrice + itemGiftWrap;

        const totalOrderValueBeforeDiscount = order.totalPrice + order.giftWrapTotal;
        const itemShare = (item.totalPrice + itemGiftWrap) / totalOrderValueBeforeDiscount;
        const discountRefund = order.discount * itemShare;

        const itemRefundAmount = itemTotal - discountRefund;

        if (order.paymentMethod === 'razorpay' || order.paymentMethod === 'luxewallet') {
            try {
                await adminOrderController.processWalletRefund(userId, itemRefundAmount, order._id, 'cancelled');
                item.refundStatus = 'Completed';
                item.refundAmount = itemRefundAmount;

                order.refundAmount = (order.refundAmount || 0) + itemRefundAmount;
            } catch (refundError) {
                console.error('Refund processing failed:', refundError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process refund. Please contact support.',
                    error: refundError.message
                });
            }
        } else {
            item.refundStatus = 'Not Initiated';
        }

        const result = await Product.updateOne(
            { _id: item.productId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.quantity': item.quantity } }
        );
        if (result.matchedCount === 0) {
            console.error(`Product or variant not found for productId: ${item.productId}, variantId: ${item.variantId}`);
        }

        const activeItems = order.orderedItems.filter(i => i.status !== 'Cancelled');
        order.totalPrice = activeItems.reduce((sum, i) => sum + i.totalPrice, 0);
        order.giftWrapTotal = activeItems.reduce((sum, i) => sum + (i.isGiftWrapped ? 100 : 0), 0);
        order.discount = activeItems.length === 0 ? 0 : order.discount * (order.totalPrice + order.giftWrapTotal) / totalOrderValueBeforeDiscount;
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - order.discount;

        const allCancelled = order.orderedItems.every(i => i.status === 'Cancelled');
        if (allCancelled) {
            order.status = (order.paymentMethod === 'cash on delivery') ? 'Cancel Request' : 'Cancelled';
            order.cancelRequestedOn = new Date();
            order.cancelApprovedOn = new Date();
            if (order.paymentMethod === 'razorpay' || order.paymentMethod === 'luxewallet') {
                order.refundStatus = 'Completed';
                order.totalPrice = 0;
                order.giftWrapTotal = 0;
                order.finalAmount = 0;
                order.discount = 0;
            } else {
                order.refundStatus = 'Not Initiated';
            }
        } else {
            if (order.paymentMethod === 'razorpay' || order.paymentMethod === 'luxewallet') {
                order.refundStatus = 'Initiated';
            }
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Item cancelled successfully',
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

const approveReturn = async (req, res) => {
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

        if (order.returnApprovedOn) {
            return res.status(400).json({ success: false, message: 'Return already approved for this order' });
        }

        const deliveryDate = order.deliveryDate || order.createdOn;
        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 30) {
            return res.status(400).json({ success: false, message: 'Return period has expired (30 days after delivery)' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        order.status = 'Return Approved';
        order.returnApprovedOn = new Date();
        order.returnReason = reason.trim();
        order.returnComments = comments ? comments.trim() : '';

        for (const item of order.orderedItems) {
            if (item.status !== 'Cancelled' && !item.returnApprovedOn) {
                item.status = 'Return Approved';
                item.returnApprovedOn = new Date();
                item.returnReason = reason.trim();
                item.returnComments = comments ? comments.trim() : '';
                const result = await Product.updateOne(
                    { _id: item.productId, 'variants._id': item.variantId },
                    { $inc: { 'variants.$.quantity': item.quantity } }
                );
                if (result.matchedCount === 0) {
                    console.error(`Product or variant not found for productId: ${item.productId}, variantId: ${item.variantId}`);
                }
            }
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return approval submitted successfully'
        });
    } catch (err) {
        console.error('Error in approveReturn:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const approveReturnItem = async (req, res) => {
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
            return res.status(400).json({ success: false, message: 'Item is already cancelled or return approved' });
        }

        const deliveryDate = order.deliveryDate || order.createdOn;
        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));

        if (daysSinceDelivery > 30) {
            return res.status(400).json({ success: false, message: 'Return period has expired (30 days after delivery)' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        item.status = 'Return Approved';
        item.returnApprovedOn = new Date();
        item.returnReason = reason.trim();
        item.returnComments = comments ? comments.trim() : '';
        item.totalPrice = 0;

        const result = await Product.updateOne(
            { _id: item.productId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.quantity': item.quantity } }
        );
        if (result.matchedCount === 0) {
            console.error(`Product or variant not found for productId: ${item.productId}, variantId: ${item.variantId}`);
        }

        order.totalPrice = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' || i.status === 'Return Approved' ? 0 : i.totalPrice), 0);
        order.giftWrapTotal = order.orderedItems.reduce((sum, i) => sum + ((i.status === 'Cancelled' || i.status === 'Return Approved') ? 0 : (i.isGiftWrapped ? 100 : 0)), 0);
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - (order.discount || 0);

        const allReturnedOrCancelled = order.orderedItems.every(i => i.status === 'Cancelled' || i.status === 'Return Approved');
        if (allReturnedOrCancelled) {
            order.status = 'Return Approved';
            order.returnApprovedOn = new Date();
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return approval for item submitted successfully',
            order: {
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            },
            allReturned: allReturnedOrCancelled
        });
    } catch (err) {
        console.error('Error in approveReturnItem:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    cancelOrder,
    cancelOrderItem,
    approveReturn,
    approveReturnItem
};
