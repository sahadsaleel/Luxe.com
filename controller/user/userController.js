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
            return res.render('user/signup', { message: 'Passwords do not match' });
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
        req.session.otpExpires = Date.now() + 60 * 1000; // Set OTP expiration to 1 minute

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

        if (!req.session.userOtp || !req.session.userData || !req.session.otpExpires) {
            return res.status(400).json({
                success: false,
                message: 'Session data is missing or OTP has expired. Please request a new OTP.'
            });
        }

        if (Date.now() > req.session.otpExpires) {
            req.session.userOtp = null;
            req.session.otpExpires = null;
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new OTP.'
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

            req.session.userOtp = null;
            req.session.otpExpires = null;

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

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }
        const otp = generateOtp();
        req.session.userOtp = otp;
        console.log('OTP:', otp);
        req.session.otpExpires = Date.now() + 60 * 1000; 
        const emailSent = await sendVerificationEmail(email, otp);
        console.log(emailSent);

        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "OTP Resent Successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP", error);
        res.status(500).json({ success: false, message: "Internal Server Error. Please try again" });
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
        const { brands, category, priceFrom, priceTo, sort } = req.query;

        let query = { isDeleted: false, status: 'listed' };

        const currentFilters = {
            brandf: [],
            categoryf: [],
            sort: sort || 'A-Z',
            minValue: priceFrom || '',
            maxValue: priceTo || '',
        };

        if (brands) {
            const selectedBrands = brands.split(',').filter(id => id);
            query.productBrand = { $in: selectedBrands };
            currentFilters.brandf = selectedBrands;
        }

        if (category) {
            const selectedCategories = category.split(',').filter(id => id);
            query.productCategory = { $in: selectedCategories };
            currentFilters.categoryf = selectedCategories;
        }

        let products = await Product.find(query)
            .populate('productBrand', 'brandName')
            .populate('productCategory', 'name');

        products = products.map(product => {
            const price = product.variants && product.variants.length > 0
                ? (product.variants[0].salePrice > 0 ? product.variants[0].salePrice : product.variants[0].regularPrice)
                : 0;

            if (!product.minSalePrice && price > 0) {
                product.minSalePrice = price;
                product.save();
            }

            return {
                id: product._id,
                name: product.productName,
                brand: product.productBrand ? product.productBrand.brandName : 'Unknown Brand',
                category: product.productCategory ? product.productCategory.name : 'Unknown Category',
                price: price,
                image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null,
                status: product.status,
            };
        });

        if (priceFrom || priceTo) {
            const from = priceFrom ? parseFloat(priceFrom) : 0;
            const to = priceTo ? parseFloat(priceTo) : Infinity;
            products = products.filter(product => product.price >= from && product.price <= to);
        }

        if (sort) {
            if (sort === 'A-Z') {
                products.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sort === 'Z-A') {
                products.sort((a, b) => b.name.localeCompare(a.name));
            } else if (sort === 'price-low-high') {
                products.sort((a, b) => a.price - b.price);
            } else if (sort === 'price-high-low') {
                products.sort((a, b) => b.price - a.price);
            }
        }

        const brandsList = await Brand.find({ isBlocked: false }).select('brandName');
        const categoriesList = await Category.find({ isListed: true }).select('name');

        res.render('user/shop', {
            products,
            brands: brandsList,
            categories: categoriesList,
            user: req.session.user || null,
            currentFilters,
        });
    } catch (error) {
        console.error('Error in loadShopPage:', error);
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
    resendOtp,
    loadShopPage
};