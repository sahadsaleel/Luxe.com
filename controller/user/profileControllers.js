const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const cloudinary = require('../../config/cloudinary');
require('dotenv').config();
const session = require('express-session');

const OTP_EXPIRY_TIME = 60 * 1000; // 60 seconds

// Validate environment variables
if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
    console.error('Missing email configuration in environment variables');
    process.exit(1);
}

// Utility function for OTP generation and email sending
const sendOtpEmail = async (email, otp) => {
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

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

function generateOtp() {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    return otp.padStart(6, '0');
}

const getForgotPassword = async (req, res) => {
    try {
        res.render('user/forgot-password');
    } catch (error) {
        console.error('Error rendering forgot password page:', error);
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
        console.error('Error rendering reset password page:', error);
        res.redirect('/pageNotFound');
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email' });
        }

        const findUser = await User.findOne({ email });
        if (!findUser) {
            return res.status(404).json({ success: false, message: 'User with this email does not exist' });
        }

        const otp = generateOtp();
        console.log('Generated OTP:', otp);
        const emailSent = await sendOtpEmail(email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again' });
        }

        req.session.userOtp = { code: otp, expiry: Date.now() + OTP_EXPIRY_TIME };
        req.session.email = email;
        return res.status(200).json({ success: true, message: 'OTP sent to your email' });
    } catch (error) {
        console.error('Error in forgotEmailValid:', error);
        return res.status(500).json({ success: false, message: 'An error occurred. Please try again later' });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: 'Invalid OTP format' });
        }

        if (!req.session?.userOtp?.code || !req.session?.email) {
            return res.status(400).json({ success: false, message: 'Session data missing. Please start over.' });
        }

        if (Date.now() > req.session.userOtp.expiry) {
            req.session.userOtp = null;
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
        }

        if (otp === req.session.userOtp.code) {
            return res.status(200).json({ success: true, message: 'OTP verified successfully' });
        }
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
    } catch (error) {
        console.error('Error in verifyOtp:', error);
        return res.status(500).json({ success: false, message: 'An error occurred. Please try again later' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;
        if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match or are missing' });
        }

        if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters and contain both letters and numbers'
            });
        }

        if (!req.session.email) {
            return res.status(400).json({ success: false, message: 'Session expired. Please start over.' });
        }

        const user = await User.findOne({ email: req.session.email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: 'New password cannot be the same as the current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne({ email: req.session.email }, { password: hashedPassword });

        delete req.session.email;
        delete req.session.userOtp;

        return res.status(200).json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error in resetPassword:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'An error occurred. Please try again later' });
    }
};

const resendOtp = async (req, res) => {
    try {
        const email = req.session.email;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email not found in session' });
        }

        const otp = generateOtp();
        req.session.userOtp = { code: otp, expiry: Date.now() + OTP_EXPIRY_TIME };
        console.log('OTP:', otp);

        const emailSent = await sendOtpEmail(email, otp);
        console.log('Email sent:', emailSent);

        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again' });
        }

        console.log('Resend OTP:', otp);
        return res.status(200).json({ success: true, message: 'OTP resent successfully' });
    } catch (error) {
        console.error('Error resending OTP:', error);
        return res.status(500).json({ success: false, message: 'Internal server error. Please try again' });
    }
};

const userProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        res.render('user/userProfile', { user: userData });
    } catch (error) {
        console.error('Error retrieving profile data:', error);
        res.redirect('/pageNotFound');
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const { firstName, lastName, phone, gender, croppedImage } = req.body;

        if (!firstName || !lastName || !phone || !gender) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ message: 'Invalid phone number' });
        }

        const updateData = { firstName, lastName, phone, gender };

        if (croppedImage) {
            // Basic validation for image data (base64)
            if (!croppedImage.startsWith('data:image/') || croppedImage.length > 5 * 1024 * 1024) {
                return res.status(400).json({ message: 'Invalid or oversized image' });
            }

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

        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New passwords do not match' });
        }

        if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
            return res.status(400).json({
                error: 'New password must be at least 8 characters and contain both letters and numbers'
            });
        }

        const user = await User.findById(req.session.user);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ error: 'Account is blocked. Please contact support.' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        if (await bcrypt.compare(newPassword, user.password)) {
            return res.status(400).json({ error: 'New password cannot be the same as the old password' });
        }

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

        const addressData = await Address.findOne({ userId });
        const addresses = addressData ? addressData.address : [];

        res.render('user/userAddress', { user: userData, address: addresses });
    } catch (error) {
        console.error('Error retrieving address data:', error);
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
        res.status(200).json(addressData.address[0]);
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

        if (!/^\d{5,10}$/.test(zipCode) || !/^\d{10}$/.test(phone) || (altPhone && !/^\d{10}$/.test(altPhone))) {
            return res.status(400).json({ message: 'Invalid zip code or phone number' });
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
            isDefault: isDefault === 'on' || isDefault === true || isDefault === 'true'
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
        res.status(200).json({ message: 'Address added successfully' });
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

        if (!addressType || !name || !addressLine1 || !city || !state || !zipCode || !country || !phone) {
            return res.status(400).json({ message: 'All required fields must be provided' });
        }

        if (!/^\d{5,10}$/.test(zipCode) || !/^\d{10}$/.test(phone) || (altPhone && !/^\d{10}$/.test(altPhone))) {
            return res.status(400).json({ message: 'Invalid zip code or phone number' });
        }

        const addressData = await Address.findOne({ userId, 'address._id': addressId });
        if (!addressData) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const updateData = {
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
            isDefault: isDefault === 'on' || isDefault === true || isDefault === 'true'
        };

        if (updateData.isDefault) {
            addressData.address.forEach(addr => (addr.isDefault = false));
        }

        await Address.updateOne(
            { userId, 'address._id': addressId },
            { $set: { 'address.$': updateData } }
        );

        res.status(200).json({ message: 'Address updated successfully' });
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
        res.status(200).json({ message: 'Default address set successfully' });
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
        if (addressData.address.length === 0) {
            await Address.deleteOne({ userId });
        } else {
            await addressData.save();
        }

        res.status(200).json({ message: 'Address deleted successfully' });
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
    deleteAddress
};