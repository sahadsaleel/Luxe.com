const { sendOtpToEmail, generateOtp } = require('../../helpers/otpHelper');
const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');
const Wallet = require('../../models/walletSchema');

const verifySignupOtp = async (req, res) => {
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

const resendSignupOtp = async (req, res) => {
    try {
        const userData = req.session.userData;
        if (!userData || !userData.email) {
            return res.status(400).json({
                success: false,
                message: 'Session expired. Please try signing up again.'
            });
        }

        const otp = generateOtp();
        const emailSent = await sendOtpToEmail(userData.email, otp);

        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again.'
            });
        }

        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 60 * 1000;
        console.log('New OTP:', otp);

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

const verifyForgotPasswordOtp = async (req, res) => {
    try {
        const { otp, email } = req.body;
        const resetData = req.session.resetPasswordData;

        if (!otp || !email) {
            return res.status(400).json({
                success: false,
                message: 'OTP and email are required'
            });
        }

        if (!resetData || !resetData.otp || !resetData.timestamp || !resetData.email) {
            return res.status(400).json({
                success: false,
                message: 'Session expired. Please request a new OTP'
            });
        }

        if (email !== resetData.email) {
            return res.status(400).json({
                success: false,
                message: 'Email mismatch. Please request a new OTP'
            });
        }

        if (Date.now() > resetData.timestamp + 60000) { 
            delete req.session.resetPasswordData;
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new OTP'
            });
        }

        if (otp !== resetData.otp) {
            resetData.attempts = (resetData.attempts || 0) + 1;
            
            if (resetData.attempts >= 3) {
                delete req.session.resetPasswordData;
                return res.status(400).json({
                    success: false,
                    message: 'Too many failed attempts. Please request a new OTP'
                });
            }

            return res.status(400).json({
                success: false,
                message: 'Invalid OTP. Please try again'
            });
        }

        req.session.otpVerified = true;
        req.session.resetEmail = email;
        delete req.session.resetPasswordData;

        return res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });
    } catch (error) {
        console.error('Error in verifyForgotPasswordOtp:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while verifying OTP'
        });
    }
};

const resendForgotPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found with this email'
            });
        }
        const resetData = req.session.resetPasswordData;
        if (resetData && resetData.timestamp) {
            const timeSinceLastOtp = Date.now() - resetData.timestamp;
            if (timeSinceLastOtp < 30000) { 
                const waitTime = Math.ceil((30000 - timeSinceLastOtp) / 1000);
                return res.status(400).json({
                    success: false,
                    message: `Please wait ${waitTime} seconds before requesting a new OTP`
                });
            }
        }

        const otp = generateOtp();
        const emailSent = await sendOtpToEmail(email, otp);

        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Please try again'
            });
        }

        req.session.resetPasswordData = {
            email,
            otp,
            timestamp: Date.now(),
            attempts: 0
        };

        console.log('New reset password OTP:', otp);

        return res.status(200).json({
            success: true,
            message: 'New OTP sent successfully'
        });
    } catch (error) {
        console.error('Error in resendForgotPasswordOtp:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while resending OTP'
        });
    }
};

module.exports = {
    verifySignupOtp,
    resendSignupOtp,
    verifyForgotPasswordOtp,
    resendForgotPasswordOtp
}; 