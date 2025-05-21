const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    req.user = data;
                    next();
                } else {
                    res.redirect('/login');
                }
            })
            .catch(error => {
                console.log("Error in user auth middleware", error);
                res.status(500).send("Internal server error");
            });
    } else {
        res.redirect('/login');
    }
};

const adminAuth = (req, res, next) => {
    if (req.session.adminId) {
        User.findById(req.session.adminId)
            .then(data => {
                if (data && data.isAdmin && !data.isBlocked) {
                    req.user = data;
                    next();
                } else {
                    if (req.xhr || req.headers.accept.includes('json')) {
                        return res.status(403).json({ message: 'Unauthorized: Admin access required' });
                    }
                    res.redirect('/admin/login');
                }
            })
            .catch(error => {
                console.log("Error in admin auth middleware", error);
                if (req.xhr || req.headers.accept.includes('json')) {
                    return res.status(500).json({ message: 'Internal server error' });
                }
                res.status(500).send('Internal server error');
            });
    } else {
        if (req.xhr || req.headers.accept.includes('json')) {
            return res.status(401).json({ message: 'Please log in as admin' });
        }
        res.redirect('/admin/login');
    }
};

module.exports = {
    userAuth,
    adminAuth
};