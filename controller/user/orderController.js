const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Offer = require('../../models/offerSchema');
const Wallet = require('../../models/walletSchema');
const adminOrderController = require('../admin/orderController');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const loadOrderSuccessPage = async (req, res) => {
    try {
        const userId = req.session.user;
        const { orderId } = req.query;

        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        if (!orderId || !isValidObjectId(orderId)) {
            return res.redirect('/pageNotFound');
        }

        const order = await Order.findById(orderId).populate({
            path: 'orderedItems.productId',
            select: 'productName productImage variants',
        });

        if (!order || order.userId.toString() !== userId.toString()) {
            return res.redirect('/pageNotFound');
        }

        const orderItems = order.orderedItems.map(item => {
            const variant = item.productId?.variants?.find(v => v._id.toString() === item.variantId?.toString()) || {};
            return {
                productName: item.productId?.productName || 'N/A',
                productImage: item.productId?.productImage?.length > 0 ? item.productId.productImage[0] : '/images/default-product.jpg',
                variant: {
                    size: variant.size || 'N/A',
                },
                quantity: item.quantity || 0,
                price: item.price || 0,
                totalPrice: item.totalPrice || 0,
                isGiftWrapped: item.isGiftWrapped || false,
            };
        });

        const formatCurrency = (amount) => {
            return `RS ${Number(amount).toFixed(2)}`;
        };

        res.render('user/orderSuccess', {
            user: userData,
            order: {
                orderId: order._id.toString(),
                customOrderId: order.orderId,
                orderDate: order.createdOn.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                status: order.status,
                paymentMethod: order.paymentMethod,
                items: orderItems,
                subtotal: order.totalPrice || 0,
                giftWrapTotal: order.giftWrapTotal || 0,
                shipping: order.shipping || 0,
                discount: (order.discount || 0) + (order.offerDiscountTotal || 0),
                finalAmount: order.finalAmount || 0,
                address: order.addressDetails || {},
                createdOn: order.createdOn,
                deliveryMethod: order.deliveryMethod,
                couponCode: order.couponCode,
                totalSavings: order.totalSavings || 0
            },
            formatCurrency
        });
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load order success page',
            error: error.message
        });
    }
};

const loadMyOrdersPage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';

        const query = { userId };
        if (search) {
            query.orderId = { $regex: search, $options: 'i' };
        }
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query)
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit)
            .select('orderId createdOn status paymentMethod finalAmount');

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const formattedOrders = orders.map(order => ({
            orderId: order.orderId,
            createdOn: order.createdOn,
            status: order.status,
            paymentMethod: order.paymentMethod,
            finalAmount: order.finalAmount,
        }));

        res.render('user/myOrders', {
            user: {
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                email: userData.email || 'N/A',
                profileImage: userData.profileImage || null,
            },
            orders: formattedOrders,
            currentPage: page,
            totalPages: totalPages,
            search: search,
            status: status,
            totalOrders: totalOrders
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        res.redirect('/pageNotFound');
    }
};

const loadOrderDetailPage = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).render('error', { message: 'Unauthorized: Please log in' });
        }

        const order = await Order.findOne({ orderId, userId })
            .populate('orderedItems.productId')
            .populate('userId')
            .populate('address');

        if (!order) {
            return res.status(404).render('error', { message: `Order ${orderId} not found` });
        }

        if (!order.orderedItems) {
            order.orderedItems = [];
        }

        let user = req.session.userData;
        if (!user || !user.profileImage || !user.firstName || !user.lastName) {
            user = await User.findById(userId).select('profileImage firstName lastName email');
            if (user) {
                req.session.userData = {
                    profileImage: user.profileImage,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                };
            }
        }

        const transformedOrder = order.toObject();
        transformedOrder.orderDate = transformedOrder.createdOn;

        transformedOrder.orderedItems = transformedOrder.orderedItems.map(item => {
            const variant = item.productId?.variants?.find(v => v._id.toString() === item.variantId?.toString()) || {};
            return {
                ...item,
                productName: item.productId?.productName || 'N/A',
                productImage: item.productId?.productImage?.[0] || '/img/placeholder.png',
                variant: {
                    size: variant.size || 'N/A',
                    salePrice: variant.salePrice || 0,
                    quantity: variant.quantity || 0,
                },
                isCanceled: item.status === 'Cancelled',
                cancelReason: item.cancelReason || '',
                status: item.status || 'Active',
                returnRequestedOn: item.returnRequestedOn || null,
                returnReason: item.returnReason || ''
            };
        });

        res.render('user/orderDetail', {
            order: transformedOrder,
            user: user || order.userId || null,
        });
    } catch (err) {
        console.error('Error loading order details:', err);
        res.redirect('/pageNotFound');
    }
};

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

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { newStatus } = req.body;
        const userId = req.session.user;

        if (!userId || !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Partially Returned', 'Cancel Request'];
        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        order.status = newStatus;

        if (newStatus === 'Delivered' && !order.deliveryDate) {
            order.deliveryDate = new Date();
        }
        if (newStatus !== 'Delivered' && order.deliveryDate) {
            order.deliveryDate = null;
        }
        if (newStatus === 'Cancelled') {
            order.cancelApprovedOn = new Date();
            order.orderedItems.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Cancelled';
                    item.cancelApprovedOn = new Date();
                }
            });
            order.totalPrice = 0;
            order.giftWrapTotal = 0;
            order.finalAmount = 0;
            order.discount = 0;
            order.refundStatus = order.paymentMethod === 'cash on delivery' ? 'Not Initiated' : 'Initiated';
        }


        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Order status updated successfully',
            order: {
                status: order.status,
                deliveryDate: order.deliveryDate,
                totalPrice: order.totalPrice.toFixed(2),
                finalAmount: order.finalAmount.toFixed(2)
            }
        });
    } catch (err) {
        console.error('Error in updateOrderStatus:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    loadOrderSuccessPage,
    loadMyOrdersPage,
    loadOrderDetailPage,
    cancelOrder,
    cancelOrderItem,
    requestReturn,
    requestReturnItem,
    updateOrderStatus
};