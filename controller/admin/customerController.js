const User = require('../../models/userSchema');
const cloudinary = require('../../config/cloudinary');
const { uploadSingleImage } = require('../../helpers/multer'); 



const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        const limit = 5;

        const query = {
            isAdmin: false,
            $or: [
                { firstName: { $regex: ".*" + search + ".*", $options: 'i' } },
                { email: { $regex: ".*" + search + ".*", $options: 'i' } }
            ],
        };

        const userData = await User.find(query)
            .select('firstName email phone profileImage isBlocked _id') 
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.countDocuments(query);

        if (req.headers.accept.includes('application/json')) {
            return res.json({
                data: userData,
                totalPages: Math.ceil(count / limit),
                currentPage: page
            });
        }

        res.render('admin/customers', {
            data: userData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            search: search
        });
    } catch (error) {
        console.error('Error in customerInfo:', error);
        res.redirect('/admin/pageerror');
    }
};

const customerBlocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.redirect('/admin/customers');
    } catch (error) {
        console.error('Error in customerBlocked:', error);
        res.redirect('/admin/pageerror');
    }
};

const customerUnblocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.redirect('/admin/customers');
    } catch (error) {
        console.error('Error in customerUnblocked:', error);
        res.redirect('/admin/pageerror');
    }
};

const uploadProfileImage = async (req, res) => {
    try {
        const userId = req.query.id || req.user._id;
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const result = await cloudinary.uploader.upload(req.file.path);
        await User.updateOne(
            { _id: userId },
            { $set: { profileImage: result.secure_url } }
        );

        res.redirect('/admin/customers'); 
    } catch (error) {
        console.error('Error in uploadProfileImage:', error);
        res.redirect('/admin/pageerror');
    }
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked,
    uploadProfileImage 
};