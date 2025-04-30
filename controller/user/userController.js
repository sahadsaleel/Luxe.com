const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');

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
        const productData = await Product.find({
            isDeleted: false,
            productCategory: { $in: category.map(category => category._id) },
            'variants.quantity': { $gt: 0 }
        })
            .sort({ createdAt: -1 })
            .limit(6);

        if (userId) {
            const userData = await User.findById(userId);
            res.render('user/home', { user: userData, products: productData });
        } else {
            res.render('user/home', { products: productData });
        }
    } catch (error) {
        console.error('Home page error:', error);
        res.status(500).send('Server error');
    }
};

const loadSignup = async (req, res) => {
    try {
        res.render('user/signup');
    } catch (error) {
        res.status(500).send('Server error');
    }
};

const loadLogin = (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        res.render('user/login', { message: '' });
    } catch (error) {
        res.render('user/login', { message: 'An error occurred while loading the login page' });
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Verify your account',
            text: `Your OTP is ${otp}`,
            html: `<p>Your OTP is: <strong>${otp}</strong></p>`
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

const signup = async (req, res) => {
    try {
        const { firstName, lastName, email, password, confirmPassword } = req.body;
        if (password !== confirmPassword) {
            return res.render('user/signup', { message: 'Password do not match' });
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('user/signup', { message: 'User with this email already exists' });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.render('user/signup', { message: 'Failed to send verification email' });
        }

        req.session.userOtp = otp;
        req.session.userData = { firstName, lastName, email, password };

        res.render('user/verifyotp', { userData: req.session.userData });
        console.log('OTP sent:', otp);
    } catch (error) {
        console.error('Signup error:', error);
        res.redirect('/pageNotFound');
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
        console.log('Received OTP:', otp);

        if (!req.session.userOtp || !req.session.userData) {
            return res.status(400).json({
                success: false,
                message: 'Session data is missing. Please request a new OTP.'
            });
        }

        if (otp === req.session.userOtp) {
            const userData = req.session.userData;

            if (!userData.firstName || !userData.lastName || !userData.email || !userData.password) {
                return res.status(400).json({
                    success: false,
                    message: 'Incomplete user data. Please try again.'
                });
            }

            const passwordHash = await securePassword(userData.password);

            const saveUserData = new User({
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                password: passwordHash
            });

            await saveUserData.save();
            req.session.user = saveUserData._id;

            return res.json({
                success: true,
                message: 'OTP verified successfully.',
                redirectUrl: '/login'
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP. Please try again.'
            });
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({
            success: false,
            message: `An error occurred while verifying OTP. Please try again later. Details: ${error.message}`
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
        // Query parameters
        let { search, sort, categoryf, brandf, minValue, maxValue, page } = req.query;
        const perPage = 6;
        page = parseInt(page) || 1;

        // Price range
        minValue = parseFloat(minValue) || 0;
        maxValue = parseFloat(maxValue) || Infinity;

        // Fetch listed categories and brands
        const listedCategories = await Category.find({ isListed: true }).select('_id name');
        const listedBrands = await Brand.find({ isBlocked: false }).select('_id brandName');

        // Build filter
        let filter = {
            isDeleted: false,
            productCategory: { $in: listedCategories.map(cat => cat._id) },
            'variants.quantity': { $gt: 0 }
        };

        // Search filter
        if (search) {
            filter.productName = { $regex: search, $options: 'i' };
        }

        // Category filter
        if (categoryf) {
            const categories = Array.isArray(categoryf) ? categoryf : [categoryf];
            const categoryIds = listedCategories
                .filter(cat => categories.includes(cat.name))
                .map(cat => cat._id);
            if (categoryIds.length) {
                filter.productCategory = { $in: categoryIds };
            }
        }

        // Brand filter
        if (brandf) {
            const brands = Array.isArray(brandf) ? brandf : [brandf];
            const brandIds = listedBrands
                .filter(brand => brands.includes(brand.brandName))
                .map(brand => brand._id);
            if (brandIds.length) {
                filter.brand = { $in: brandIds };
            }
        }

        // Price filter
        if (minValue || maxValue < Infinity) {
            filter['variants.salePrice'] = {
                $gte: minValue,
                $lte: maxValue
            };
        }

        // Sort options
        let sortOptions = {};
        switch (sort) {
            case 'A-Z':
                sortOptions = { productName: 1 };
                break;
            case 'Z-A':
                sortOptions = { productName: -1 };
                break;
            case 'price-low-high':
                sortOptions = { 'variants.salePrice': 1 };
                break;
            case 'price-high-low':
                sortOptions = { 'variants.salePrice': -1 };
                break;
            default:
                sortOptions = { createdAt: -1 };
        }

        // Pagination
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / perPage);
        const currentPage = Math.max(1, Math.min(page, totalPages));

        // Fetch products
        const products = await Product.find(filter)
            .sort(sortOptions)
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .populate('productCategory brand')
            .lean();

        // Fetch user
        const user = req.session.user;
        let userData = null;
        if (user) {
            userData = await User.findById(user).lean();
        }

        // Prepare current filters for frontend
        const currentFilters = {
            search: search || '',
            sort: sort || '',
            categoryf: categoryf ? (Array.isArray(categoryf) ? categoryf : [categoryf]) : [],
            brandf: brandf ? (Array.isArray(brandf) ? brandf : [brandf]) : [],
            minValue: minValue || '',
            maxValue: maxValue || ''
        };

        // Build pagination URLs
        const buildQueryString = (pageNum) => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (sort) params.set('sort', sort);
            if (categoryf) {
                (Array.isArray(categoryf) ? categoryf : [categoryf]).forEach(cat => params.append('categoryf', cat));
            }
            if (brandf) {
                (Array.isArray(brandf) ? brandf : [brandf]).forEach(brand => params.append('brandf', brand));
            }
            if (minValue) params.set('minValue', minValue);
            if (maxValue) params.set('maxValue', maxValue);
            params.set('page', pageNum);
            return params.toString();
        };

        // Render page
        res.render('user/shop', {
            user: userData,
            products,
            totalPages,
            currentPage,
            categories: listedCategories,
            brands: listedBrands,
            currentFilters,
            buildQueryString
        });
    } catch (error) {
        console.error('Shop page error:', error);
        res.redirect('/pageNotFound');
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
    loadShopPage
};