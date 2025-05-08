const express = require('express');
const router = express.Router();
const userController = require('../controller/user/userController');
const profileControllers = require('../controller/user/profileControllers');
const productController = require('../controller/user/productController');
const { uploadSingleImage, uploadMultipleImages } = require('../helpers/multer');
// const cartController = require('../controller/user/cartController'); 


const passport = require('passport');
const { userAuth } = require('../middleware/auth');

router.get('/', userController.loadHomepage);
router.get('/signup', userController.loadSignup);
router.get('/login', userController.loadLogin);
router.get('/logout', userController.logout);
router.get('/verifyotp', userController.verifyOtp);
router.get('/pageNotFound', userController.pageNotFound);
router.get('/shop', userController.loadShopPage);



router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.post('/verifyotp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);


router.get('/forgot-password', profileControllers.getForgotPassword);
router.get('/profile',profileControllers.userProfile);
router.get('/address',profileControllers.userAddress);

router.post('/forgot-email-validation', profileControllers.forgotEmailValid);
router.post('/vrifyProfileOtp', profileControllers.verifyOtp);
router.post('/reset-password', profileControllers.resetPassword);
router.post('/resend-reset-otp', profileControllers.resendOtp);
router.post('/profile/update',uploadSingleImage,profileControllers.updateProfile);
router.post('/profile/changePassword', userAuth,profileControllers.changePassword);


router.get('/address/:id', userAuth, profileControllers.getAddress);
router.post('/address/add', userAuth, profileControllers.addAddress);
router.post('/address/edit/:id', userAuth, profileControllers.editAddress);
router.post('/address/set-default/:id', userAuth, profileControllers.setDefaultAddress);
router.delete('/address/delete/:id', userAuth, profileControllers.deleteAddress);


router.get('/productViewPage',productController.productViewPage);
router.get('/search' ,productController.searchProduct)


// // Cart and Wishlist routes
// router.post('/addToCart', userAuth, cartController.addToCart);
// router.post('/addToWishlist', userAuth, cartController.addToWishlist);



router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login?message=blocked' }), (req, res) => {
    req.session.user = req.user._id;
    res.redirect('/');
});

module.exports = router;