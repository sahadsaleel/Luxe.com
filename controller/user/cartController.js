const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');

// Helper function to validate coupon (shared with couponController)
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

const loadCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const userData = await User.findById(userId);
    if (!userData) {
      return res.redirect('/login');
    }

    let cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage variants isDeleted'
    });

    if (cart) {
      cart.items = cart.items.filter(item => item.productId && !item.productId.isDeleted);
      await cart.save();
    }

    if (!cart || !cart.items.length) {
      return res.render('user/userCart', {
        user: userData,
        cartItems: [],
        subtotal: 0,
        giftWrapTotal: 0,
        total: 0,
        appliedCoupon: null
      });
    }

    const cartItems = cart.items.map(item => {
      const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
      return {
        ...item.toObject(),
        variant: variant || { size: 'N/A' }
      };
    });

    const subtotal = cartItems.reduce((sum, item) => {
      const itemPrice = Number(item.price) || 0;
      const isGiftWrapped = item.isGiftWrapped || false;
      return sum + (isGiftWrapped ? itemPrice - 450 : itemPrice) * (item.quantity || 1);
    }, 0);

    const giftWrapTotal = cartItems.reduce((sum, item) => {
      return item.isGiftWrapped ? sum + 450 * (item.quantity || 1) : sum;
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

    const total = Math.max(0, subtotal + giftWrapTotal - discount);

    res.render('user/userCart', {
      user: userData,
      cartItems,
      subtotal,
      giftWrapTotal,
      total,
      appliedCoupon
    });
  } catch (error) {
    console.error('Error retrieving cart data:', error);
    res.redirect('/pageNotFound');
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, variantId, isGiftWrapped, quantity } = req.body;
    const userId = req.session.user;

    if (!productId || !variantId || !quantity) {
      return res.status(400).json({ success: false, message: 'Product ID, Variant ID, and quantity are required' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to add items to cart' });
    }

    const product = await Product.findById(productId);
    if (!product || product.status !== 'listed' || product.isDeleted) {
      return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
    }

    const variant = product.variants.find(v => v._id.toString() === variantId);
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }

    if (variant.quantity < quantity) {
      return res.status(400).json({ success: false, message: 'Not enough stock available' });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], coupon: {} });
    }

    const cartItem = cart.items.find(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    let price = variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
    if (isGiftWrapped) {
      price += 450;
    }

    if (cartItem) {
      if (cartItem.quantity + quantity > variant.quantity || cartItem.quantity + quantity > 5) {
        return res.status(400).json({ success: false, message: 'Cannot add more than available stock or limit (5)' });
      }
      cartItem.quantity += quantity;
      cartItem.price = price;
      cartItem.isGiftWrapped = isGiftWrapped;
      cartItem.totalPrice = cartItem.quantity * price;
    } else {
      cart.items.push({
        productId,
        variantId,
        quantity,
        price,
        totalPrice: price * quantity,
        isGiftWrapped
      });
    }

    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const validation = await validateCoupon(coupon, userId, cart);
      if (!validation.valid) {
        cart.coupon = {};
      }
    }

    await cart.save();
    res.json({ success: true, message: 'Product added to cart' });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
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
    const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
    if (quantity > variant.quantity || quantity > 5) {
      return res.status(400).json({ success: false, message: 'Quantity exceeds available stock or limit (5)' });
    }

    item.quantity = quantity;
    item.totalPrice = item.price * quantity;

    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      const validation = await validateCoupon(coupon, userId, cart);
      if (!validation.valid) {
        cart.coupon = {};
      }
    }

    await cart.save();
    res.json({ success: true, message: 'Quantity updated successfully' });
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
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ success: false, message: 'Failed to remove item' });
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
      select: 'productName productImage variants'
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

    const cartItems = cart.items.map(item => {
      const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
      return {
        productId: item.productId._id,
        productName: item.productId.productName,
        productImage: item.productId.productImage && item.productId.productImage.length > 0
          ? item.productId.productImage[0]
          : '/images/default-product.jpg',
        variant: variant ? { size: variant.size || 'N/A' } : { size: 'N/A' },
        quantity: item.quantity,
        price: item.price,
        isGiftWrapped: item.isGiftWrapped
      };
    });

    const addresses = addressData ? addressData.address : [];

    const subtotal = cartItems.reduce((sum, item) => {
      let itemPrice = item.price;
      if (item.isGiftWrapped) {
        itemPrice -= 450;
      }
      return sum + itemPrice * item.quantity;
    }, 0);

    const giftWrapTotal = cartItems.reduce((sum, item) => {
      return item.isGiftWrapped ? sum + 450 * item.quantity : sum;
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

    const shipping = deliveryOptions[0].price;
    const total = Math.max(0, subtotal + giftWrapTotal + shipping - discount);

    res.render('user/checkOut', {
      user,
      cartItems,
      addresses,
      deliveryOptions,
      paymentOptions,
      subtotal,
      giftWrapTotal,
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
      select: 'productName productImage variants'
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

    const orderedItems = cart.items.map(item => ({
      productId: item.productId._id,
      variantId: item.variantId,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
      isGiftWrapped: item.isGiftWrapped,
      status: 'Active'
    }));

    const subtotal = orderedItems.reduce((sum, item) => {
      let itemPrice = item.price;
      if (item.isGiftWrapped) {
        itemPrice -= 450;
      }
      return sum + itemPrice * item.quantity;
    }, 0);

    const giftWrapTotal = orderedItems.reduce((sum, item) => {
      return item.isGiftWrapped ? sum + 450 * item.quantity : sum;
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

    const shipping = selectedDelivery.price;
    const finalAmount = Math.max(0, subtotal + giftWrapTotal + shipping - discount);

    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
      if (!variant || variant.quantity < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${item.productId.productName}` });
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
      orderedItems,
      totalPrice: subtotal,
      giftWrapTotal,
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
//   addToWishlist,
  loadCartPage,
  updateCartQuantity,
  removeFromCart,
  loadCheckout,
  submitCheckout
};