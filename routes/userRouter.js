const express = require('express');
const router = express.Router();
const userController = require('../controller/user/userController');
const profileControllers = require('../controller/user/profileControllers');
const productController = require('../controller/user/productController');
const cartController = require('../controller/user/cartController');
const orderController = require('../controller/user/orderController');
const walletController = require('../controller/user/walletController');
const couponController = require('../controller/user/couponController');
const checkoutController = require('../controller/user/checkoutController');
const otpController = require('../controller/user/otpController');
const contactController = require('../controller/user/contactController')
const { uploadSingleImage } = require('../helpers/multer');
const passport = require('passport');
const { userAuth } = require('../middleware/auth');
const returnCancelController = require('../controller/user/returnCancelController');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: false });


// Authentication
router.get('/', userController.loadHomepage);
router.get('/signup', userController.loadSignup);
router.get('/login', userController.loadLogin);
router.get('/verifyOtp', (req, res) => {
    if (!req.session.userData) {
        return res.redirect('/signup');
    }
    res.render('user/verifyOtp', { userData: req.session.userData });
});
router.get('/logout', userController.logout);

router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.post('/verifyotp', otpController.verifySignupOtp);
router.post('/resend-otp', otpController.resendSignupOtp);

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
router.post('/verifyProfileOtp', otpController.verifyForgotPasswordOtp);
router.post('/reset-password', profileControllers.resetPassword);
router.post('/resend-reset-otp', otpController.resendForgotPasswordOtp);

// Profile
router.get('/profile', userAuth, profileControllers.userProfile);
router.post('/profile/update', userAuth, uploadSingleImage, profileControllers.updateProfile);
router.post('/profile/removeImage', userAuth, uploadSingleImage, profileControllers.removeProfileImage);
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
router.get('/shop/load-more', userController.loadShopPage);
router.get('/productViewPage', productController.productViewPage);
router.get('/search', productController.searchProduct);

// Wishlist
router.get('/wishlist', userAuth, productController.loadWishlistPage);
router.post('/wishlist/add/:productId', userAuth, productController.addToWishlist);
router.post('/wishlist/remove/:productId', userAuth, productController.removeFromWishlist);

// Cart
router.get('/cart', userAuth, cartController.loadCartPage);
router.get('/cart/quantity', userAuth, cartController.getCartQuantity);
router.post('/cart/add', userAuth, cartController.addToCart);
router.post('/cart/update-quantity', userAuth, cartController.updateCartQuantity);
router.post('/cart/remove', userAuth, cartController.removeFromCart);
router.post('/cart/apply-coupon', userAuth, couponController.applyCoupon);
router.post('/cart/remove-coupon', userAuth, couponController.removeCoupon);

// Checkout
router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/checkout/process', userAuth, checkoutController.processCheckout);
router.post('/checkout/verify-payment', userAuth, checkoutController.verifyRazorpayPayment);
router.get('/checkout/payment-failed', userAuth, checkoutController.showPaymentFailedPage);

// Orders
router.get('/orders/success', userAuth, orderController.loadOrderSuccessPage);
router.get('/orders', userAuth, orderController.loadMyOrdersPage);
router.get('/orders/details/:orderId', userAuth, orderController.loadOrderDetailPage);

// Return and Cancel routes
router.post('/orders/details/:orderId/cancel', userAuth, returnCancelController.cancelOrder);
router.post('/orders/details/:orderId/cancel-item/:itemId', userAuth, returnCancelController.cancelOrderItem);
router.post('/orders/details/:orderId/return', userAuth, returnCancelController.approveReturn);
router.post('/orders/details/:orderId/return-item/:itemId', userAuth, returnCancelController.approveReturnItem);
router.post('/orders/details/:orderId/request-return/:itemId', userAuth, returnCancelController.requestReturnItem);


// Wallet
router.get('/wallet', userAuth, walletController.loadWalletPage);

// Coupons
router.get('/coupons', userAuth, couponController.loadCoupons);
router.get('/coupons/available', userAuth, couponController.getAvailableCoupons);

// Referrals
router.get('/referrals', userAuth, userController.loadReferrals);


// About & Contact Routes
router.get('/about', contactController.loadAbout);
router.get('/contact', csrfProtection, (req, res, next) => {
  res.locals.csrfToken = req.csrfToken(); 
  next();
}, contactController.loadContactUs);
router.post('/contact', csrfProtection, contactController.handleContactForm);


// Error
router.get('/pageNotFound', userController.pageNotFound);


module.exports = router;