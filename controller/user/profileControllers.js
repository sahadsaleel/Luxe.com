const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const bcrypt = require('bcrypt');
const cloudinary = require('../../config/cloudinary');
require('dotenv').config();
const session = require('express-session');
const { generateOtp } = require('../../helpers/otpHelper');
const { sendOtpToEmail } = require('../../helpers/otpHelper');



if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
    console.error('Missing email configuration in environment variables');
    process.exit(1);
}


const getForgotPassword = async (req, res) => {
    try {
        res.render('user/forgot-password');
    } catch (error) {
        console.error('Error rendering forgot password page:', error.message, error.stack);
        res.redirect('/pageNotFound');
    }
};


const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: 'User not found.' });
        }

        const otp = generateOtp();
        console.log('Generated OTP for forgot password:', otp);

        const emailSent = await sendOtpToEmail(email, otp);
        if (!emailSent) {
            return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
        }

        req.session.resetPasswordData = {
            email,
            otp,
            timestamp: Date.now(),
            attempts: 0
        };

        console.log('Forgot password OTP:', otp);

        return res.json({ success: true, message: 'OTP sent successfully.' });
    } catch (err) {
        console.error('Error in forgotEmailValid:', err.message, err.stack);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};


const getResetPassword = async (req, res) => {
    try {
        if (!req.session.resetEmail || !req.session.otpVerified) {
            return res.redirect('/forgot-password');
        }
        res.render('user/reset-password');
    } catch (error) {
        console.error('Error rendering reset password page:', error.message, error.stack);
        res.redirect('/pageNotFound');
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, email } = req.body;

        if (!email || !req.session.otpVerified) {
            return res.json({ success: false, message: 'Unauthorized request. Please verify OTP first.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne({ email }, { $set: { password: hashedPassword } });

        req.session.resetEmail = null;
        req.session.otpVerified = null;

        return res.json({ success: true, message: 'Password reset successful.' });
    } catch (err) {
        console.error('Error in resetPassword:', err.message, err.stack);
        return res.status(500).json({ success: false, message: 'Server error.' });
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
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const { firstName, lastName, phone,  croppedImage } = req.body;4
        
        if (!firstName || !lastName || !phone) {

            return res.status(400).json({ message: 'All fields are required' });
        }
        
        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ message: 'Invalid phone number' });
        }
        
        const updateData = { firstName, lastName, phone };
        if (croppedImage) {
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
        return res.status(200).json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({ message: 'An error occurred while updating the profile' });
    }
};

const removeProfileImage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.profileImage && user.profileImage !== '/img/profile images.png') {
            const publicId = user.profileImage
                .split('/')
                .slice(-2)
                .join('/')
                .split('.')[0];

            await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });

            user.profileImage = '/img/profile images.png';
            await user.save();

            return res.status(200).json({ message: 'Profile image removed successfully' });
        }

        return res.status(400).json({ message: 'No custom profile image to remove' });
    } catch (error) {
        console.error('Error removing profile image:', error);
        return res.status(500).json({ message: 'An error occurred while removing the profile image' });
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
        
        if (user.googleId) {
            return res.status(403).json({ error: 'Password cannot be changed for Google-linked accounts' });
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

const changeEmail = async (req, res) => {
    try {
        const { currentPassword, newEmail, confirmEmail } = req.body;
        
        if (!currentPassword || !newEmail || !confirmEmail) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        if (newEmail !== confirmEmail) {
            return res.status(400).json({ error: 'Email addresses do not match' });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }
        
        const user = await User.findById(req.session.user);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.isBlocked) {
            return res.status(403).json({ error: 'Account is blocked. Please contact support.' });
        }
        
        
        if (user.googleId) {
            return res.status(403).json({ error: 'Email cannot be changed for Google-linked accounts' });
        }
        
        
        const existingUser = await User.findOne({ email: newEmail });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
            return res.status(400).json({ error: 'This email is already associated with another account' });
        }
        
        
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        user.email = newEmail;
        await user.save();
        
        return res.status(200).json({ message: 'Email changed successfully' });
    } catch (error) {
        console.error('Change email error:', error);
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
        const { addressType, name, landMark, city, state, pincode, phone, altPhone, isDefault } = req.body;

        if (!addressType || !name || !landMark || !city || !state || !pincode || !phone) {
            return res.status(400).json({ message: 'All required fields must be provided' });
        }

        if (!/^\d{6}$/.test(pincode) || !/^\d{10}$/.test(phone) || (altPhone && !/^\d{10}$/.test(altPhone))) {
            return res.status(400).json({ message: 'Invalid pincode or phone number' });
        }

        let addressData = await Address.findOne({ userId });
        const newAddress = {
            addressType,
            name,
            landMark,
            city,
            state,
            pincode,
            phone,
            altPhone: altPhone || '',
            isDefault: isDefault === true || isDefault === 'true',
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
        const { addressType, name, landMark, city, state, pincode, phone, altPhone, isDefault } = req.body;

        if (!addressType || !name || !landMark || !city || !state || !pincode || !phone) {
            return res.status(400).json({ message: 'All required fields must be provided' });
        }

        if (!/^\d{6}$/.test(pincode) || !/^\d{10}$/.test(phone) || (altPhone && !/^\d{10}$/.test(altPhone))) {
            return res.status(400).json({ message: 'Invalid pincode or phone number' });
        }

        const addressData = await Address.findOne({ userId, 'address._id': addressId });
        if (!addressData) {
            return res.status(404).json({ message: 'Address not found' });
        }

        const updateData = {
            addressType,
            name,
            landMark,
            city,
            state,
            pincode,
            phone,
            altPhone: altPhone || '',
            isDefault: isDefault === true || isDefault === 'true',
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
    resetPassword,
    userProfile,
    updateProfile,
    removeProfileImage,
    changePassword,
    changeEmail,
    userAddress,
    getAddress, 
    addAddress,
    editAddress,
    setDefaultAddress,
    deleteAddress
};