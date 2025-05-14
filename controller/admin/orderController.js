const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');

const loadOrderPage = async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate('userId', 'firstName lastName')
            .sort({ createdOn: -1 });

        res.render('admin/orders', {
            orders: orders.map(order => ({
                _id: order._id,
                orderId: order.orderId,
                user: order.userId,
                invoiceDate: order.invoiceDate || order.createdOn,
                status: order.status,
                finalAmount: order.finalAmount,
            })),
        });
    } catch (error) {
        console.error('Error loading admin orders:', error);
        res.status(500).send('Server Error');
    }
};

const loadOrderDetailPage = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId)
            .populate('userId', 'firstName lastName')
            .populate('orderedItems.productId', 'productName productImage')
            .populate('address');

        if (!order) {
            return res.redirect('/admin/pageNotFound');
        }

        const orderItems = order.orderedItems.map(item => ({
            productImage: item.productId.productImage && item.productId.productImage.length > 0 
                ? item.productId.productImage[0] 
                : '/images/default-product.jpg',
            productName: item.productId.productName,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.totalPrice,
            status: order.status, 
        }));

        const returnItems = []; 

        res.render('admin/orderViewPage', {
            order: {
                _id: order._id,
                orderId: order.orderId,
                user: order.userId,
                orderDate: order.createdOn.toDateString(),
                address: order.addressDetails ? {
                    name: order.addressDetails.name,
                    landMark: order.addressDetails.landMark,
                    city: order.addressDetails.city,
                    state: order.addressDetails.state,
                    pincode: order.addressDetails.pincode,
                    phone: order.addressDetails.phone,
                    altPhone: order.addressDetails.altPhone,
                } : {},
                items: orderItems,
                total: order.finalAmount,
                status: order.status,
                returnItems: returnItems,
            },
        });
    } catch (error) {
        console.error('Error loading order detail page:', error);
        res.redirect('/admin/pageNotFound');
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Canceled', 'Return Request', 'Returned'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        await Order.findByIdAndUpdate(orderId, { status });
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    loadOrderPage,
    loadOrderDetailPage,
    updateOrderStatus,
};