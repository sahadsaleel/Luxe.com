const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');



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

        if (!orderId) {
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
            const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
            return {
                productName: item.productId.productName,
                productImage: item.productId.productImage && item.productId.productImage.length > 0 
                    ? item.productId.productImage[0] 
                    : '/images/default-product.jpg',
                variant : variant ? { size: variant.size || 'N/A' } : { size: 'N/A' },
                quantity: item.quantity,
                price: item.price,
                totalPrice: item.totalPrice,
                isGiftWrapped: item.isGiftWrapped,
            };
        });

        res.render('user/orderSuccess', {
            user: userData,
            order: {
                orderId: order.orderId, 
                orderDate: order.createdOn.toLocaleDateString(),
                status: order.status,
                paymentMethod: order.paymentMethod,
                items: orderItems,
                subtotal: order.totalPrice,
                giftWrapTotal: order.giftWrapTotal,
                shipping: order.shipping,
                discount: order.discount || 0,
                finalAmount: order.finalAmount,
                address: order.addressDetails || {}, 
            },
        });
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.redirect('/pageNotFound');
    }
};


module.exports = {
    loadOrderSuccessPage
}