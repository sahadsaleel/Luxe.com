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
                offerDiscount: item.offerDiscount || 0, 
                offerPrice: (item.price || 0) - (item.offerDiscount || 0),
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
    updateOrderStatus
};