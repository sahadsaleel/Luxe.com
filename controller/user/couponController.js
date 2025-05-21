const Coupon = require('../../models/couponSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');




const validateCoupon = async (coupon, userId, cart) => {
  const now = new Date();
  const subtotal = cart.items.reduce((sum, item) => {
    const itemPrice = Number(item.price) || 0;
    const isGiftWrapped = item.isGiftWrapped || false;
    return sum + (isGiftWrapped ? itemPrice - 450 : itemPrice) * (item.quantity || 1);
  }, 0);

  if (!coupon) {
    return { valid: false, message: 'Invalid or expired coupon' };
  }
  if (!coupon.isActive) {
    return { valid: false, message: 'Coupon is not active' };
  }
  if (now < coupon.validFrom || now > coupon.expireOn) {
    return { valid: false, message: 'Coupon has expired or is not yet valid' };
  }
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }
  if (coupon.usedBy.includes(userId)) {
    return { valid: false, message: 'Coupon already used by this user' };
  }
  if (subtotal < coupon.minimumPrice) {
    return { valid: false, message: `Minimum purchase of ₹${coupon.minimumPrice} required` };
  }

  return { valid: true, coupon, subtotal };
};

const loadCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    if (!user || user.isBlocked) {
      req.session.destroy();
      return res.redirect('/login');
    }

    const coupons = await Coupon.find({
      isList: true,
      expireOn: { $gte: new Date() }
    }).lean();

    res.render('user/userCoupon', { user, coupons });
  } catch (error) {
    console.error('Error loading coupons:', error.message);
    res.status(500).render('error', {
      message: 'Couldn’t load coupons. Please try again later.'
    });
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to view coupons' });
    }

    const coupons = await Coupon.find({
      isList: true,
      validFrom: { $lte: new Date() },
      expireOn: { $gte: new Date() },
      $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usageCount', '$usageLimit'] } }]
    }).lean();

    res.json(coupons.map(coupon => ({
      code: coupon.code,
      discount: coupon.discountValue,
      minPurchase: coupon.minimumPrice,
      expiryDate: coupon.expireOn
    })));
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'Failed to load coupons' });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to apply coupon' });
    }
    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }

    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    const validation = await validateCoupon(coupon, userId, cart);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const discount = (validation.subtotal * validation.coupon.discountValue) / 100;
    cart.coupon = { code: coupon.code, discount, couponId: coupon._id };
    await cart.save();

    res.json({ success: true, message: `Coupon ${coupon.code} applied! You saved ₹${discount.toFixed(2)}` });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to apply coupon' });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to remove coupon' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.coupon = {};
    await cart.save();

    res.json({ success: true, message: 'Coupon removed successfully' });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to remove coupon' });
  }
};

module.exports = { 
    loadCoupons,
    getAvailableCoupons,
    applyCoupon,
    removeCoupon 
};