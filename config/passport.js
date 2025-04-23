
// const passport = require('passport');
// const googleSrategy = require('passport-google-oauth20').Strategy; 
// const user = require('../models/userSchema');
// const env = require('dotenv').config();

// passport.use(new googleSrategy({
//     clientID: process.env.GOOGLE_CLIENT_ID,
//     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     callbackURL: '/auth/google/callback'
// }, async (accessToken, refreshToken, profile, done) => {
//     try {
//         let user = await user.findOne({ googleId: profile.id });
//         if (user) {
//             return done(null, user);
//         } else {
//             user = new user({
//                 name: profile.displayName,
//                 email: profile.emails[0].value,
//                 googleId: profile.id,
//             });
//             await user.save();
//             return done(null, user);
//         }
//     } catch (error) {
//         return done(error, null); 
//     }
// }));

// passport.serializeUser((user, done) => {
//     done(null, user.id);
// });

// passport.deserializeUser(async (id, done) => {
//     try {
//         const user = await user.findById(id);
//         done(null, user);
//     } catch (error) {
//         done(error, null);
//     }
// });

// module.exports = passport;




const passport = require('passport');
const googleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

passport.use(new googleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            return done(null, user);
        } else {
            // Split displayName into firstName and lastName
            const [firstName, ...lastNameParts] = profile.displayName.split(' ');
            const lastName = lastNameParts.join(' ') || ''; 

            user = new User({
                firstName,
                lastName,
                email: profile.emails && profile.emails[0] ? profile.emails[0].value : undefined,
                googleId: profile.id
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