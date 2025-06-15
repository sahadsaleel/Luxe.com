const User = require('../../models/userSchema');
const cloudinary = require('../../config/cloudinary');
const Wallet = require('../../models/walletSchema'); 
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
            .lean(); 
            
        const usersWithWallet = await Promise.all(userData.map(async (user) => {
            const wallet = await Wallet.findOne({ userId: user._id }).lean();
            return { ...user, wallet };
        }));

        const count = await User.countDocuments(query);
        const totalPages = Math.ceil(count / limit);

        if (req.headers.accept.includes('application/json')) {
            return res.json({
                data: usersWithWallet,
                totalPages: totalPages,
                currentPage: page
            });
        }

        res.render('admin/customers', {
            data: usersWithWallet,
            currentPage: page,
            totalPages: totalPages,
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


const getWallet = async (req, res) => {
    try {
        const userId = req.params.userId;

        const wallet = await Wallet.findOne({ userId: userId });

        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found for this user' });
        }

        res.json(wallet);
    } catch (err) {
        console.error('Error fetching wallet:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}


module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked,
    uploadProfileImage,
    getWallet
};