const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Order = require('../../models/orderSchema');



const loadWalletPage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      console.error('User not found:', req.user._id);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let wallet = await Wallet.findOne({ userId: req.user._id }).lean();

    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        balance: 0,
        currency: 'INR',
        transactions: [],
      });

      await User.findByIdAndUpdate(req.user._id, { wallet: [wallet._id] });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 10; 
    const filter = req.query.filter || 'all';

    let transactions = wallet.transactions || [];
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filter !== 'all') {
      transactions = transactions.filter(t => t.type.toLowerCase() === filter.toLowerCase());
    }

    const totalTransactions = transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedTransactions = transactions.slice(startIndex, endIndex);

    const userData = {
      ...user,
      wallet: [wallet],
    };

    res.render('user/userWallet', {
      user: userData,
      wallet: {
        ...wallet,
        transactions: paginatedTransactions
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalTransactions,
        hasNextPage: endIndex < totalTransactions,
        hasPrevPage: page > 1,
        filter
      }
    });

  } catch (err) {
    console.error('Error loading wallet page:', err);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};


// const requestReturn = async (req, res) => {
//   try {
//     const { orderId, productId, variantId, returnReason = 'Customer request', returnComments = '' } = req.body;
//     const userId = req.user._id;

//     const order = await Order.findById(orderId);
//     if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

//     if (order.paymentMethod !== 'cash on delivery') {
//       return res.status(400).json({ success: false, message: 'Only cash on delivery orders can be returned' });
//     }

//     if (order.status !== 'Delivered') {
//       return res.status(400).json({ success: false, message: 'Order must be delivered to request a return' });
//     }

//     const item = order.orderedItems.find(
//       (i) => i.productId.toString() === productId && (!variantId || i.variantId.toString() === variantId)
//     );
//     if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

//     if (item.status !== 'Active') {
//       return res.status(400).json({ success: false, message: 'Return already requested or processed' });
//     }

//     const deliveryDate = new Date(order.deliveryDate || order.createdOn);
//     const returnWindowMs = 30 * 24 * 60 * 60 * 1000;
//     if (Date.now() - deliveryDate > returnWindowMs) {
//       return res.status(400).json({ success: false, message: 'Return window expired' });
//     }

//     item.status = 'Return Requested';
//     item.returnReason = returnReason;
//     item.returnComments = returnComments;
//     item.returnRequestedOn = new Date();

//     order.returnRequestedOn = new Date();
//     order.refundStatus = 'Not Initiated';

//     await order.save();

//     res.json({ success: true, message: 'Return request submitted. Awaiting approval.' });
//   } catch (error) {
//     console.error('Request Return Error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };

module.exports = {
  loadWalletPage,
  // requestReturn,
};