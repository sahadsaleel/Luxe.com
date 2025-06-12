const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Offer = require('../../models/offerSchema');
const { validateCoupon } = require('./couponController');


const findBestOffer = async (product, variantId) => {
  try {
    const activeOffers = await Offer.find({
      status: 'Active',
      endDate: { $gt: new Date() }
    });

    if (!activeOffers || activeOffers.length === 0) return null;

    const variant = product.variants.find(v => v._id.toString() === variantId.toString());
    if (!variant) return null;
    
    const basePrice = variant.salePrice;

    const applicableOffers = activeOffers.filter(offer => {
      if (offer.offerType === 'product' && 
          offer.targetId.toString() === product._id.toString()) {
        return true;
      }
      if (offer.offerType === 'categories' && 
          product.productCategory && 
          offer.targetId.toString() === product.productCategory._id.toString()) {
        return true;
      }
      if (offer.offerType === 'brand' && 
          product.productBrand && 
          offer.targetId.toString() === product.productBrand._id.toString()) {
        return true;
      }
      return false;
    });

    if (!applicableOffers.length) return null;

    const bestOffer = applicableOffers.reduce((best, current) => {
      return !best || current.discount > best.discount ? current : best;
    }, null);

    const discountAmount = (basePrice * bestOffer.discount) / 100;

    return {
      offerId: bestOffer._id,
      offerName: bestOffer.offerName,
      offerType: bestOffer.offerType,
      discountPercentage: bestOffer.discount,
      discountAmount: discountAmount,
      endDate: bestOffer.endDate
    };
  } catch (error) {
    console.error('Error finding best offer:', error);
    return null;
  }
};

const calculateCartSummary = async (cart, userId) => {
  const enrichedItems = await Promise.all(cart.items.map(async item => {
    const product = await Product.findById(item.productId)
      .populate('productCategory')
      .populate('productBrand');
    if (!product) return null;

    const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
    if (!variant) return null;

    const basePrice = Number(variant.salePrice) || 0;
    const offer = await findBestOffer(product, item.variantId);
    
    const discountedPrice = offer 
      ? basePrice - (basePrice * (offer.discountPercentage / 100))
      : basePrice;

    const itemGiftWrapCharge = item.isGiftWrapped ? 100 : 0;
    const quantity = Number(item.quantity) || 0;
    const totalPriceBeforeGiftWrap = discountedPrice * quantity;
    const totalGiftWrapCharge = itemGiftWrapCharge * quantity;
    const totalPriceWithGiftWrap = totalPriceBeforeGiftWrap + totalGiftWrapCharge;
    const totalDiscount = offer ? (basePrice - discountedPrice) * quantity : 0;

    return {
      ...item.toObject(),
      variant,
      quantity: quantity,
      stockAvailable: variant.quantity,
      basePrice: Number(basePrice),
      discountedPrice: Number(discountedPrice),
      offerApplied: offer,
      giftWrapCharge: Number(totalGiftWrapCharge),
      totalPrice: Number(totalPriceWithGiftWrap),
      totalDiscount: Number(totalDiscount),
      itemTotal: Number(basePrice * quantity),
      itemDiscountedTotal: Number(discountedPrice * quantity)
    };
  }));

  const validItems = enrichedItems.filter(Boolean);

  const subtotal = validItems.reduce((sum, item) => 
    sum + item.itemTotal, 0);

  const giftWrapTotal = validItems.reduce((sum, item) => 
    sum + item.giftWrapCharge, 0);
  
  const offerDiscount = validItems.reduce((sum, item) => 
    sum + (item.totalDiscount || 0), 0);

  let couponDiscount = 0;
  let appliedCoupon = null;

  const amountAfterOfferDiscount = subtotal - offerDiscount;

  if (cart.coupon?.couponId) {
    const coupon = await Coupon.findById(cart.coupon.couponId);
    if (coupon) {
      const validation = await validateCoupon(coupon, userId, cart, amountAfterOfferDiscount);
      if (validation.valid) {
        couponDiscount = Number(validation.discountAmount) || 0;
        appliedCoupon = {
          code: coupon.code,
          discountValue: coupon.discountAmount,
          discount: couponDiscount,
          minPurchase: coupon.minPurchase
        };
      } else {
        cart.coupon = {};
        await cart.save();
        couponDiscount = 0;
        appliedCoupon = null;
      }
    } else {
      cart.coupon = {};
      await cart.save();
    }
  }

  const totalSavings = Number(offerDiscount) + Number(couponDiscount);

  const total = Math.max(0, subtotal + giftWrapTotal - totalSavings);
  
  return {
    items: validItems,
    subtotal: Number(subtotal.toFixed(2)),
    giftWrapTotal: Number(giftWrapTotal.toFixed(2)),
    offerDiscount: Number(offerDiscount.toFixed(2)),
    couponDiscount: Number(couponDiscount.toFixed(2)),
    totalSavings: Number(totalSavings.toFixed(2)),
    total: Number(total.toFixed(2)),
    appliedCoupon,
    amountAfterOfferDiscount: Number(amountAfterOfferDiscount.toFixed(2))
  };
};

const loadCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    let cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage variants isDeleted productCategory productBrand',
      populate: [
        { path: 'productCategory' },
        { path: 'productBrand' }
      ]
    });

    if (cart) {
      cart.items = cart.items.filter(item => item.productId && !item.productId.isDeleted);
      await cart.save();
    }

    if (!cart || cart.items.length === 0) {
      return res.render('user/userCart', {
        user,
        cartItems: [],
        subtotal: 0,
        giftWrapTotal: 0,
        offerDiscount: 0,
        totalSavings: 0,
        total: 0,
        appliedCoupon: null
      });
    }

    const summary = await calculateCartSummary(cart, userId);

    res.render('user/userCart', {
      user,
      cartItems: summary.items,
      subtotal: summary.subtotal,
      giftWrapTotal: summary.giftWrapTotal,
      offerDiscount: summary.offerDiscount,
      totalSavings: summary.totalSavings,
      total: summary.total,
      appliedCoupon: summary.appliedCoupon
    });
  } catch (err) {
    console.error('Error loading cart page:', err);
    res.redirect('/pageNotFound');
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, variantId, isGiftWrapped, quantity } = req.body;
    const userId = req.session.user;
    
    if (!productId || !variantId || !quantity) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    const product = await Product.findById(productId);
    if (!product || product.isDeleted || product.status !== 'listed') {
      return res.status(404).json({ success: false, message: 'Product not available' });
    }

    const variant = product.variants.find(v => v._id.toString() === variantId);
    if (!variant || variant.quantity < quantity) {
      return res.status(400).json({ success: false, message: 'Variant unavailable or out of stock' });
    }

    let cart = await Cart.findOne({ userId }) || new Cart({ userId, items: [], coupon: {} });

    const existingItem = cart.items.find(item =>
      item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    const basePrice = Number(variant.salePrice) || 0;
    const offer = await findBestOffer(product, variantId);
    
    const discountedPrice = offer 
      ? basePrice - (basePrice * (offer.discountPercentage / 100))
      : basePrice;

    const itemGiftWrapCharge = isGiftWrapped ? 100 : 0;
    const totalPriceBeforeGiftWrap = discountedPrice * quantity;
    const totalGiftWrapCharge = itemGiftWrapCharge * quantity;
    const totalPriceWithGiftWrap = totalPriceBeforeGiftWrap + totalGiftWrapCharge;

    if (existingItem) {
      if (existingItem.quantity + quantity > 5 || existingItem.quantity + quantity > variant.quantity) {
        return res.status(400).json({ success: false, message: 'Quantity exceeds limit or stock' });
      }
      existingItem.quantity += quantity;
      existingItem.isGiftWrapped = isGiftWrapped;
      existingItem.price = discountedPrice;
      existingItem.totalPrice = totalPriceWithGiftWrap;
      existingItem.appliedOffer = offer ? {
        offerId: offer.offerId,
        offerName: offer.offerName,
        offerType: offer.offerType,
        discountPercentage: offer.discountPercentage,
        discountAmount: (basePrice * (offer.discountPercentage / 100)) * existingItem.quantity,
        endDate: offer.endDate
      } : {};
    } else {
      cart.items.push({
        productId,
        variantId,
        quantity,
        price: discountedPrice,
        totalPrice: totalPriceWithGiftWrap,
        isGiftWrapped,
        appliedOffer: offer ? {
          offerId: offer.offerId,
          offerName: offer.offerName,
          offerType: offer.offerType,
          discountPercentage: offer.discountPercentage,
          discountAmount: (basePrice * (offer.discountPercentage / 100)) * quantity,
          endDate: offer.endDate
        } : {}
      });
    }

    if (cart.coupon?.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const result = await validateCoupon(coupon, userId, cart);
      if (!result.valid) cart.coupon = {};
    }

    await cart.save();
    const summary = await calculateCartSummary(cart, userId);
    res.json({ success: true, message: 'Added to cart', cart: summary });
  } catch (err) {
    console.error('Error adding to cart:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const userId = req.session.user;

    if (!itemId || !quantity) {
      return res.status(400).json({ success: false, message: 'Item ID and quantity are required' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(item => item._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    const product = await Product.findById(item.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    if (quantity > variant.quantity || quantity > 5) {
      return res.status(400).json({ success: false, message: 'Quantity exceeds available stock or limit (5)' });
    }

    const basePrice = Number(variant.salePrice) || 0;
    const offer = await findBestOffer(product, item.variantId);
    
    const discountedPrice = offer 
      ? basePrice - (basePrice * (offer.discountPercentage / 100))
      : basePrice;

    const itemGiftWrapCharge = item.isGiftWrapped ? 100 : 0;
    const totalPriceBeforeGiftWrap = discountedPrice * quantity;
    const totalGiftWrapCharge = itemGiftWrapCharge * quantity;
    const totalPriceWithGiftWrap = totalPriceBeforeGiftWrap + totalGiftWrapCharge;

    item.quantity = quantity;
    item.price = discountedPrice;
    item.totalPrice = totalPriceWithGiftWrap;
    item.appliedOffer = offer ? {
      offerId: offer.offerId,
      offerName: offer.offerName,
      offerType: offer.offerType,
      discountPercentage: offer.discountPercentage,
      discountAmount: (basePrice * (offer.discountPercentage / 100)) * quantity,
      endDate: offer.endDate
    } : {};

    let couponRemoved = false;
    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      if (coupon) {
        const validation = await validateCoupon(coupon, userId, cart);
        if (!validation.valid) {
          cart.coupon = {};
          couponRemoved = true;
        }
      } else {
        cart.coupon = {};
        couponRemoved = true;
      }
    }

    await cart.save();

    const cartSummary = await calculateCartSummary(cart, userId);
    res.json({
      success: true,
      message: couponRemoved ? 'Quantity updated and coupon removed (no longer valid)' : 'Quantity updated successfully',
      cart: cartSummary,
      itemPrice: totalPriceWithGiftWrap,
      couponRemoved
    });
  } catch (error) {
    console.error('Error updating quantity:', error);
    res.status(500).json({ success: false, message: 'Failed to update quantity' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.session.user;

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item ID is required' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(item => item._id.toString() !== itemId);
    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const validation = await validateCoupon(coupon, userId, cart);
      if (!validation.valid) {
        cart.coupon = {};
      }
    }

    await cart.save();

    const cartSummary = await calculateCartSummary(cart, userId);
    res.json({ success: true, message: 'Item removed from cart', cart: cartSummary });
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ success: false, message: 'Failed to remove item' });
  }
};

module.exports = {
  addToCart,
  loadCartPage,
  updateCartQuantity,
  removeFromCart,
  findBestOffer, 
  calculateCartSummary 
};