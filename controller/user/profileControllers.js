const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const bcrypt = require('bcrypt');
const cloudinary = require('../../config/cloudinary');
const { sendOtpToEmail, generateOtp } = require('../../helpers/otpHelper');
require('dotenv').config();
const session = require('express-session');



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
        console.log(`Processing forgot password request for email: ${email}`);

        const user = await User.findOne({ email });
        if (!user) {
            console.log(`User not found for email: ${email}`);
            return res.json({ success: false, message: 'User not found.' });
        }

        if (req.session.otp && req.session.otpTimestamp) {
            const timeSinceLastOtp = Date.now() - req.session.otpTimestamp;
            if (timeSinceLastOtp < 30 * 1000) { 
                console.log(`Cooldown active for email: ${email}. Time since last OTP: ${timeSinceLastOtp}ms`);
                return res.json({ success: false, message: 'Please wait 30 seconds before requesting a new OTP.' });
            }
        }

        const generatedOtp = generateOtp();
        const emailSent = await sendOtpToEmail(email, generatedOtp);

        if (!emailSent) {
            console.log(`Failed to send OTP to email: ${email}`);
            return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
        }

        req.session.resetEmail = email;
        req.session.otp = generatedOtp;
        req.session.otpTimestamp = Date.now();

        console.log('Generated OTP:', generatedOtp);
        console.log('Stored OTP session:', req.session.otp);

        return res.json({ success: true, message: 'OTP sent to email.' });
    } catch (err) {
        console.error('Error in forgotEmailValid:', err.message, err.stack);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};


const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log('Received OTP :', otp);

        if (!req.session.otp || !req.session.otpTimestamp) {
            console.log('====OTP session expired or not found====');
            return res.json({ success: false, message: 'OTP session expired. Please request a new OTP.' });
        }

        const currentTime = Date.now();
        const otpAge = currentTime - req.session.otpTimestamp;
        if (otpAge > 60 * 1000) {
            console.log('===OTP has expired====');
            req.session.otp = null;
            req.session.otpTimestamp = null;
            return res.json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
        }

        if (!otp || !/^\d{6}$/.test(otp)) {
            console.log('Invalid OTP format:', otp);
            return res.json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
        }

        if (otp.toString() === req.session.otp.toString()){
            console.log('OTP verification successful.');
            req.session.otpVerified = true;
            req.session.otp = null;
            req.session.otpTimestamp = null;
            return res.json({ success: true, message: 'OTP verified successfully.' });
        } else {
            console.log('Invalid OTP entered');
            return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
        }
    } catch (err) {
        console.error('Error in verifyOtp:', err.message, err.stack);
        return res.status(500).json({ success: false, message: 'Server error while verifying OTP.' });
    }
};



const resendOtp = async (req, res) => {
    try {

        let email = req.session?.resetEmail || req.session?.userData?.email;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Session expired or email not found. Please start the process again.' });
        }

        const newOtp = generateOtp();
        const emailSent = await sendOtpToEmail(email, newOtp);

        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
        }

        req.session.otp = newOtp;
        req.session.otpTimestamp = Date.now(); 

        return res.json({ success: true, message: 'New OTP sent to email.' });
    } catch (err) {
        console.error('Error in resendOtp:', err.message, err.stack);
        return res.status(500).json({ success: false, message: 'Server error while resending OTP.' });
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
        const { newPassword } = req.body;
        const email = req.session.resetEmail;

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

const userAddress = async (req, res) =>{
    try {
        const userId = req.session.user;
        if (!userId){
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
    changeEmail,
    userAddress,
    getAddress,
    addAddress,
    editAddress,
    setDefaultAddress,
    deleteAddress
};