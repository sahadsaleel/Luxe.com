const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Please login to continue' 
                });
            }
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.user);
        
        if (!user) {
            req.session.destroy();
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }
            return res.redirect('/login');
        }

        if (user.isBlocked) {
            req.session.destroy();
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Your account has been blocked. Please contact support.' 
                });
            }
            return res.redirect('/login?blocked=true');
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('User auth middleware error:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ 
                success: false, 
                message: 'Internal server error' 
            });
        }
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const adminAuth = async (req, res, next) => {
    try {
        if (!req.session || !req.session.adminId) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Please login as admin' 
                });
            }
            return res.redirect('/admin/login');
        }

        const admin = await User.findById(req.session.adminId);
        
        if (!admin) {
            req.session.destroy();
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Admin not found' 
                });
            }
            return res.redirect('/admin/login');
        }

        if (!admin.isAdmin) {
            req.session.destroy();
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Unauthorized: Admin access required' 
                });
            }
            return res.redirect('/admin/login?unauthorized=true');
        }

        if (admin.isBlocked) {
            req.session.destroy();
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Your account has been blocked' 
                });
            }
            return res.redirect('/admin/login?blocked=true');
        }

        // Set both admin flags in session
        req.session.admin = true;
        req.session.isAdmin = true;
        req.user = admin;
        next();
    } catch (error) {
        console.error('Admin auth middleware error:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ 
                success: false, 
                message: 'Internal server error' 
            });
        }
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

module.exports = {
    userAuth,
    adminAuth
};