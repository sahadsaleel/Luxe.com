const express = require('express');
const router = express.Router();
const userController = require('../controller/user/userController');
const passport = require('passport');

router.get('/pageNotFound', userController.pageNotFound);

router.get('/', userController.loadHomepage);
router.get('/signup', userController.loadSignup);
router.get('/login', userController.loadLogin);
router.get('/logout', userController.logout);
router.get('/verifyotp', userController.verifyOtp); 
router.post('/verifyotp', userController.verifyOtp); 

router.post('/signup', userController.signup);
router.post('/login', userController.login);

router.get('/shop',userController.loadShopPage)


router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    req.session.user = req.user._id
    res.redirect('/');
});

module.exports = router;