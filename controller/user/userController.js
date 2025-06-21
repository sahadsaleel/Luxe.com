const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Wishlist = require('../../models/wishlistSchema')
const Offer = require('../../models/offerSchema')
const mongoose = require('mongoose');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');
const Wallet = require('../../models/walletSchema');
const { generateOtp } = require('../../helpers/otpHelper');
const { sendVerificationEmail } = require('../../helpers/emailHelper');


const pageNotFound = async (req, res) => {
    try {
        res.render('user/page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};



const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        const category = await Category.find({ isListed: true });
        const activeOffers = await Offer.find({
            status: 'Active',
            endDate: { $gt: new Date() },
        });

        const productData = await Product.find({
            isDeleted: false,
            productCategory: { $in: category.map(category => category._id) },
            'variants.quantity': { $gt: 0 }
        })
            .populate('offers')
            .populate('productBrand')
            .populate('productCategory')
            .sort({ createdAt: -1 })
            .limit(Infinity);

        let wishlistProductIds = [];
        const products = productData.map(product => {
            const basePrice = product.variants && product.variants.length > 0
                ? product.variants[0].salePrice || product.variants[0].regularPrice
                : 0;

            let bestOffer = null;
            let discountedPrice = basePrice;

            const productOffers = activeOffers.filter(offer =>
                offer.offerType === 'product' && offer.targetId.toString() === product._id.toString()
            );
            const categoryOffers = activeOffers.filter(offer =>
                offer.offerType === 'categories' && product.productCategory && offer.targetId.toString() === product.productCategory._id.toString()
            );
            const brandOffers = activeOffers.filter(offer =>
                offer.offerType === 'brand' && product.productBrand && offer.targetId.toString() === product.productBrand._id.toString()
            );

            const allOffers = [...productOffers, ...categoryOffers, ...brandOffers];
            if (allOffers.length > 0) {
                bestOffer = allOffers.reduce((best, offer) => (offer.discount > best.discount ? offer : best), allOffers[0]);
                discountedPrice = basePrice - (basePrice * bestOffer.discount / 100);
            }

            if (!product.minSalePrice && basePrice > 0) {
                product.minSalePrice = basePrice;
                product.save().catch(err => console.error(`Error saving minSalePrice for product ${product._id}:`, err));
            }

            return {
                _id: product._id,
                productName: product.productName || 'Unnamed Product',
                productBrand: product.productBrand ? product.productBrand : null,
                productCategory: product.productCategory ? product.productCategory : null,
                price: basePrice || 0,
                discountedPrice: discountedPrice || basePrice,
                productImage: product.productImage && product.productImage.length > 0 ? product.productImage : [],
                status: product.status,
                bestOffer: bestOffer,
                variants: product.variants,
            };
        });

        if (userId) {
            const userData = await User.findById(userId);
            const wishlist = await Wishlist.findOne({ user: userId });
            if (wishlist) {
                wishlistProductIds = wishlist.products.map(item => item.product.toString());
            }
            res.render('user/home', { 
                user: userData, 
                products: products,
                wishlistProductIds
            });
        } else {
            res.render('user/home', { 
                products: products,
                wishlistProductIds
            });
        }
    } catch (error) {
        console.error('Home page error:', error);
        res.status(500).send('Server error');
    }
};

const loadSignup = async (req, res) => {
    try {
        const message = req.query.message === 'blocked' ? 'User is blocked by admin' : 
                        req.query.message ? req.query.message : null;
        res.render('user/signup', { message });
    } catch (error) {
        res.render('user/signup', { message: 'An error occurred while loading the signup page' });
    }
};

const loadLogin = (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        const message = req.query.message === 'blocked' ? 'User is blocked by admin' : null;
        res.render('user/login', { message });
    } catch (error) {
        res.render('user/login', { message: 'An error occurred while loading the login page' });
    }
};

const generateReferralCode = async (firstName) => {
    try {
        const baseCode = `${firstName.substring(0, 3).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        const existingUser = await User.findOne({ referalCode: baseCode });
        if (existingUser) {
            return generateReferralCode(firstName);
        }
        
        return baseCode;
    } catch (error) {
        console.error('Error generating referral code:', error);
        throw error;
    }
};

const signup = async (req, res) => {
    try {
        const { firstName, lastName, email, password, confirmPassword, referralCode } = req.body;
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        const newUserReferralCode = await generateReferralCode(firstName);

        let referrer = null;
        if (referralCode) {
            referrer = await User.findOne({ referalCode: referralCode });
            if (!referrer) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid referral code'
                });
            }
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.status(400).json({
                success: false,
                message: 'Failed to send verification email'
            });
        }
        console.log('OTP :' , otp)

        const wallet = new Wallet({
            userId: null,
            balance: 0,
            currency: 'INR',
            transactions: []
        });

        req.session.userOtp = otp;
        req.session.userData = { 
            firstName, 
            lastName, 
            email, 
            password,
            referalCode: newUserReferralCode,
            referredBy: referrer ? referrer._id : null,
            hasCompletedPurchase: false,
            redeemed: false,
            wallet: [wallet._id],
            referralBonusAmount: 1000,
            totalReferralEarnings: 0,
            referralCount: 0
        };
        req.session.walletData = wallet;
        req.session.otpExpires = Date.now() + 60 * 1000;

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            redirect: '/verifyotp'
        });

    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during signup'
        });
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        throw error;
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const userData = req.session.userData;
        const sessionOtp = req.session.userOtp;
        const otpExpires = req.session.otpExpires;

        if (!userData || !sessionOtp || !otpExpires) {
            return res.status(400).json({
                success: false,
                message: 'Session expired. Please try again.'
            });
        }

        if (Date.now() > otpExpires) {
            return res.status(400).json({
                success: false,
                message: 'OTP expired. Please request a new one.'
            });
        }

        if (otp !== sessionOtp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        const hashedPassword = await bcrypt.hash(userData.password, 10);

        const newUser = new User({
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            password: hashedPassword,
            referalCode: userData.referalCode,
            referredBy: userData.referredBy,
            hasCompletedPurchase: false,
            redeemed: false,
            referralBonusAmount: userData.referralBonusAmount,
            totalReferralEarnings: userData.totalReferralEarnings,
            referralCount: userData.referralCount
        });

        await newUser.save();

        const wallet = new Wallet({
            userId: newUser._id,
            balance: 0,
            currency: 'INR',
            transactions: []
        });

        await wallet.save();

        newUser.wallet = [wallet._id];
        await newUser.save();

        delete req.session.userOtp;
        delete req.session.userData;
        delete req.session.otpExpires;
        delete req.session.walletData;

        return res.status(200).json({
            success: true,
            message: 'Registration successful',
            redirect: '/login'
        });
    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying OTP. Please try again.'
        });
    }
};

const resendOtp = async (req, res) => {
    try {
        const userData = req.session.userData;
        if (!userData || !userData.email) {
            return res.status(400).json({
                success: false,
                message: 'Session expired. Please try signing up again.'
            });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(userData.email, otp);

        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again.'
            });
        }

        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 60 * 1000; 
        console.log('New OTP sent:', otp); 

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully'
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to resend OTP. Please try again.'
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ isAdmin: 0, email: email });

        if (!findUser) {
            return res.render("user/login", { message: "User not found" });
        }
        if (findUser.isBlocked) {
            return res.render("user/login", { message: "User is blocked by admin" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render("user/login", { message: "Incorrect password" });
        }

        req.session.user = findUser._id;
        res.redirect('/');
    } catch (error) {
        res.render("user/login", { message: "login failed, please try again" });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                return res.redirect('/pageNotFound');
            }
            res.redirect('/');
        });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadShopPage = async (req, res) => {
  try {
    const { brands, category, priceFrom, priceTo, sort, page = 1 } = req.query;
    const limit = 8;
    const skip = (page - 1) * limit;

    let query = {
      isDeleted: false,
      status: 'listed',
      productImage: { $exists: true, $ne: [], $type: 'array' },
    };

    const currentFilters = {
      brandf: [],
      categoryf: [],
      sort: sort || 'A-Z',
      minValue: priceFrom || '',
      maxValue: priceTo || '',
      currentPage: parseInt(page),
    };

    if (brands) {
      const selectedBrands = brands.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
      query.productBrand = { $in: selectedBrands };
      currentFilters.brandf = selectedBrands;
    }

    if (category) {
      const selectedCategories = category.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
      query.productCategory = { $in: selectedCategories };
      currentFilters.categoryf = selectedCategories;
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    let products = await Product.find(query)
      .populate('productBrand', 'brandName offers')
      .populate('productCategory', 'name offers')
      .populate('offers')
      .skip(skip)
      .limit(limit);

    const activeOffers = await Offer.find({
      status: 'Active',
      endDate: { $gt: new Date() },
    });

    products = products.map(product => {
      const basePrice = product.variants && product.variants.length > 0
        ? product.variants[0].salePrice
        : 0;

      let bestOffer = null;
      let discountedPrice = basePrice;

      const productOffers = activeOffers.filter(offer =>
        offer.offerType === 'product' && offer.targetId.toString() === product._id.toString()
      );
      const categoryOffers = activeOffers.filter(offer =>
        offer.offerType === 'categories' && product.productCategory && offer.targetId.toString() === product.productCategory._id.toString()
      );
      const brandOffers = activeOffers.filter(offer =>
        offer.offerType === 'brand' && product.productBrand && offer.targetId.toString() === product.productBrand._id.toString()
      );

      const allOffers = [...productOffers, ...categoryOffers, ...brandOffers];
      if (allOffers.length > 0) {
        bestOffer = allOffers.reduce((best, offer) => (offer.discount > best.discount ? offer : best), allOffers[0]);
        discountedPrice = basePrice - (basePrice * bestOffer.discount / 100);
      }

      if (!product.minSalePrice && basePrice > 0) {
        product.minSalePrice = basePrice;
        product.save().catch(err => console.error(`Error saving minSalePrice for product ${product._id}:`, err));
      }

      return {
        id: product._id,
        name: product.productName || 'Unnamed Product',
        brand: product.productBrand ? product.productBrand.brandName : 'Unknown Brand',
        category: product.productCategory ? product.productCategory.name : 'Unknown Category',
        price: basePrice || 0,
        discountedPrice: discountedPrice || basePrice,
        image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : '/img/placeholder.png',
        status: product.status,
        offers: bestOffer ? [bestOffer] : [],
        bestOffer: bestOffer, 
        category: {
          ...product.productCategory,
          offers: categoryOffers,
        },
        brand: {
          ...product.productBrand,
          offers: brandOffers,
        },
        variants: product.variants,
      };
    });

    if (priceFrom || priceTo) {
      const from = priceFrom ? parseFloat(priceFrom) : 0;
      const to = priceTo ? parseFloat(priceTo) : Infinity;
      products = products.filter(product => product.discountedPrice >= from && product.discountedPrice <= to);
    }

    if (sort) {
      if (sort === 'A-Z') {
        products.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sort === 'Z-A') {
        products.sort((a, b) => b.name.localeCompare(a.name));
      } else if (sort === 'price-low-high') {
        products.sort((a, b) => a.discountedPrice - b.discountedPrice);
      } else if (sort === 'price-high-low') {
        products.sort((a, b) => b.discountedPrice - a.discountedPrice);
      }
    }

    const brandsList = await Brand.find({ isBlocked: false }).select('brandName _id');
    const categoriesList = await Category.find({ isListed: true }).select('name _id');

    let wishlistProductIds = [];
    if (req.session.user) {
      try {
        const wishlist = await Wishlist.findOne({ userId: req.session.user });
        if (wishlist && wishlist.products && Array.isArray(wishlist.products)) {
          wishlistProductIds = wishlist.products
            .filter(item => item && item.productId)
            .map(item => item.productId.toString());
        }
      } catch (error) {
        console.error('Error fetching wishlist:', error);
      }
    }

    res.render('user/shop', {
      products,
      brands: brandsList,
      categories: categoriesList,
      user: req.session.user ? await User.findById(req.session.user) : null,
      currentFilters,
      wishlistProductIds: wishlistProductIds || [],
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        nextPage: parseInt(page) + 1,
        prevPage: parseInt(page) - 1,
        totalProducts,
      },
    });
  } catch (error) {
    console.error('Error in loadShopPage:', error);
    res.redirect('/pageNotFound');
  }
};

const loadReferrals = async (req, res) => {
    try {
        const userId = req.session.user;
        
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }

        const wallet = await Wallet.findOne({ userId: user._id });

        const referredUsers = await User.find({ referredBy: userId });
        const completedReferrals = referredUsers.filter(user => user.hasCompletedPurchase);

        const REFERRAL_BONUS_AMOUNT = 1000;

        const referralStats = {
            totalReferrals: referredUsers.length,
            pendingReferrals: referredUsers.length - completedReferrals.length,
            completedReferrals: completedReferrals.length,
            totalEarnings: completedReferrals.length * REFERRAL_BONUS_AMOUNT,
            referralBonus: REFERRAL_BONUS_AMOUNT,
            walletBalance: wallet ? wallet.balance : 0
        };

        const referralHistory = await Promise.all(referredUsers.map(async (referredUser) => {
            const referralTransaction = wallet ? 
                wallet.transactions.find(t => 
                    t.method === 'ReferralBonus' && 
                    t.description.includes(referredUser.firstName)
                ) : null;

            return {
                userName: `${referredUser.firstName} ${referredUser.lastName}`,
                email: referredUser.email,
                joinDate: referredUser.createdOn,
                status: referredUser.hasCompletedPurchase ? 'Completed' : 'Pending',
                rewardAmount: referredUser.hasCompletedPurchase ? REFERRAL_BONUS_AMOUNT : 0,
                rewardDate: referralTransaction ? referralTransaction.date : null,
                firstPurchaseDate: referredUser.firstPurchaseDate
            };
        }));

        referralHistory.sort((a, b) => b.joinDate - a.joinDate);

        res.render('user/userReferrals', {
            user,
            referralStats,
            referralHistory,
            wallet
        });

    } catch (error) {
        console.error('Error in loadReferrals:', error);
        res.status(500).render('error', { 
            error: 'Internal server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadLogin,
    signup,
    login,
    logout,
    verifyOtp,
    resendOtp,
    loadShopPage,
    loadReferrals,
};