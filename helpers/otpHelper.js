const nodemailer = require('nodemailer');


const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOtpToEmail = async (email, otp) => {
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
            subject: 'Your OTP for Password Reset - MyLuxe.com',
            text: `Your OTP is ${otp}. It is valid for 1 minute.`,
            html: `<b><h4>Your OTP: ${otp}</h4><p>It is valid for 1 minute.</p></b>`
        };

        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}: ${otp}`);
        return true;
    } catch (error) {
        console.error(`Failed to send OTP to ${email}:`, error.message, error.stack);
        return false;
    }
};


module.exports = {
    sendOtpToEmail,
    generateOtp
}