const Cart = require('../../models/cartSchema');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema'); 
const { createOrder, verifyPayment } = require('../../services/razorpayService');
const { findBestOffer, calculateCartSummary } = require('./cartController');
const { validateCoupon } = require('./couponController');



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

    const cartSummary = await calculateCartSummary(cart, userId);

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

      const offer = await findBestOffer(product, item.variantId);
      const basePrice = variant.salePrice;
      const finalPrice = offer 
        ? basePrice - (basePrice * offer.discountPercentage / 100)
        : basePrice;
      
      return {
        _id: item._id,
        productId: item.productId._id,
        productName: item.productId.productName,
        productImage: item.productId.productImage && item.productId.productImage.length > 0
          ? item.productId.productImage[0]
          : '/images/default-product.jpg',
        variant: variant ? { size: variant.size || 'N/A', quantity: variant.quantity } : { size: 'N/A', quantity: 0 },
        quantity: item.quantity,
        price: finalPrice,
        basePrice: basePrice,
        offer: offer ? {
          percentage: offer.discountPercentage,
          type: offer.offerType,
          name: offer.offerName
        } : null,
        isGiftWrapped: item.isGiftWrapped,
        stockAvailable: variant ? variant.quantity : 0,
        totalPrice: finalPrice * item.quantity
      };
    }));

    const validCartItems = cartItems.filter(item => item !== null);

    const subtotal = cartSummary.subtotal;
    const giftWrapTotal = cartSummary.giftWrapTotal;
    const offerDiscount = cartSummary.offerDiscount;
    const couponDiscount = cartSummary.couponDiscount;
    const shipping = deliveryOptions[0].price;
    const total = Math.max(0, subtotal + giftWrapTotal + shipping - (offerDiscount + couponDiscount));

    res.render('user/checkOut', {
      user,
      cartItems: validCartItems,
      addresses: addressData ? addressData.address : [],
      deliveryOptions,
      paymentOptions,
      subtotal,
      giftWrapTotal,
      shipping,
      total,
      appliedCoupon: cartSummary.appliedCoupon
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/cart');
  }
};

const processReferralBonus = async (user) => {
    if (!user.hasCompletedPurchase && user.referredBy) {
        try {
            const referrer = await User.findById(user.referredBy);
            if (referrer) {
                let referrerWallet = await Wallet.findOne({ userId: referrer._id });
                if (!referrerWallet) {
                    referrerWallet = new Wallet({
                        userId: referrer._id,
                        balance: 0,
                        currency: 'INR',
                        transactions: []
                    });
                }

                const referralBonus = referrer.referralBonusAmount || 1000;
                referrerWallet.balance += referralBonus;
                referrerWallet.transactions.push({
                    amount: referralBonus,
                    type: 'credit',
                    method: 'ReferralBonus',
                    description: `Referral bonus for ${user.firstName} ${user.lastName}'s first purchase`,
                    date: new Date()
                });

                referrer.totalReferralEarnings += referralBonus;
                referrer.referralCount += 1;

                await referrerWallet.save();
                await referrer.save();

                user.hasCompletedPurchase = true;
                user.firstPurchaseDate = new Date();
                await user.save();

                return true;
            }
        } catch (error) {
            console.error('Error processing referral bonus:', error);
        }
    }
    return false;
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, dbOrderId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !dbOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing payment verification parameters',
                redirect: '/checkout/payment-failed?error=Missing payment parameters'
            });
        }

        const isValid = verifyPayment({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        });

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature',
                redirect: '/checkout/payment-failed?error=Invalid payment signature'
            });
        }

        const order = await Order.findById(dbOrderId);
        if (!order) {
            return res.status(400).json({
                success: false,
                message: 'Order not found',
                redirect: '/checkout/payment-failed?error=Order not found'
            });
        }

        order.payment = {
            method: 'razorpay',
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            status: 'completed'
        };
        order.status = 'Processing';
        await order.save();

        for (const item of order.orderedItems) {
            const product = await Product.findById(item.productId);
            if (!product) continue;

            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (!variant) continue;

            variant.quantity -= item.quantity;
            await product.save();
        }

        const user = await User.findById(order.userId);
        if (user) {
            await processReferralBonus(user);
        }

        await Cart.findOneAndUpdate(
            { userId: order.userId },
            { $set: { items: [], coupon: {} } }
        );

        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order._id,
            redirect: `/orders/success?orderId=${order._id}`
        });
    } catch (error) {
        console.error('Payment verification failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify payment',
            redirect: '/checkout/payment-failed?error=Payment verification failed'
        });
    }
};


const processCheckout = async (req, res) => {
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

        if (!user.hasCompletedPurchase && user.referredBy) {
            try {
                const referrer = await User.findById(user.referredBy);
                if (referrer) {
                    let referrerWallet = await Wallet.findOne({ userId: referrer._id }) || new Wallet({
                        userId: referrer._id,
                        balance: 0,
                        currency: 'INR',
                        transactions: []
                    });

                    if (!referrerWallet._id) {
                        await referrerWallet.save();
                        referrer.wallet = [referrerWallet._id];
                        await referrer.save();
                    }

                    const referralBonus = user.referralBonusAmount || 1000;
                    referrerWallet.balance += referralBonus;
                    referrerWallet.transactions.push({
                        amount: referralBonus,
                        type: 'Credit',
                        method: 'ReferralBonus',
                        status: 'Completed',
                        description: `Referral bonus for ${user.firstName} ${user.lastName}'s first purchase`,
                        date: new Date()
                    });
                    await referrerWallet.save();

                    referrer.totalReferralEarnings += referralBonus;
                    referrer.referralCount += 1;
                    await referrer.save();

                    user.hasCompletedPurchase = true;
                    user.firstPurchaseDate = new Date();
                    await user.save();
                }
            } catch (error) {
                console.error('Error processing referral bonus:', error);
            }
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

        const cartSummary = await calculateCartSummary(cart, userId);

        const orderedItems = await Promise.all(cart.items.map(async (item) => {
            const product = await Product.findById(item.productId);
            if (!product) return null;

            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (!variant) return null;

            if (variant.quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${product.productName}`);
            }

            const basePrice = Number(variant.salePrice) || 0;
            const offer = await findBestOffer(product, item.variantId);
            const finalPrice = offer
                ? basePrice - (basePrice * (offer.discountPercentage / 100))
                : basePrice;

            const itemGiftWrapCharge = item.isGiftWrapped ? 100 : 0;
            const totalPriceBeforeGiftWrap = finalPrice * item.quantity;
            const totalGiftWrapCharge = itemGiftWrapCharge * item.quantity;
            const totalPriceWithGiftWrap = totalPriceBeforeGiftWrap + totalGiftWrapCharge;

            return {
                productId: item.productId._id,
                variantId: item.variantId,
                quantity: item.quantity,
                basePrice,
                price: finalPrice,
                giftWrapCharge: totalGiftWrapCharge,
                totalPrice: totalPriceWithGiftWrap,
                isGiftWrapped: item.isGiftWrapped,
                status: 'Active',
                offerApplied: offer ? {
                    discountPercentage: offer.discountPercentage,
                    discountAmount: (basePrice * (offer.discountPercentage / 100)) * item.quantity
                } : null
            };
        }));

        const validOrderedItems = orderedItems.filter(item => item !== null);
        if (validOrderedItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid items in cart' });
        }

        const subtotal = validOrderedItems.reduce((sum, item) => sum + (item.basePrice * item.quantity), 0);
        const giftWrapTotal = validOrderedItems.reduce((sum, item) => sum + item.giftWrapCharge, 0);
        const offerDiscountTotal = validOrderedItems.reduce((sum, item) => sum + (item.offerApplied ? item.offerApplied.discountAmount : 0), 0);

        let couponDiscount = 0, couponCode = '', couponApplied = false, couponId = null;

        if (cart.coupon?.couponId) {
            const coupon = await Coupon.findById(cart.coupon.couponId);
            const validation = await validateCoupon(coupon, userId, cart);
            if (validation.valid) {
                couponDiscount = Number(validation.discountAmount) || 0;
                couponCode = coupon.code;
                couponApplied = true;
                couponId = coupon._id;

                coupon.usageCount += 1;
                await coupon.save();
            }
        }

        const shipping = Number(selectedDelivery.price) || 0;
        const totalSavings = Number(offerDiscountTotal + couponDiscount);
        const finalAmount = Math.max(0, subtotal + giftWrapTotal + shipping - totalSavings);

        if (isNaN(finalAmount)) {
            throw new Error('Invalid order amount calculation');
        }

        if (paymentMethod === 'cash on delivery') {
            if (finalAmount < 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash on Delivery is not available for orders below ₹1000'
                });
            }

            if (finalAmount > 10000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash on Delivery is not available for orders above ₹10,000'
                });
            }
        }


        if (paymentMethod === 'luxewallet') {
            const wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                return res.status(400).json({ success: false, message: 'Wallet not found for user' });
            }
            if (wallet.balance < finalAmount) {
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
            }

            wallet.transactions.push({
                orderId: `order_${Date.now()}`,
                amount: finalAmount,
                type: 'Debit',
                method: 'OrderPayment',
                status: 'Completed',
                description: `Payment for order using Luxe Wallet`
            });

            wallet.balance -= finalAmount;
            await wallet.save();
        }

        if (paymentMethod === 'razorpay') {
            const razorpayOrder = await createOrder({
                amount: finalAmount * 100,
                receipt: `order_${Date.now()}`
            });

            const order = await createOrderInDatabase({
                userId,
                addressId,
                address,
                deliveryMethod,
                paymentMethod,
                orderedItems: validOrderedItems,
                subtotal,
                giftWrapTotal,
                offerDiscountTotal,
                couponDiscount,
                couponCode,
                couponApplied,
                couponId,
                shipping,
                totalSavings,
                finalAmount,
                razorpayOrderId: razorpayOrder.id
            });

            return res.json({
                success: true,
                paymentMethod: 'razorpay',
                order: {
                    id: razorpayOrder.id,
                    amount: razorpayOrder.amount,
                    currency: razorpayOrder.currency,
                    dbOrderId: order._id
                },
                key_id: process.env.RAZORPAY_KEY_ID
            });
        }

        const order = await createOrderInDatabase({
            userId,
            addressId,
            address,
            deliveryMethod,
            paymentMethod,
            orderedItems: validOrderedItems,
            subtotal,
            giftWrapTotal,
            offerDiscountTotal,
            couponDiscount,
            couponCode,
            couponApplied,
            couponId,
            shipping,
            totalSavings,
            finalAmount
        });

        for (const item of validOrderedItems) {
            const product = await Product.findById(item.productId);
            if (!product) continue;
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (!variant) continue;
            variant.quantity -= item.quantity;
            await product.save();
        }

        cart.items = [];
        cart.coupon = {};
        await cart.save();

        if (paymentMethod !== 'razorpay') {
            await processReferralBonus(user);
        }

        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order._id,
            redirect: `/orders/success?orderId=${order._id}`
        });

    } catch (error) {
        console.error('Checkout process failed:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process checkout'
        });
    }
};


const createOrderInDatabase = async ({
  userId,
  addressId,
  address,
  deliveryMethod,
  paymentMethod,
  orderedItems,
  subtotal,
  giftWrapTotal,
  offerDiscountTotal,
  couponDiscount,
  couponCode,
  couponApplied,
  couponId,
  shipping,
  totalSavings,
  finalAmount,
  razorpayOrderId
}) => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.random().toString(36).substr(2, 4).toUpperCase();
  const orderIdStr = `ORD-${dateStr}-${randomStr}`;

  const orderData = {
    userId,
    orderId: orderIdStr,
    orderedItems,
    totalPrice: subtotal,
    giftWrapTotal,
    offerDiscountTotal,
    totalSavings,
    shipping,
    discount: couponDiscount,
    finalAmount,
    address: addressId,
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
    invoiceDate: date,
    status: 'Pending',
    createdOn: date,
    couponApplied,
    couponCode,
    couponId,
    deliveryMethod,
    paymentMethod,
    payment: {
      method: paymentMethod,
      status: paymentMethod === 'razorpay' ? 'initiated' : paymentMethod === 'luxewallet' ? 'completed' : 'pending',
      orderId: razorpayOrderId || undefined
    }
  };

  return await Order.create(orderData);
};

const showPaymentFailedPage = async (req, res) => {
  try {
    const { error } = req.query;
    res.render('user/paymentFailed', {
      error: error || 'Payment could not be processed'
    });
  } catch (err) {
    console.error('Error showing payment failed page:', err);
    res.redirect('/');
  }
};

module.exports = {
  loadCheckout,
  processCheckout,
  verifyRazorpayPayment,
  showPaymentFailedPage
};