const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')



const pageerror = async (req,res)=>{
    res.render('admin/admin-error')
}


const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/dashboard');
    }
    res.render('admin/login', { message: null });
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await User.findOne({ email, isAdmin: true });
        
        if (!admin) {
            return res.status(400).json({
                success: false,
                message: "No user found with this email Id"
            });
        } 

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });   
        }

        req.session.adminId = admin._id;
        req.session.admin = true; 
        res.setHeader('Cache-Control', 'no-store');

        return res.status(200).json({
            success: true,
            message: "Login successful",
            redirectUrl: "/admin/dashboard"
        });

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
          success: false,
          message: "An error occurred during login"
        });
    }
}

const loadDashboard = async (req,res)=>{
    if(req.session.admin){
        try {
            res.render('admin/dashboard')
        } catch (error) {
            res.redirect('/admin/pageerror')
        }
    }
}


const logout = async (req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                // console.log("Error destroying sesstion",err);
                return res,redirect('/pageerror')
            }
            res.redirect('/admin/login')
        })
    } catch (error) {
        // console.log("Unexpected error during logout",error);
        res.redirect('/admin/pageerror')
        
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
}