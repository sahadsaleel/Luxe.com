
const path = require('path');
const fs = require('fs/promises');
const { sendContactFormEmail , sendAutoReplyToUser  } = require('../../helpers/emailHelper');
const User = require('../../models/userSchema');


const loadAbout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (userId) {
            const userData = await User.findById(userId);
            res.render('user/about', {
                user: userData,
                pageTitle: 'About Us - Luxe.com',
                currentRoute: req.path
            });
        } else {
            res.render('user/about', {
                user: null,
                pageTitle: 'About Us - Luxe.com',
                currentRoute: req.path
            });
        }
    } catch (error) {
        console.error('Error loading About page:', {
            message: error.message,
            stack: error.stack,
            url: req.originalUrl
        });
        res.status(500).send('Server error');
    }
};

const loadContactUs = async (req, res) => {
    try {
        const userId = req.session.user;
        if (userId) {
            const userData = await User.findById(userId);
            res.render('user/contactUs', {
                user: userData,
                csrfToken: req.csrfToken ? req.csrfToken() : null,
                pageTitle: 'Contact Us - Luxe.com',
                currentRoute: req.path
            });
        } else {
            res.render('user/contactUs', {
                user: null,
                csrfToken: req.csrfToken ? req.csrfToken() : null,
                pageTitle: 'Contact Us - Luxe.com',
                currentRoute: req.path
            });
        }
    } catch (error) {
        console.error('Error loading Contact Us page:', {
            message: error.message,
            stack: error.stack,
            url: req.originalUrl
        });
        res.status(500).send('Server error');
    }
};


const handleContactForm = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, inquiry, message } = req.body;

        const adminEmailSent = await sendContactFormEmail({ firstName, lastName, email, phone, inquiry, message });

        if (!adminEmailSent) {
            return res.status(500).json({ success: false, message: 'Failed to send message to admin.' });
        }

        const userAutoReplySent = await sendAutoReplyToUser(email, firstName);

        if (!userAutoReplySent) {
            return res.status(500).json({ success: false, message: 'Admin mail sent but failed to send auto-reply.' });
        }

        return res.status(200).json({ success: true, message: 'Message sent and auto-reply delivered.' });
    } catch (error) {
        console.error('Contact form submission error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

module.exports = { 
    loadAbout, 
    loadContactUs, 
    handleContactForm
};