const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Wallet = require("../../models/walletSchema")

const loadOrderPage = async (req, res) => {
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

const loadOrderDetailPage = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId)
            .populate('userId', 'firstName lastName')
            .populate({
                path: 'orderedItems.productId',
                select: 'productName productImage variants',
            });

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
        }));

        res.render('admin/orderViewPage', {
            order: {
                _id: order._id,
                orderId: order.orderId,
                user: order.userId,
                orderDate: order.createdOn.toDateString(),
                address: order.addressDetails ? {
                    name: order.addressDetails.name || 'N/A',
                    landMark: order.addressDetails.landMark || 'N/A',
                    city: order.addressDetails.city || 'N/A',
                    state: order.addressDetails.state || 'N/A',
                    pincode: order.addressDetails.pincode || 'N/A',
                    phone: order.addressDetails.phone || 'N/A',
                    altPhone: order.addressDetails.altPhone || 'N/A',
                } : {},
                items: orderItems,
                total: order.finalAmount,
                status: order.status,
                returnRequestedOn: order.returnRequestedOn,
                returnReason: order.returnReason,
                returnComments: order.returnComments,
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

        const validStatuses = [
            'Pending',
            'Processing',
            'Shipped',
            'Delivered',
            'Canceled',
            'Return Request',
        ];
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

// const approveReturn = async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const order = await Order.findById(orderId);
//         if (!order) {
//             return res.status(404).json({ success: false, message: 'Order not found' });
//         }

//         if (order.status !== 'Return Request') {
//             return res.status(400).json({ success: false, message: 'No return request to approve' });
//         }

//         order.status = 'Return Approved';
//         order.refundStatus = order.paymentMethod === 'cash on delivery' ? 'Not Initiated' : 'Initiated';
//         await order.save();

//         // Restock inventory
//         for (const item of order.orderedItems) {
//             await Product.updateOne(
//                 { _id: item.productId, 'variants._id': item.variantId },
//                 { $inc: { 'variants.$.stock': item.quantity } }
//             );
//         }

//         res.json({ success: true, message: 'Return approved successfully' });
//     } catch (error) {
//         console.error('Error approving return:', error);
//         res.status(500).json({ success: false, message: 'Internal server error' });
//     }
// };



const approveReturn = async (req, res) => {

    const {status} = req.body ;
    const {orderId} = req.params;
    
    try {
        // if (!req.user.isAdmin) {
        //     return res.status(403).json({ success: false, message: 'Admin access required' });
        // }
            
        const order  = await Order.findById(orderId);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // const item = order.orderedItems.find(
    //   (i) => i.productId.toString() === productId && (!variantId || i.variantId.toString() === variantId)
    // );
    // if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

    // if (item.status !== 'Return Requested') {
    //   return res.status(400).json({ success: false, message: 'No return request found for this item' });
    // }

    if(status === "rejected") {
       order.status =  "Delivered"
       
    }else {
        
        const refundAmount = order.finalAmount;

        let wallet = await Wallet.findOne({ userId: order.userId });
        if (!wallet) {
            console.log('Creating new wallet for user:', order.userId);
            wallet = new Wallet({
                userId: order.userId,
                balance: 0,
                currency: 'INR',
                transactions: [],
            });
        }
        
        wallet.balance += refundAmount;
        wallet.transactions.push({
            orderId: order._id.toString(),
            amount: refundAmount,
            type: 'Credit',
            method: 'Refund',
            status: 'Completed',
            date: new Date(),
            description: `Refund for returned item (Order: ${order.orderId})`,
        });
        
        try {
            await wallet.save();
            console.log('Wallet updated with refund:', wallet._id);
        } catch (err) {
            console.error('Error saving wallet in approveReturn:', err);
            throw err;
        }

        for(let item  of order.orderedItems ) {
            item.status = "Return Approved";

            await Product.updateOne(
                { _id: item.productId, 'variants._id': item.variantId },
                { $inc: { 'variants.$.stock': item.quantity } }
            );
        } 

        order.status = 'Return Approved'
    }

    await order.save();

    res.json({ success: true, message: `status updated` });
  } catch (error) {
    console.error('Approve Return Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }

};

// const approveReturn = async (req, res) => {

//     const {status} = req.body ;
//     const {orderId} = req.params;
    
//     try {
//         if (!req.user.isAdmin) {
//             return res.status(403).json({ success: false, message: 'Admin access required' });
//         }
            
//         const order  = await Order.findById(orderId);

//     if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

//     // const item = order.orderedItems.find(
//     //   (i) => i.productId.toString() === productId && (!variantId || i.variantId.toString() === variantId)
//     // );
//     // if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

//     // if (item.status !== 'Return Requested') {
//     //   return res.status(400).json({ success: false, message: 'No return request found for this item' });
//     // }

//     if(status === "rejected") {
//        order.status =  "Delivered"
       
//     }else {

//     }


//     const refundAmount = item.totalPrice;
    
//     // Update item status
//     item.status = 'Return Approved';
//     item.returnApprovedOn = new Date();
//     order.refundStatus = 'Initiated';

//     // Update wallet
//     let wallet = await Wallet.findOne({ userId: order.userId });
//     if (!wallet) {
//       console.log('Creating new wallet for user:', order.userId);
//       wallet = new Wallet({
//         userId: order.userId,
//         balance: 0,
//         currency: 'INR',
//         transactions: [],
//       });
//     }


//     console.log(refundAmount);
    
//     wallet.balance += refundAmount;
//     wallet.transactions.push({
//       orderId: order._id.toString(),
//       amount: refundAmount,
//       type: 'Credit',
//       method: 'Refund',
//       status: 'Completed',
//       date: new Date(),
//       description: `Refund for returned item (Order: ${order.orderId})`,
//     });

//     try {
//       await wallet.save();
//       console.log('Wallet updated with refund:', wallet._id);
//     } catch (err) {
//       console.error('Error saving wallet in approveReturn:', err);
//       throw err;
//     }

//     await Product.updateOne(
//       { _id: item.productId, 'variants._id': item.variantId },
//       { $inc: { 'variants.$.stock': item.quantity } }
//     );

//     item.status = 'Return Completed';
//     order.refundStatus = 'Completed';

//     await order.save();

//     res.json({ success: true, message: `Refund of ₹${refundAmount.toFixed(2)} credited to wallet` });
//   } catch (error) {
//     console.error('Approve Return Error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };

module.exports = {
    loadOrderPage,
    loadOrderDetailPage,
    updateOrderStatus,
    approveReturn,
};