const Order = require('../../models/orderSchema');



const orderInfo = async (req, res) => {
  try {
    const orders = await Order.find().populate('address'); 

    res.render('admin/orders', { orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).render('error', { error });
  }
};





module.exports = {
    orderInfo
}