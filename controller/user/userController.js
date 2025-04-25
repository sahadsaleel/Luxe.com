const User = require('../../models/userSchema');
require('dotenv').config();
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
        const userData = await User.findById(userId)    
        res.render('user/home', { user: userData });
            
    }catch(error) {
        console.log('Home page error:', error);
        res.status(500).send('Server error');
    }
};

// const loadShopPage = async (req.res)=>{

// }



const loadSignup = async (req, res) => {
    try {
        res.render('user/signup');
    } catch (error) {
        console.log('Signup page not loading', error);
        res.status(500).send('Server error');
    }
};


const loadLogin = (req, res) => {
    try {
        res.render('user/login', { message: '' }); 
    } catch (error) {
        console.log('loadLogin error', error);
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
                message: 'OTP verified successfully. Redirecting to login.',
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
        console.log("login error", error);
        res.render("user/login", { message: "login failed, please try again" }); 
    }
};

const logout = async (req,res)=>{
    try {
        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error", err.message);
                return res.render('/pageNotFound')
            }
            return res.render('user/home')
        })
    } catch (error) {
        
        console.log("Logout error",error);
        res.redirect('/pageNotFound')
    }
}
module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadLogin,
    signup,
    login,
    logout,
    verifyOtp,
};