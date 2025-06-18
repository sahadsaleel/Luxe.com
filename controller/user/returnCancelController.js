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
        const isAdmin = req.session.isAdmin;

        if (!userId || !isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        for (const item of order.orderedItems) {
            item.status = 'Return Approved';
            item.returnReason = reason.trim();
            item.returnComments = comments ? comments.trim() : '';
            item.returnApprovedOn = new Date();

            await Product.updateOne(
                { _id: item.productId, 'variants._id': item.variantId },
                { $inc: { 'variants.$.quantity': item.quantity } }
            );
        }

        order.status = 'Return Approved';
        order.returnApprovedOn = new Date();
        order.returnReason = reason.trim();
        order.returnComments = comments ? comments.trim() : '';

        if (['razorpay', 'luxewallet', 'cash on delivery'].includes(order.paymentMethod)) {
            try {
                const refundAmount = order.finalAmount;
                await adminOrderController.processWalletRefund(userId, refundAmount, order._id, 'return');

                order.refundAmount = refundAmount;
                order.refundStatus = 'Completed';
                order.refundMethod = 'wallet';
                order.refundDate = new Date();

                order.totalPrice = 0;
                order.giftWrapTotal = 0;
                order.discount = 0;
                order.finalAmount = 0;
            } catch (refundError) {
                console.error('Refund failed:', refundError);
                return res.status(500).json({ success: false, message: 'Failed to process refund' });
            }
        } else {
            order.refundStatus = 'Not Initiated';
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return approved successfully',
            order: {
                status: order.status,
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            }
        });

    } catch (error) {
        console.error('Error in approveReturn:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const approveReturnItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { status } = req.body;

        if (!req.session.admin && !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        if (item.status !== 'Return Request') {
            return res.status(400).json({ success: false, message: 'Item is not marked for return' });
        }

        item.status = 'Returned';
        item.returnApprovedOn = new Date();

        const itemGiftWrap = item.isGiftWrapped ? 100 : 0;
        const itemTotal = item.totalPrice + itemGiftWrap;

        const totalOrderValueBeforeDiscount = order.totalPrice + order.giftWrapTotal;
        const itemShare = itemTotal / totalOrderValueBeforeDiscount;
        const discountRefund = order.discount * itemShare;

        const refundAmount = itemTotal - discountRefund;

        if (["razorpay", "luxewallet", "cash on delivery"].includes(order.paymentMethod)) {
            await adminOrderController.processWalletRefund(order.userId, refundAmount, order._id, 'returned');
            item.refundStatus = 'Completed';
            item.refundAmount = refundAmount;
            order.refundAmount = (order.refundAmount || 0) + refundAmount;
        } else {
            item.refundStatus = 'Not Initiated';
        }

        await Product.updateOne(
            { _id: item.productId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.quantity': item.quantity } }
        );

        const activeItems = order.orderedItems.filter(i => i.status !== 'Cancelled' && i.status !== 'Returned');
        order.totalPrice = activeItems.reduce((sum, i) => sum + i.totalPrice, 0);
        order.giftWrapTotal = activeItems.reduce((sum, i) => sum + (i.isGiftWrapped ? 100 : 0), 0);
        order.discount = activeItems.length === 0 ? 0 : order.discount * (order.totalPrice + order.giftWrapTotal) / totalOrderValueBeforeDiscount;
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - order.discount;

        const allReturned = order.orderedItems.every(i => i.status === 'Returned');
        if (allReturned) {
            order.status = 'Returned';
            order.returnApprovedOn = new Date();
            if (["razorpay", "luxewallet", "cash on delivery"].includes(order.paymentMethod)) {
                order.refundStatus = 'Completed';
                order.totalPrice = 0;
                order.giftWrapTotal = 0;
                order.finalAmount = 0;
                order.discount = 0;
            } else {
                order.refundStatus = 'Not Initiated';
            }
        } else {
            if (["razorpay", "luxewallet", "cash on delivery"].includes(order.paymentMethod)) {
                order.refundStatus = 'Initiated';
            }
        }

        await order.save();

        res.status(200).json({
            success: true,
            message: 'Return approved and refund processed successfully',
            order: {
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            }
        });

    } catch (err) {
        console.error('Error in approveReturnItem:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const requestReturnItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason, comments } = req.body;

        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: User not logged in' });
        }

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found or does not belong to user' });
        }

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (item.status.includes('Return')) {
            return res.status(400).json({ success: false, message: 'Return already requested for this item' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Returns can only be requested for delivered orders' });
        }

        const deliveryDate = order.deliveryDate || order.createdOn || order.updatedAt;
        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 30) {
            return res.status(400).json({ success: false, message: 'Return period has expired (30 days)' });
        }

        item.status = 'Return Requested';
        item.returnRequestedOn = new Date();
        item.returnReason = reason?.trim() || '';
        item.returnComments = comments?.trim() || '';

        order.totalPrice = order.orderedItems.reduce((sum, i) => sum + (i.status.includes('Return') || i.status === 'Cancelled' ? 0 : i.totalPrice), 0);
        order.giftWrapTotal = order.orderedItems.reduce((sum, i) => sum + (i.status.includes('Return') || i.status === 'Cancelled' ? 0 : (i.isGiftWrapped ? 100 : 0)), 0);
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - (order.discount || 0);

        const allReturnedOrCancelled = order.orderedItems.every(i => i.status.includes('Return') || i.status === 'Cancelled');
        order.status = allReturnedOrCancelled ? 'Return Requested' : order.status;

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Return request submitted successfully',
            order: {
                totalPrice: order.totalPrice.toFixed(2),
                giftWrapTotal: order.giftWrapTotal.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2),
                discount: order.discount.toFixed(2)
            },
            allReturned: allReturnedOrCancelled
        });

    } catch (error) {
        console.error('Error requesting item return:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

module.exports = {
    cancelOrder,
    cancelOrderItem,
    approveReturn,
    approveReturnItem,
    requestReturnItem
};
