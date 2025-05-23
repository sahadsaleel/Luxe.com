const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Offer = require('../../models/offerSchema');
const Address = require("../../models/addressSchema")
const validateCoupon = async (coupon, userId, cart) => {
  const now = new Date();

  const subtotal = cart.items.reduce((sum, item) => {
    const basePrice = Number(item.price) || 0;
    const giftWrapDeduction = item.isGiftWrapped ? 450 : 0;
    return sum + (basePrice - giftWrapDeduction) * item.quantity;
  }, 0);

  if (!coupon || !coupon.isActive || now < coupon.validFrom || now > coupon.expireOn) {
    return { valid: false, message: 'Invalid or expired coupon' };
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


const findBestOffer = async (product, variantId) => {
  try {
    // Get all active offers
    const activeOffers = await Offer.find({
      status: 'Active',
      endDate: { $gt: new Date() }
    });

    if (!activeOffers || activeOffers.length === 0) return null;

    // Get variant price
    const variant = product.variants.find(v => v._id.toString() === variantId.toString());
    if (!variant) return null;
    
    const basePrice = variant.salePrice;

    // Collect all applicable offers
    const applicableOffers = activeOffers.filter(offer => {
      // Product-specific offers
      if (offer.offerType === 'product' && 
          offer.targetId.toString() === product._id.toString()) {
        return true;
      }
      
      // Category offers
      if (offer.offerType === 'categories' && 
          product.productCategory && 
          offer.targetId.toString() === product.productCategory._id.toString()) {
        return true;
      }
      
      // Brand offers
      if (offer.offerType === 'brand' && 
          product.productBrand && 
          offer.targetId.toString() === product.productBrand._id.toString()) {
        return true;
      }
      
      return false;
    });

    if (!applicableOffers.length) return null;

    // Find the offer with the highest discount
    const bestOffer = applicableOffers.reduce((best, current) => {
      return !best || current.discount > best.discount ? current : best;
    }, null);

    // Calculate discount amount
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

// Get cleaned cart summary
const calculateCartSummary = async (cart, userId) => {
  const enrichedItems = await Promise.all(cart.items.map(async item => {
    const product = await Product.findById(item.productId)
      .populate('productCategory')
      .populate('productBrand');
    if (!product) return null;

    const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
    if (!variant) return null;

    const basePrice = variant.salePrice;
    const offer = await findBestOffer(product, item.variantId);
    
    const discountedPrice = offer 
      ? basePrice - (basePrice * offer.discountPercentage / 100)
      : basePrice;

    return {
      ...item.toObject(),
      variant,
      stockAvailable: variant.quantity,
      originalPrice: basePrice,
      discountedPrice: discountedPrice,
      offerApplied: offer,
      totalPrice: discountedPrice * item.quantity,
      totalDiscount: offer ? (basePrice - discountedPrice) * item.quantity : 0
    };
  }));

  const validItems = enrichedItems.filter(Boolean);

  const subtotal = validItems.reduce((sum, item) => sum + item.originalPrice * item.quantity, 0);
  const giftWrapTotal = validItems.reduce((sum, item) => 
    item.isGiftWrapped ? sum + 450 * item.quantity : sum, 0);
  
  const offerDiscount = validItems.reduce((sum, item) => sum + (item.totalDiscount || 0), 0);

  let couponDiscount = 0;
  let appliedCoupon = null;

  if (cart.coupon?.couponId) {
    const coupon = await Coupon.findById(cart.coupon.couponId);
    if (coupon) {
      const result = await validateCoupon(coupon, userId, cart);
      if (result.valid) {
        couponDiscount = (result.subtotal * result.coupon.discountValue) / 100;
        appliedCoupon = { code: coupon.code, discount: couponDiscount };
      }
    }
  }

  const totalSavings = offerDiscount + couponDiscount;
  const total = Math.max(0, subtotal + giftWrapTotal - totalSavings);
  
  return {
    items: validItems,
    subtotal,
    giftWrapTotal,
    offerDiscount,
    totalSavings,
    total,
    appliedCoupon
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

    let price = variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
    if (isGiftWrapped) price += 450;

    const offer = await findBestOffer(product, variantId);

    if (existingItem) {
      if (existingItem.quantity + quantity > 5 || existingItem.quantity + quantity > variant.quantity) {
        return res.status(400).json({ success: false, message: 'Quantity exceeds limit or stock' });
      }
      existingItem.quantity += quantity;
      existingItem.price = price;
      existingItem.isGiftWrapped = isGiftWrapped;
      existingItem.totalPrice = existingItem.quantity * price;
      existingItem.appliedOffer = offer ? {
        offerId: offer.offerId,
        offerName: offer.offerName,
        offerType: offer.offerType,
        discountPercentage: offer.discountPercentage,
        discountAmount: offer.discountAmount,
        endDate: offer.endDate
      } : {};
    } else {
      cart.items.push({
        productId,
        variantId,
        quantity,
        price,
        totalPrice: price * quantity,
        isGiftWrapped,
        appliedOffer: offer ? {
          offerId: offer.offerId,
          offerName: offer.offerName,
          offerType: offer.offerType,
          discountPercentage: offer.discountPercentage,
          discountAmount: offer.discountAmount,
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

    const offer = await findBestOffer(product, item.variantId);
    item.quantity = quantity;
    item.totalPrice = item.price * quantity;
    item.appliedOffer = offer ? {
      offerId: offer.offerId,
      offerName: offer.offerName,
      offerType: offer.offerType,
      discountPercentage: offer.discountPercentage,
      discountAmount: offer.discountAmount,
      endDate: offer.endDate
    } : {};

    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const validation = await validateCoupon(coupon, userId, cart);
      if (!validation.valid) {
        cart.coupon = {};
      }
    }

    await cart.save();

    const cartSummary = await calculateCartSummary(cart, userId);
    res.json({
      success: true,
      message: 'Quantity updated successfully',
      cart: cartSummary,
      itemPrice: item.totalPrice
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

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;

    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    const validation = await validateCoupon(coupon, userId, cart);

    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    cart.coupon = { couponId: coupon._id };
    await cart.save();

    const cartSummary = await calculateCartSummary(cart, userId);
    res.json({ success: true, message: 'Coupon applied successfully', cart: cartSummary });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to apply coupon' });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.coupon = {};
    await cart.save();

    const cartSummary = await calculateCartSummary(cart, userId);
    res.json({ success: true, message: 'Coupon removed successfully', cart: cartSummary });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to remove coupon' });
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      expireOn: { $gte: now },
      usageLimit: { $gt: 0 },
      usedBy: { $nin: [userId] }
    }).select('code discountValue minimumPrice expireOn');

    res.json(coupons.map(coupon => ({
      code: coupon.code,
      discount: coupon.discountValue,
      minPurchase: coupon.minimumPrice,
      expiryDate: coupon.expireOn
    })));
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
};

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage variants category brand'
    });
    const addressData = await Address.findOne({ userId });

    if (!cart || !cart.items.length) {
      return res.render('user/checkOut', {
        user,
        cartItems: [],
        addresses: [],
        deliveryOptions: [],
        paymentOptions: [],
        subtotal: 0,
        giftWrapTotal: 0,
        offerDiscountTotal: 0,
        totalSavings: 0,
        shipping: 0,
        total: 0,
        appliedCoupon: null
      });
    }

    const deliveryOptions = [
      { id: 'standard', title: 'Standard Delivery', description: '4-7 Business Days', price: 0 },
      { id: 'express', title: 'Express Delivery', description: '2-4 Business Days', price: 99 }
    ];

    const paymentOptions = [
      { id: 'razorpay', label: 'Razorpay', icon: 'fa-credit-card' },
      { id: 'luxewallet', label: 'Luxe Wallet', icon: 'fa-wallet' },
      { id: 'cash on delivery', label: 'Cash on Delivery', icon: 'fa-money-bill' }
    ];

    const cartItems = await Promise.all(cart.items.map(async (item) => {
      const product = await Product.findById(item.productId);
      if (!product) {
        console.error(`Product not found for productId: ${item.productId}`);
        return null;
      }
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (!variant) {
        console.error(`Variant not found for variantId: ${item.variantId} in product: ${item.productId}`);
        return null;
      }
      const offerApplied = item.appliedOffer || (await findBestOffer(product, item.variantId));
      return {
        _id: item._id,
        productId: item.productId._id,
        productName: item.productId.productName,
        productImage: item.productId.productImage && item.productId.productImage.length > 0
          ? item.productId.productImage[0]
          : '/images/default-product.jpg',
        variant: variant ? { size: variant.size || 'N/A', quantity: variant.quantity } : { size: 'N/A', quantity: 0 },
        quantity: item.quantity,
        price: item.price,
        isGiftWrapped: item.isGiftWrapped,
        offer: offerApplied,
        stockAvailable: variant ? variant.quantity : 0,
        totalPrice: item.totalPrice,
        finalPrice: item.totalPrice - (offerApplied ? offerApplied.discountAmount * item.quantity : 0)
      };
    }));

    const validCartItems = cartItems.filter(item => item !== null);

    const subtotal = validCartItems.reduce((sum, item) => {
      let itemPrice = item.price;
      if (item.isGiftWrapped) {
        itemPrice -= 450;
      }
      return sum + itemPrice * item.quantity;
    }, 0);

    const giftWrapTotal = validCartItems.reduce((sum, item) => {
      return item.isGiftWrapped ? sum + 450 * item.quantity : sum;
    }, 0);

    const offerDiscountTotal = validCartItems.reduce((sum, item) => {
      return item.offer ? sum + (item.offer.discountAmount * item.quantity) : sum;
    }, 0);

    let discount = 0;
    let appliedCoupon = null;
    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const validation = await validateCoupon(coupon, userId, cart);
      if (validation.valid) {
        discount = (validation.subtotal * validation.coupon.discountValue) / 100;
        appliedCoupon = { code: coupon.code, discount };
      } else {
        cart.coupon = {};
        await cart.save();
      }
    }

    const totalSavings = offerDiscountTotal + discount;
    const shipping = deliveryOptions[0].price;
    const total = Math.max(0, subtotal + giftWrapTotal + shipping - totalSavings);

    res.render('user/checkOut', {
      user,
      cartItems: validCartItems,
      addresses: addressData ? addressData.address : [],
      deliveryOptions,
      paymentOptions,
      subtotal,
      giftWrapTotal,
      offerDiscountTotal,
      totalSavings,
      shipping,
      total,
      appliedCoupon
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/cart');
  }
};

const submitCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, deliveryMethod, paymentMethod } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to proceed' });
    }
    if (!addressId || !deliveryMethod || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Address, delivery method, and payment method are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage variants category brand'
    });
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const addressData = await Address.findOne({ userId });
    const address = addressData?.address.find(addr => addr._id.toString() === addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address selected' });
    }

    const deliveryOptions = [
      { id: 'standard', price: 0 },
      { id: 'express', price: 99 }
    ];
    const selectedDelivery = deliveryOptions.find(opt => opt.id === deliveryMethod);
    if (!selectedDelivery) {
      return res.status(400).json({ success: false, message: 'Invalid delivery method' });
    }

    const paymentOptions = ['razorpay', 'luxewallet', 'cash on delivery'];
    if (!paymentOptions.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    const orderedItems = await Promise.all(cart.items.map(async (item) => {
      const product = await Product.findById(item.productId);
      if (!product) return null;
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (!variant) return null;
      return {
        productId: item.productId._id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        isGiftWrapped: item.isGiftWrapped,
        status: 'Active',
        offerApplied: item.appliedOffer
      };
    }));

    const validOrderedItems = orderedItems.filter(item => item !== null);
    if (validOrderedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid items in cart' });
    }

    const subtotal = validOrderedItems.reduce((sum, item) => {
      let itemPrice = item.price;
      if (item.isGiftWrapped) {
        itemPrice -= 450;
      }
      return sum + itemPrice * item.quantity;
    }, 0);

    const giftWrapTotal = validOrderedItems.reduce((sum, item) => {
      return item.isGiftWrapped ? sum + 450 * item.quantity : sum;
    }, 0);

    const offerDiscountTotal = validOrderedItems.reduce((sum, item) => {
      return item.offerApplied ? sum + (item.offerApplied.discountAmount * item.quantity) : sum;
    }, 0);

    let discount = 0;
    let couponCode = '';
    let couponApplied = false;
    let couponId = null;
    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const validation = await validateCoupon(coupon, userId, cart);
      if (validation.valid) {
        discount = (validation.subtotal * validation.coupon.discountValue) / 100;
        couponCode = coupon.code;
        couponApplied = true;
        couponId = coupon._id;
        coupon.usageCount += 1;
        coupon.usedBy.push(userId);
        await coupon.save();
      }
    }

    const totalSavings = offerDiscountTotal + discount;
    const shipping = selectedDelivery.price;
    const finalAmount = Math.max(0, subtotal + giftWrapTotal + shipping - totalSavings);

    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (!variant || variant.quantity < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product?.productName || 'item'}` });
      }
      variant.quantity -= item.quantity;
      await product.save();
    }

    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substr(2, 4).toUpperCase();
    const orderIdStr = `ORD-${dateStr}-${randomStr}`;

    const order = new Order({
      userId,
      orderId: orderIdStr,
      orderedItems: validOrderedItems,
      totalPrice: subtotal,
      giftWrapTotal,
      offerDiscountTotal,
      totalSavings,
      shipping,
      discount,
      finalAmount,
      address: addressData._id,
      addressDetails: {
        addressType: address.addressType,
        name: address.name,
        landMark: address.landMark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        phone: address.phone,
        altPhone: address.altPhone
      },
      invoiceDate: new Date(),
      status: 'Pending',
      createdOn: new Date(),
      couponApplied,
      couponCode,
      deliveryMethod,
      paymentMethod
    });

    await order.save();
    cart.items = [];
    cart.coupon = {};
    await cart.save();

    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: order._id.toString()
    });
  } catch (error) {
    console.error('Error in checkout:', error);
    res.status(500).json({ success: false, message: 'Failed to process order' });
  }
};

module.exports = {
  addToCart,
  loadCartPage,
  updateCartQuantity,
  removeFromCart,
  applyCoupon,
  removeCoupon,
  getAvailableCoupons,
  loadCheckout,
  submitCheckout
};