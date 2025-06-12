const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const processWalletRefund = async (userId, amount, orderId, refundType) => {
    try {

        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const order = await Order.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        let userWallet = await Wallet.findOne({ userId });
        if (!userWallet) {
            userWallet = new Wallet({
                userId,
                balance: 0,
                currency: 'INR',
                transactions: [],
            });
            user.wallet = [userWallet._id];
            await user.save();
        }

        const refundAmount = parseFloat(amount);
        if (isNaN(refundAmount) || refundAmount <= 0) {
            throw new Error(`Invalid refund amount: ${amount}`);
        }

        const refundMethod = refundType === 'returned' ? 'ReturnRefund' : 
                           refundType === 'cancelled' ? 'CancelRefund' : 'Refund';

        const transactionData = {
            orderId: order.orderId,
            amount: refundAmount,
            type: 'Credit',
            method: refundMethod,
            status: 'Completed',
            date: new Date(),
            description: `Refund for ${refundType} order (${order.orderId}) - Payment: ${order.paymentMethod}`,
            metadata: {
                orderId: order.orderId,
                refundReason: order.refundReason || order.cancelReason || order.returnReason || 'Refund processed',
                refundType: refundType === 'returned' ? 'Return' : 
                           refundType === 'cancelled' ? 'Cancel' : 'Admin'
            }
        };

        userWallet.balance += refundAmount;
        userWallet.transactions.push(transactionData);
        await userWallet.save();

        const updateData = {
            refundStatus: 'Completed',
            refundDate: new Date(),
            refundAmount,
            refundMethod: 'wallet',
            walletRefundId: userWallet.transactions[userWallet.transactions.length - 1]._id
        };

        if (refundType === 'returned') {
            updateData.status = 'Return Approved';
            updateData.returnApprovedOn = new Date();
        } else if (refundType === 'cancelled') {
            updateData.status = 'Cancelled';
            updateData.cancelApprovedOn = new Date();
        }

        await Order.findByIdAndUpdate(orderId, updateData);

        return userWallet;
    } catch (error) {
        console.error('Error processing refund:', error);
        await Order.findByIdAndUpdate(orderId, { 
            refundStatus: 'Failed',
            refundMethod: 'wallet'
        }).catch(err => console.error('Error updating order refund status to failed:', err));
        throw error;
    }
};

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
                variant: { size: variant.size || 'N/A' },
                quantity: item.quantity || 0,
                price: item.price || 0,
                totalPrice: item.totalPrice || 0,
                isGiftWrapped: item.isGiftWrapped || false,
            };
        });

        const formatCurrency = (amount) => `RS ${Number(amount).toFixed(2)}`;

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
            totalPages,
            search: status,
            totalOrders
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        res.redirect('/pageNotFound');
    }
};

const loadUserOrderDetailPage = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).render('error', { message: 'Unauthorized: Please log in' });
        }

        const order = await Order.findOne({ orderId, userId })
            .populate('orderedItems.productId')
            .populate('userId');

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
        console.error('Error loading user order details:', err);
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

        order.status = 'Cancel Request';
        order.cancelReason = reason.trim();
        order.cancelComments = comments ? comments.trim() : '';
        order.cancelRequestedOn = new Date();

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Cancellation request submitted successfully',
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
        item.totalPrice = 0;

        order.totalPrice = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' ? 0 : i.totalPrice), 0);
        order.giftWrapTotal = order.orderedItems.reduce((sum, i) => sum + (i.status === 'Cancelled' ? 0 : (i.isGiftWrapped ? 100 : 0)), 0);
        order.finalAmount = order.totalPrice + order.giftWrapTotal + (order.shipping || 0) - (order.discount || 0);

        const allCancelled = order.orderedItems.every(i => i.status === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
            order.cancelRequestedOn = new Date();
            order.cancelApprovedOn = new Date();
            order.totalPrice = 0;
            order.giftWrapTotal = 0;
            order.finalAmount = 0;
            order.discount = 0;
            order.refundStatus = order.paymentMethod === 'cash on delivery' ? 'Not Initiated' : 'Initiated';
        }

        await Product.updateOne(
            { _id: item.productId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.stock': item.quantity } }
        );

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

        // Set return details at order level
        order.status = 'Return Requested';
        order.returnRequestedOn = new Date();
        order.returnReason = reason.trim();
        order.returnComments = comments ? comments.trim() : '';

        // Set return details for each non-cancelled item
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

const loadAdminOrderPage = async (req, res) => {
    try {
        let page = parseInt(req.query.page) || 1;
        const limit = 5;
        let search = req.query.search || '';
        let sort = req.query.sort || 'newest';

        const query = {};
        if (search) {
            query.orderId = { $regex: ".*" + search + ".*", $options: 'i' };
        }

        let sortOption;
        switch (sort) {
            case 'oldest':
                sortOption = { createdOn: 1 };
                break;
            case 'a-z':
                sortOption = { 'userId.firstName': 1 };
                break;
            case 'z-a':
                sortOption = { 'userId.firstName': -1 };
                break;
            default:
                sortOption = { createdOn: -1 };
        }

        const orders = await Order.find(query)
            .populate('userId', 'firstName lastName')
            .sort(sortOption)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await Order.countDocuments(query);

        const orderData = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            user: order.userId,
            invoiceDate: order.invoiceDate || order.createdOn,
            status: order.status,
            finalAmount: order.finalAmount,
        }));

        res.render('admin/orders', {
            orders: orderData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            search,
            sort
        });
    } catch (error) {
        console.error('Error loading admin orders:', error);
        res.redirect('/admin/pageerror');
    }
};

const loadAdminOrderDetailPage = async (req, res) => {
    try {
        const { orderId } = req.params;

        if (!isValidObjectId(orderId)) {
            return res.redirect('/admin/pageNotFound');
        }

        const order = await Order.findById(orderId)
            .populate('userId', 'firstName lastName')
            .populate({
                path: 'orderedItems.productId',
                select: 'productName productImage variants',
            });

        if (!order) {
            return res.redirect('/admin/pageNotFound');
        }

        if (order.status === 'Return Requested' && !order.returnReason) {
            const returnedItem = order.orderedItems.find(item => item.status === 'Return Requested');
            if (returnedItem) {
                order.returnReason = returnedItem.returnReason;
                order.returnComments = returnedItem.returnComments;
                await order.save();
            }
        }

        const orderItems = order.orderedItems.map(item => {
            const variant = item.productId?.variants?.find(v => v._id.toString() === item.variantId?.toString()) || {};
            return {
                productImage: item.productId?.productImage?.[0] || '/img/placeholder.png',
                productName: item.productId?.productName || 'N/A',
                variant: { size: variant.size || 'N/A' },
                quantity: item.quantity || 0,
                price: item.price || 0,
                totalPrice: item.totalPrice || 0,
                isGiftWrapped: item.isGiftWrapped || false,
                status: item.status || 'Active',
                returnReason: item.returnReason || 'N/A',
                returnComments: item.returnComments || 'N/A'
            };
        });

        res.render('admin/orderViewPage', {
            order: {
                _id: order._id,
                orderId: order.orderId,
                user: order.userId || null,
                createdOn: order.createdOn,
                deliveryDate: order.deliveryDate,
                addressDetails: order.addressDetails || {},
                orderedItems: orderItems,
                totalPrice: order.totalPrice || 0,
                giftWrapTotal: order.giftWrapTotal || 0,
                shipping: order.shipping || 0,
                discount: order.discount || 0,
                finalAmount: order.finalAmount || 0,
                status: order.status,
                paymentMethod: order.paymentMethod,
                deliveryMethod: order.deliveryMethod,
                returnRequestedOn: order.returnRequestedOn,
                returnReason: order.returnReason || 'N/A',
                returnComments: order.returnComments || 'N/A',
                cancelRequestedOn: order.cancelRequestedOn,
                cancelReason: order.cancelReason || 'N/A',
                cancelComments: order.cancelComments || 'N/A'
            }
        });
    } catch (error) {
        console.error('Error loading admin order detail page:', error);
        res.redirect('/admin/pageNotFound');
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, newStatus } = req.body;

        if (!req.session.admin && !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        if (!orderId || !isValidObjectId(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const statusOrder = {
            'Pending': ['Processing'],
            'Processing': ['Shipped', 'Cancel Request'],
            'Shipped': ['Delivered', 'Cancel Request'],
            'Delivered': ['Return Requested'],
            'Cancel Request': ['Cancelled'],
            'Return Requested': ['Return Approved'],
            'Return Approved': [],
            'Cancelled': [],
            'Partially Returned': []
        };

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const allowedStatuses = statusOrder[order.status] || [];
        if (!allowedStatuses.includes(newStatus)) {
            return res.status(400).json({ 
                success: false, 
                message: `Invalid status transition from ${order.status} to ${newStatus}` 
            });
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
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const approveReturn = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!req.session.admin && !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Return Requested') {
            return res.status(400).json({
                success: false,
                message: `No return request found for this order. Current status: ${order.status}`
            });
        }

        if (!status || !['approved', 'rejected'].includes(status.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be either "approved" or "rejected"'
            });
        }

        let calculatedRefundAmount = 0;
        const returnedItems = order.orderedItems.filter(item => item.status === 'Return Requested');
        
        calculatedRefundAmount = returnedItems.reduce((total, item) => {
            return total + (item.price * item.quantity) + (item.isGiftWrapped ? 100 : 0);
        }, 0);

        const allItemsReturned = order.orderedItems.every(item => 
            item.status === 'Return Requested' || item.status === 'Cancelled'
        );
        if (allItemsReturned) {
            calculatedRefundAmount += order.shipping || 0;
        }

        const finalRefundAmount = Math.max(0, calculatedRefundAmount - (order.refundAmount || 0));

        if (status.toLowerCase() === 'rejected') {
            order.status = 'Delivered';
            order.refundStatus = 'Not Initiated';
            order.orderedItems.forEach(item => {
                if (item.status === 'Return Requested') {
                    item.status = 'Delivered';
                }
            });
        } else {
            try {
                if (finalRefundAmount > 0) {
                    const updatedWallet = await processWalletRefund(
                        order.userId.toString(), 
                        finalRefundAmount, 
                        order._id, 
                        'returned'
                    );
                }

                order.status = 'Return Approved';
                order.refundAmount = (order.refundAmount || 0) + finalRefundAmount;
                order.refundStatus = 'Completed';
                order.returnApprovedOn = new Date();

                for (const item of order.orderedItems) {
                    if (item.status === 'Return Requested') {
                        item.status = 'Return Approved';
                        await Product.updateOne(
                            { _id: item.productId, 'variants._id': item.variantId },
                            { $inc: { 'variants.$.stock': item.quantity } }
                        );
                    }
                }

            } catch (error) {
                console.error('Refund processing failed:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process refund. Please contact support.',
                    error: error.message
                });
            }
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: status.toLowerCase() === 'approved' ? 'Return approved and refund processed successfully' : 'Return request rejected'
        });
    } catch (error) {
        console.error('Approve Return Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

const approveCancel = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!req.session.userId || !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Cancel Request') {
            return res.status(400).json({
                success: false,
                message: `No cancellation request found for this order. Current status: ${order.status}`
            });
        }

        if (!status || !['approved', 'rejected'].includes(status.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be either "approved" or "rejected"'
            });
        }

        if (status.toLowerCase() === 'rejected') {
            order.status = 'Processing';
            order.refundStatus = 'Not Initiated';
        } else {
            const refundAmount = order.finalAmount;

            try {
                const updatedWallet = await processWalletRefund(order.userId, refundAmount, order._id, 'cancelled');

                for (const item of order.orderedItems) {
                    await Product.updateOne(
                        { _id: item.productId, 'variants._id': item.variantId },
                        { $inc: { 'variants.$.stock': item.quantity } }
                    );
                    item.status = 'Cancelled';
                }

                order.status = 'Cancelled';
                order.cancelApprovedOn = new Date();
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
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: status.toLowerCase() === 'rejected' ? 'Cancellation request rejected' : 'Order cancelled and refund processed successfully'
        });
    } catch (error) {
        console.error('Approve Cancel Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

const processRefund = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { amount, reason } = req.body;

        if (!req.session.userId || !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Admin access required' });
        }

        if (!orderId || !isValidObjectId(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const refundAmount = parseFloat(amount);
        if (isNaN(refundAmount) || refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid refund amount' });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Refund reason is required' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.refundStatus === 'Completed') {
            return res.status(400).json({ success: false, message: 'Refund already processed for this order' });
        }

        try {
            const updatedWallet = await processWalletRefund(order.userId, refundAmount, order._id, 'manual');

            order.refundStatus = 'Completed';
            order.refundAmount = refundAmount;
            order.refundDate = new Date();
            order.refundReason = reason.trim();

            await order.save();

            return res.status(200).json({
                success: true,
                message: 'Refund processed successfully'
            });
        } catch (refundError) {
            console.error('Refund processing failed:', refundError);
            return res.status(500).json({
                success: false,
                message: 'Failed to process refund. Please contact support.',
                error: refundError.message
            });
        }
    } catch (error) {
        console.error('Process Refund Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    loadOrderSuccessPage,
    loadMyOrdersPage,
    loadUserOrderDetailPage,
    cancelOrder,
    cancelOrderItem,
    requestReturn,
    requestReturnItem,
    loadAdminOrderPage,
    loadAdminOrderDetailPage,
    updateOrderStatus,
    approveReturn,
    approveCancel,
    processRefund,
    processWalletRefund
};