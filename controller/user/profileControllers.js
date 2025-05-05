const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const cloudinary = require('../../config/cloudinary');
const env = require('dotenv').config();
const session = require('express-session');

const OTP_EXPIRY_TIME = 6000;

function generateOtp() {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    return otp.padStart(6, '0'); 
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

const getResetPassword = async (req, res) => {
    try {
        if (!req.session.email || !req.session.userOtp) {
            return res.redirect('/forgot-password');
        }
        res.render('user/reset-password');
    } catch (error) {
        console.error('Error in getResetPassword:', error);
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
                req.session.userOtp = {
                    code: otp,
                    expiry: Date.now() + OTP_EXPIRY_TIME
                };
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
        if (!req.body || !req.body.otp) {
            return res.status(400).json({
                success: false,
                message: 'OTP is missing in request body'
            });
        }
        const { otp } = req.body;
        console.log('Received OTP:', otp);

        if (!req.session || !req.session.userOtp || !req.session.email) {
            return res.status(400).json({
                success: false,
                message: 'Session data is missing. Please start over.'
            });
        }

        if (Date.now() > req.session.userOtp.expiry) {
            req.session.userOtp = null;
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new OTP.'
            });
        }

        if (otp === req.session.userOtp.code) {
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

        if (!req.session.email) {
            return res.json({
                success: false,
                message: 'Session expired. Please start over.'
            });
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
        let email;
        // Determine the context based on session data
        if (req.session.userData && req.session.email) {
            // Signup context
            email = req.session.email;
        } else if (req.session.email) {
            // Forgot password context
            email = req.session.email;
        } else {
            return res.json({ success: false, message: 'No email session found. Please try again.' });
        }

        const oldOtp = req.session.userData ? req.session.userOtp : (req.session.userOtp ? req.session.userOtp.code : null);
        console.log('Old OTP:', oldOtp);

        // Generate a new OTP
        const otp = generateOtp();
        console.log('New OTP:', otp);

        // Ensure the new OTP is different from the old one
        if (otp === oldOtp) {
            // If the same, generate another OTP
            const newOtp = generateOtp();
            console.log('Generated a different OTP:', newOtp);
            otp = newOtp;
        }

        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.json({ success: false, message: 'Failed to send verification email.' });
        }

        // Update session with new OTP and expiry
        if (req.session.userData) {
            // For signup, align with the structure used in userController.signup
            req.session.userOtp = otp;
        } else if (req.session.email) {
            // For forgot password
            req.session.userOtp = {
                code: otp,
                expiry: Date.now() + OTP_EXPIRY_TIME
            };
        }

        res.json({ success: true, message: 'A new OTP has been sent to your email.' });
    } catch (error) {
        console.error('Error resending OTP:', error);
        res.json({ success: false, message: 'An error occurred while resending OTP.' });
    }
};


const userProfile = async (req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        res.render('user/userProfile', {
            user:userData
        })
    } catch (error) {
        console.error("Error for retrieve profile data" , error);
        res.redirect('/pageNotFound')
    }
}

const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const { firstName, lastName, phone, gender, croppedImage } = req.body;
        const updateData = { firstName, lastName, phone, gender };

        if (croppedImage) {
            const result = await cloudinary.uploader.upload(croppedImage, {
                folder: 'profile_images',
                resource_type: 'image'
            });
            updateData.profileImage = result.secure_url;
        }

        await User.findByIdAndUpdate(userId, updateData);
        res.redirect('/profile');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/pageNotFound');
    }
};

const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;

        // Validate inputs
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New passwords do not match' });
        }

        // Find user by session user ID
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            return res.status(403).json({ error: 'Account is blocked. Please contact support.' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Validate new password
        if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
            return res.status(400).json({
                error: 'New password must be at least 8 characters and contain both letters and numbers',
            });
        }

        // Prevent password reuse
        if (await bcrypt.compare(newPassword, user.password)) {
            return res.status(400).json({ error: 'New password cannot be the same as the old password' });
        }

        // Update password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        await user.save();

        return res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ error: 'An error occurred. Please try again.' });
    }
};


const userAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        const addressData = await Address.findOne({ userId: userId });
        const addresses = addressData ? addressData.address : []; 

        res.render('user/userAddress', {
            user: userData,
            address: addresses 
        });
    } catch (error) {
        console.error("Error retrieving profile or address data:", error);
        res.redirect('/pageNotFound');
    }
};

const getAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const userId = req.session.user;
        const addressData = await Address.findOne({ userId, 'address._id': addressId }, { 'address.$': 1 });
        if (!addressData || !addressData.address[0]) {
            return res.status(404).json({ message: 'Address not found' });
        }
        res.json(addressData.address[0]);
    } catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const addAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressType, name, addressLine1, addressLine2, city, state, zipCode, country, phone, altPhone, isDefault } = req.body;
        
        if (!addressType || !name || !addressLine1 || !city || !state || !zipCode || !country || !phone) {
            return res.status(400).json({ message: 'All required fields must be provided' });
        }

        let addressData = await Address.findOne({ userId });
        const newAddress = {
            addressType,
            name,
            addressLine1,
            addressLine2: addressLine2 || '',
            city,
            state,
            zipCode,
            country,
            phone,
            altPhone: altPhone || '',
            isDefault: isDefault === 'on' || isDefault === true,
        };

        if (!addressData) {
            addressData = new Address({ userId, address: [newAddress] });
        } else {
            if (newAddress.isDefault) {
                addressData.address.forEach(addr => (addr.isDefault = false));
            }
            addressData.address.push(newAddress);
        }

        await addressData.save();
        res.json({ message: 'Address added successfully' });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const editAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;
        const { addressType, name, addressLine1, addressLine2, city, state, zipCode, country, phone, altPhone, isDefault } = req.body;

        const addressData = await Address.findOne({ userId, 'address._id': addressId });
        if (!addressData) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const updateData = {
            addressType,
            name,
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
            country,
            phone,
            altPhone,
            isDefault: isDefault === 'on' || isDefault === true,
        };

        if (updateData.isDefault){
            addressData.address.forEach(addr => (addr.isDefault = false));
        }

        await Address.updateOne(
            { userId, 'address._id': addressId },
            { $set: { 'address.$': updateData } }
        );

        res.json({ message: 'Address updated successfully' });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        const addressData = await Address.findOne({ userId });
        if (!addressData) {
            return res.status(404).json({ message: 'Address not found' });
        }

        addressData.address.forEach(addr => {
            addr.isDefault = addr._id.toString() === addressId;
        });

        await addressData.save();
        res.json({ message: 'Default address set successfully' });
    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        const addressData = await Address.findOne({ userId });
        if (!addressData) {
            return res.status(404).json({ message: 'Address not found' });
        }

        addressData.address = addressData.address.filter(addr => addr._id.toString() !== addressId);
        await addressData.save();

        res.json({ message: 'Address deleted successfully' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getForgotPassword,
    getResetPassword,
    forgotEmailValid,
    verifyOtp,
    resetPassword,
    resendOtp,
    userProfile,
    updateProfile,
    changePassword,
    userAddress,
    getAddress,
    addAddress,
    editAddress,
    setDefaultAddress,
    deleteAddress,
};