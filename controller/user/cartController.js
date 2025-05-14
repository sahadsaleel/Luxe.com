const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');


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

        let cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productDescription productImage variants status isDeleted',
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
            });
        }

        const cartItems = cart.items.map(item => {
            const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
            return {
                ...item.toObject(),
                variant: variant || { size: 'N/A', regularPrice: item.price || 0, salePrice: 0 },
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

        
        const total = subtotal + giftWrapTotal;

        res.render('user/userCart', {
            user: userData,
            cartItems,
            subtotal, 
            giftWrapTotal,
            total, 
        });
    } catch (error) {
        console.error('Error retrieving cart data:', error);
        res.redirect('/pageNotFound');
    }
};


const addToCart = async (req, res) => {
    try {
        const { productId, variantId, isGiftWrapped } = req.body;
        const userId = req.session.user;

        if (!productId || !variantId) {
            return res.status(400).json({ success: false, message: 'Product ID and Variant ID are required' });
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

        if (variant.quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Selected variant is out of stock' });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const cartItem = cart.items.find(
            item => item.productId.toString() === productId && item.variantId.toString() === variantId
        );

        let price = variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
        if (isGiftWrapped) {
            price += 450;
        }

        if (cartItem) {
            if (cartItem.quantity + 1 > variant.quantity) {
                return res.status(400).json({ success: false, message: 'Cannot add more items than available stock' });
            }
            cartItem.quantity += 1;
            cartItem.price = price; 
            cartItem.isGiftWrapped = isGiftWrapped; 
            cartItem.totalPrice = cartItem.quantity * cartItem.price;
        } else {
            cart.items.push({
                productId,
                variantId,
                quantity: 1,
                price, 
                totalPrice: price,
                isGiftWrapped, 
            });
        }

        await cart.save();
        res.json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    const product = await Product.findById(productId);
    if (!product || product.status !== 'listed') {
      return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isInWishlist = user.wishlist.includes(productId);
    if (isInWishlist) {
      user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
      await user.save();
      res.json({ success: true, message: 'Product removed from wishlist' });
    } else {
      user.wishlist.push(productId);
      await user.save();
      res.json({ success: true, message: 'Product added to wishlist' });
    }
  } catch (error) {
    console.error('Error updating wishlist:', error);
    res.status(500).json({ success: false, message: 'Server error' });
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

        item.quantity = quantity;
        item.totalPrice = item.price * quantity;
        await cart.save();

        res.json({ success: true, message: 'Quantity updated' });
    } catch (error) {
        console.error('Error updating quantity:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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
        await cart.save();

        res.json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
        console.error('Error removing item:', error);
        res.status(500).json({ success: false, message: 'Server error' });
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
            select: 'productName productImage variants',
        });
        const addressData = await Address.findOne({ userId });

        if (!cart || cart.items.length === 0) {
            return res.render('user/cart', {
                user,
                cart: null,
                cartItems: [],
                subtotal: 0,
                giftWrapTotal: 0,
                shipping: 0,
                total: 0,
            });
        }

        const deliveryOptions = [
            { id: 'standard', title: 'Standard Delivery', description: '4-7 Business Days', price: 0 },
            { id: 'express', title: 'Express Delivery', description: '2-4 Business Days', price: 99 },
        ];

        const paymentOptions = [
            { id: 'razorpay', label: 'Razorpay', icon: 'fa-credit-card' },
            { id: 'luxewallet', label: 'Luxe Wallet', icon: 'fa-wallet' },
            { id: 'cash on delivery', label: 'Cash on Delivery', icon: 'fa-money-bill' },
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
                isGiftWrapped: item.isGiftWrapped,
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

        const shipping = deliveryOptions[0].price; 
        const total = subtotal + giftWrapTotal + shipping;

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
            return res.status(400).json({ success: false, message: 'Missing required fields: address, delivery method, or payment method' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            select: 'productName productDescription productImage variants status isDeleted',
        });

        if (!cart || !cart.items.length) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const addressData = await Address.findOne({ userId });
        if (!addressData || !addressData.address.length) {
            return res.status(400).json({ success: false, message: 'No addresses found for user' });
        }

        const address = addressData.address.find(addr => addr._id.toString() === addressId);
        if (!address) {
            return res.status(400).json({ success: false, message: 'Invalid address selected' });
        }

        const deliveryOptions = [
            { id: 'standard', price: 0 },
            { id: 'express', price: 99 },
        ];
        const selectedDelivery = deliveryOptions.find(opt => opt.id === deliveryMethod);
        if (!selectedDelivery) {
            return res.status(400).json({ success: false, message: 'Invalid delivery method selected' });
        }

        const paymentOptions = ['razorpay', 'luxewallet', 'cash on delivery'];
        if (!paymentOptions.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method selected' });
        }

        const orderedItems = cart.items.map(item => ({
            productId: item.productId._id,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice,
            isGiftWrapped: item.isGiftWrapped,
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

        const shipping = selectedDelivery.price;
        const finalAmount = subtotal + giftWrapTotal + shipping;

        for (const item of cart.items) {
            const product = await Product.findById(item.productId);
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (!variant || variant.quantity < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${item.productId.productName}` });
            }
            variant.quantity -= item.quantity;
            await product.save();
        }

        const order = new Order({
            userId,
            orderedItems,
            totalPrice: subtotal,
            giftWrapTotal,
            shipping,
            discount: 0,
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
                altPhone: address.altPhone,
            },
            invoiceDate: new Date(),
            status: 'Pending',
            createdOn: new Date(),
            couponApplied: false,
            deliveryMethod,
            paymentMethod,
        });

        await order.save();

        cart.items = [];
        await cart.save();

        return res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order._id,
        });
    } catch (error) {
        console.error('Error in submitCheckout:', error);
        return res.status(500).json({ success: false, message: 'An error occurred while processing your order' });
    }
};

module.exports = {
    addToCart,
    addToWishlist,
    loadCartPage,
    updateCartQuantity,
    removeFromCart,
    loadCheckout,
    submitCheckout
};

