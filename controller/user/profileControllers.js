const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session'); 


function generateOtp() {
    const digits = '1234567890';
    let otp = '';
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

const sendVerificationEmail = async (email, otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Your OTP for password reset',
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP: ${otp}</h4></b>`
        };

        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

const getForgotPassword = async (req, res) => {
    try {
        res.render('user/forgot-password');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email: email });
        if (findUser) {
            const otp = generateOtp();
            console.log('Generated OTP:', otp);
            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                res.json({ success: true, message: 'OTP sent to your email' });
            } else {
                res.json({
                    success: false,
                    message: 'Failed to send OTP. Please try again'
                });
            }
        } else {
            res.json({
                success: false,
                message: 'User with this email does not exist' 
            });
        }
    } catch (error) {
        console.error('Error in forgotEmailValid:', error);
        res.json({
            success: false,
            message: 'An error occurred. Please try again later'
        });
    }
};


const verifyOtp = async (req, res) => {
    try {
        // console.log('Request body:', req.body);
        if (!req.body || !req.body.otp) {
            return res.status(400).json({
                success: false,
                message: 'OTP is missing in request body'
            });
        }
        const { otp } = req.body;
        console.log('Received OTP:', otp);
        if (!req.session) {
            console.log('Session is undefined');
            return res.status(400).json({
                success: false,
                message: 'Session is undefined. Please start over.'
            });
        }
        if (typeof req.session.userOtp === 'undefined') {
            return res.status(400).json({
                success: false,
                message: 'Session data is missing. Please start over.'
            });
        }
        if (otp === req.session.userOtp) {
            res.json({ success: true, message: 'OTP verified successfully' });
        } else {
            res.json({ success: false, message: 'Invalid OTP' });
        }
    } catch (error) {
        console.error('Error in verifyOtp:', error.stack);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later'
        });
    }
};



const resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;
        if (newPassword !== confirmPassword) {
            return res.json({ success: false, message: 'Passwords do not match' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne(
            { email: req.session.email },
            { password: hashedPassword }
        );
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.json({ success: true, message: 'Password reset successfully' });
        });
    } catch (error) {
        console.error('Error in resetPassword:', error);
        res.json({
            success: false,
            message: 'An error occurred. Please try again later'
        });
    }
};


const resendOtp = async (req, res) => {
    try {
        const email = req.session.email;
        if (!email) {
            return res.json({
                success: false,
                message: 'Session expired. Please start over'
            });
        }
        const otp = generateOtp();
        console.log('Resend OTP:', otp);
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            req.session.userOtp = otp;
            res.json({ success: true, message: 'New OTP sent to your email' });
        } else {
            res.json({
                success: false,
                message: 'Failed to send OTP. Please try again'
            });
        }
    } catch (error) {
        console.error('Error in resendOtp:', error);
        res.json({
            success: false,
            message: 'An error occurred. Please try again later'
        });
    }
};

module.exports = {
    getForgotPassword,
    forgotEmailValid,
    verifyOtp,
    resetPassword,
    resendOtp
};