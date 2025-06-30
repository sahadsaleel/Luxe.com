const Cart = require('../models/cartSchema');

const cartQuantityMiddleware = async (req, res, next) => {
  try {
    if (req.session.user) {
      const cart = await Cart.findOne({ userId: req.session.user });

      const quantity = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

      res.locals.cartQuantity = quantity;
    } else {
      res.locals.cartQuantity = 0;
    }

    next();
  } catch (err) {
    console.error('Cart quantity middleware error:', err.message);
    res.locals.cartQuantity = 0;
    next();
  }
};

module.exports = cartQuantityMiddleware;


