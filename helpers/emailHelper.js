const nodemailer = require('nodemailer');
require('dotenv').config();

const requiredEnvVars = ['NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`Environment variable ${varName} is missing`);
    }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
    },
    pool: true, 
    maxConnections: 5,
    maxMessages: 100
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const retry = async (fn, maxAttempts = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; 
        }
    }
};

async function sendVerificationEmail(email, otp) {
    try {
        if (!email || !emailRegex.test(email)) {
            throw new Error('Invalid email address');
        }

        if (!otp || !/^\d{6}$/.test(otp.toString())) {
            throw new Error('Invalid OTP format');
        }

        const mailOptions = {
            from: `"Luxe.com" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: 'Verify Your Luxe.com Account',
            text: `Your OTP for account verification is ${otp}. This code expires in 10 minutes.`,
            html: `
                <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FFFFFF; border: 1px solid #C4B7A6; border-radius: 10px;">
                    <h2 style="color: #046A38; text-align: center;">Welcome to Luxe.com</h2>
                    <p style="color: #2E2E2E; line-height: 1.6;">Thank you for joining our community. To verify your account, please use the following OTP:</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <span style="font-size: 24px; font-weight: bold; color: #046A38; letter-spacing: 5px;">${otp}</span>
                    </div>
                    <p style="color: #2E2E2E; line-height: 1.6;">This code is valid for 10 minutes. If you didn't request this, please ignore this email.</p>
                    <p style="color: #B3A580; text-align: center; margin-top: 20px;">Discover Your Signature Scent with Luxe.com</p>
                </div>
            `
        };

        const sendEmail = () => transporter.sendMail(mailOptions);
        const info = await retry(sendEmail);

        console.log(`Verification email sent to ${email}: ${info.messageId}`);
        return info.accepted.includes(email);
    } catch (error) {
        console.error(`Error sending verification email to ${email}:`, error.message);
        return false;
    }
}

async function sendContactFormEmail({ firstName, lastName, email, phone, inquiry, message }) {
    try {
        if (!firstName || !lastName || !email || !inquiry || !message) throw new Error('Missing fields');
        if (!emailRegex.test(email)) throw new Error('Invalid email');

        const mailOptions = {
            from: `Luxe.com <${process.env.NODEMAILER_EMAIL}>`,
            to: process.env.ADMIN_EMAIL || process.env.NODEMAILER_EMAIL,
            replyTo: email,
            subject: `New Contact Inquiry: ${inquiry}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
                <p><strong>Inquiry Type:</strong> ${inquiry}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `
        };

        const info = await retry(() => transporter.sendMail(mailOptions));
        console.log(`✅ Admin mail sent to ${mailOptions.to}: ${info.messageId}`);
        return info.accepted.includes(mailOptions.to);
    } catch (error) {
        console.error('❌ sendContactFormEmail Error:', error.message);
        return false;
    }
}


async function sendAutoReplyToUser(email, firstName) {
    try {
        if (!email || !emailRegex.test(email)) {
            throw new Error('Invalid user email for auto-reply.');
        }

        const mailOptions = {
            from: `"Luxe.com" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: 'Thank You for Contacting Luxe.com',
            html: `
                <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FFFFFF; border: 1px solid #C4B7A6; border-radius: 10px;">
                    <h2 style="color: #046A38;">Hi ${firstName},</h2>
                    <p style="color: #2E2E2E;">Thank you for reaching out to Luxe.com. We’ve received your inquiry and our fragrance specialists will respond within 24 hours.</p>
                    <p style="color: #2E2E2E;">We’re excited to help you find your perfect scent.</p>
                    <br>
                    <p style="color: #B3A580;">With elegance,<br>The Luxe.com Team</p>
                </div>
            `
        };

        const info = await retry(() => transporter.sendMail(mailOptions));
        console.log(`✅ Auto-reply sent to ${email}: ${info.messageId}`);
        return info.accepted.includes(email);
    } catch (error) {
        console.error(`❌ Auto-reply failed for ${email}:`, error.message);
        return false;
    }
}


module.exports = {
    sendVerificationEmail,
    sendContactFormEmail,
    sendAutoReplyToUser
};