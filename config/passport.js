const passport = require('passport');
const googleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();


const generateReferralCode = async (firstName) => {
    try {
        const baseCode = `${firstName.substring(0, 3).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        const existingUser = await User.findOne({ referalCode: baseCode });
        if (existingUser) {
            return generateReferralCode(firstName);
        }
        
        return baseCode;
    } catch (error) {
        console.error('Error generating referral code:', error);
        throw error;
    }
};

passport.use(new googleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://www.luxe-com.shop/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            if(user.isBlocked){
                return done(null,false , {message : "User is blocked"})
            }
            return done(null, user);
        } else {
            const [firstName, ...lastNameParts] = profile.displayName.split(' ');
            const lastName = lastNameParts.join(' ') || ''; 

            const referralCode = await generateReferralCode(firstName);

            user = new User({
                firstName,
                lastName,
                email: profile.emails && profile.emails[0] ? profile.emails[0].value : undefined,
                googleId: profile.id,
                referalCode: referralCode,
                redeemed: false
            });
            await user.save();
            return done(null, user);
        }
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;