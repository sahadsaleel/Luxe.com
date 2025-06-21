
const path = require('path');
const fs = require('fs/promises');
const { sendContactFormEmail , sendAutoReplyToUser  } = require('../../helpers/emailHelper');


const loadAbout = async (req, res) => {
    try {
        res.status(200).render('user/about');
    } catch (error) {
        console.error('Error loading About page:', error);
        res.status(500).redirect('/pageNotFound');
    }
};

const loadContactUs = async (req, res) => {
    try {
        res.status(200).render('user/contactUs', {
            csrfToken: req.csrfToken ? req.csrfToken() : null,
            user: req.user || null,
            pageTitle: 'Contact Us - Luxe.com',
            currentRoute: req.path
        });
    } catch (error) {
        console.error('Error loading Contact Us page:', {
            message: error.message,
            stack: error.stack,
            url: req.originalUrl
        });

        res.status(500).render('error', {
            status: 500,
            message: 'Unable to load the Contact Us page. Please try again later.',
            redirect: '/',
            user: req.user || null,
            pageTitle: 'Error - Luxe.com'
        });
    }
};


// const submitContactForm = async (req, res) => {
//     try {
//         const { firstName, lastName, email, phone, inquiry, message } = req.body;

//         if (!firstName || !lastName || !email || !inquiry || !message) {
//             return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
//         }

//         const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
//         const isValidPhone = !phone || /^\+?[\d\s-]{10,}$/.test(phone);

//         if (!isValidEmail) {
//             return res.status(400).json({ success: false, message: 'Invalid email format.' });
//         }

//         if (!isValidPhone) {
//             return res.status(400).json({ success: false, message: 'Invalid phone number.' });
//         }

//         const emailSent = await sendContactFormEmail({ firstName, lastName, email, phone, inquiry, message });

//         if (!emailSent) throw new Error('Email sending failed');

//         return res.json({ success: true, message: 'Message sent successfully!' });

//     } catch (err) {
//         console.error('Error submitting contact form:', err);
//         return res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' });
//     }
// };

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
    // submitContactForm,
    handleContactForm
};