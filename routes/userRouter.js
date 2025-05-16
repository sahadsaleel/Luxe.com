const express = require('express');
const router = express.Router();
const userController = require('../controller/user/userController');
const profileControllers = require('../controller/user/profileControllers');
const productController = require('../controller/user/productController');
const cartController = require('../controller/user/cartController');
const orderController = require('../controller/user/orderController');
const walletController = require('../controller/user/walletController')
const { uploadSingleImage } = require('../helpers/multer');
const passport = require('passport');
const { userAuth } = require('../middleware/auth');

// Authentication 
router.get('/', userController.loadHomepage);
router.get('/signup', userController.loadSignup);
router.get('/login', userController.loadLogin);
router.get('/logout', userController.logout);
router.get('/verifyotp', userController.verifyOtp);
router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.post('/verifyotp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);

// Google OAuth 
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?message=blocked' }),
    (req, res) => {
        req.session.user = req.user._id;
        res.redirect('/');
    }
);

// Password Reset 
router.get('/forgot-password', profileControllers.getForgotPassword);
router.post('/forgot-email-validation', profileControllers.forgotEmailValid);
router.post('/verifyProfileOtp', profileControllers.verifyOtp);
router.post('/reset-password', profileControllers.resetPassword);
router.post('/resend-reset-otp', profileControllers.resendOtp);

// Profile 
router.get('/profile', userAuth, profileControllers.userProfile);
router.post('/profile/update', userAuth, uploadSingleImage, profileControllers.updateProfile);
router.post('/profile/changePassword', userAuth, profileControllers.changePassword);
router.post('/profile/changeEmail', userAuth, profileControllers.changeEmail);

// Address 
router.get('/address', userAuth, profileControllers.userAddress);
router.get('/address/:id', userAuth, profileControllers.getAddress);
router.post('/address/add', userAuth, profileControllers.addAddress);
router.post('/address/edit/:id', userAuth, profileControllers.editAddress);
router.post('/address/set-default/:id', userAuth, profileControllers.setDefaultAddress);
router.delete('/address/delete/:id', userAuth, profileControllers.deleteAddress);

// Product 
router.get('/shop', userController.loadShopPage);
router.get('/productViewPage', productController.productViewPage);
router.get('/search', productController.searchProduct);

// Wishlist 
router.get('/wishlist', userAuth, productController.loadWishlistPage);
router.post('/wishlist/add/:productId', userAuth, productController.addToWishlist);
router.post('/wishlist/remove/:productId', userAuth, productController.removeFromWishlist);

// Cart 
router.get('/cart', cartController.loadCartPage);
router.post('/cart/add', cartController.addToCart);
router.post('/cart/update-quantity', cartController.updateCartQuantity);
router.post('/cart/remove', cartController.removeFromCart);
router.post('/wishlist/add', cartController.addToWishlist);

// Checkout
router.get('/checkout', cartController.loadCheckout);
router.post('/checkout/submit', cartController.submitCheckout);

// Orders
router.get('/order-success', userAuth, orderController.loadOrderSuccessPage);
router.get('/orders', userAuth, orderController.loadMyOrdersPage);
router.get('/orders/details/:orderId', userAuth, orderController.loadOrderDetailPage);
router.post('/orders/details/:orderId/cancel', userAuth, orderController.cancelOrder);
router.post('/orders/details/:orderId/cancel-item/:itemId', userAuth, orderController.cancelOrderItem);
router.post('/orders/details/:orderId/return', userAuth, orderController.requestReturn);

router.get('/wallet', userAuth, walletController.loadWalletPage);

// Error 
router.get('/pageNotFound', userController.pageNotFound);

module.exports = router;