// controller/user/walletController.js
const User = require('../../models/userSchema');
const Wallet = require('../../models/wallwtSchema');



const loadWalletPage = async (req, res) => {
        try {
            const user = await User.findById(req.user._id).lean();
            let wallet = await Wallet.findOne({ user: req.user._id }).lean();

            if (!wallet) {
                wallet = new Wallet({
                    user: req.user._id,
                    balance: 0,
                    cardLastFour: '1234',
                    transactions: []
                });
                await wallet.save();
                user.wallet = [wallet._id];
                await User.findByIdAndUpdate(req.user._id, { wallet: [wallet._id] });
            }

            user.wallet = wallet;

            res.render('user/luxeWallet', { user });
        } catch (err) {
            console.error('Error loading wallet page:', err);
            res.status(500).render('pageNotFound', { message: 'Server Error' });
        }

};

module.exports = {
    loadWalletPage
}