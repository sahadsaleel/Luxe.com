const User = require('../../models/userSchema');

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
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.countDocuments(query);

        // Check if the request expects JSON (for AJAX)
        if (req.headers.accept.includes('application/json')) {
            return res.json({ data: userData });
        }

        res.render('admin/customers', {
            data: userData,
            currentPage: page,
            totalPages: Math.ceil(count / limit)
        });

    } catch (error) {
        
        // console.log(error);
        res.redirect('/admin/pageerror');
    }
};

const customerBlocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.redirect('/admin/customers');
    } catch (error) {
        res.redirect('/admin/pageerror');
    }
};

const customerUnblocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.redirect('/admin/customers');
    } catch (error) {
        res.redirect('/admin/pageerror');
    }
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked
};