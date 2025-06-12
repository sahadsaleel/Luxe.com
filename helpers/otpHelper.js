const nodemailer = require('nodemailer');
const crypto = require('crypto');


const requiredEnvVars = ['NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
});

const generateOtp = () => {
    const buffer = crypto.randomBytes(3);
    const number = buffer.readUIntBE(0, 3);
    return String(number % 1000000).padStart(6, '0');
};

const getEmailTemplate = (otp) => {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                .container {
                    font-family: Arial, sans-serif;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .otp-box {
                    background-color: #f8f9fa;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                    text-align: center;
                    font-size: 24px;
                    letter-spacing: 2px;
                }
                .warning {
                    color: #dc3545;
                    font-size: 14px;
                    margin-top: 15px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Password Reset OTP</h2>
                <p>Your One-Time Password (OTP) for password reset is:</p>
                <div class="otp-box">
                    <strong>${otp}</strong>
                </div>
                <p>This OTP is valid for 1 minute only.</p>
                <p class="warning">
                    For security reasons, please do not share this OTP with anyone.
                    MyLuxe.com will never ask for your OTP through phone or email.
                </p>
            </div>
        </body>
        </html>
    `;
};

const sendOtpToEmail = async (email, otp) => {
    try {
        if (!email || !otp) {
            throw new Error('Email and OTP are required');
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Invalid email format');
        }

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
            from: {
                name: 'MyLuxe.com',
                address: process.env.NODEMAILER_EMAIL
            },
            to: email,
            subject: 'Your OTP for Password Reset - MyLuxe.com',
            text: `Your OTP is ${otp}. It is valid for 1 minute. For security reasons, please do not share this OTP with anyone.`,
            html: getEmailTemplate(otp)
        };

        let retries = 3;
        while (retries > 0) {
            try {
                await transporter.sendMail(mailOptions);
                console.log(`OTP sent successfully to ${email}`);
                return true;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (error) {
        console.error(`Failed to send OTP to ${email}:`, error.message);
        return false;
    }
};

module.exports = {
    sendOtpToEmail,
    generateOtp
};