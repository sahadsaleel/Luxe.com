const User = require('../../models/userSchema')
const bcrypt = require('bcrypt')
const Order = require('../../models/orderSchema')
const Coupon = require('../../models/couponSchema')
const Offer = require('../../models/offerSchema')
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Wallet = require('../../models/walletSchema');



const pageerror = async (req,res)=>{
    res.render('admin/admin-error')
}


const loadLogin = (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/dashboard');
        }
        res.status(200).render('admin/login', { message: null });
    } catch (error) {
        console.error('Error loading login page:', error);
        res.status(500).send('Internal Server Error');
    }
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
        req.session.isAdmin = true;
        
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



const logout = async (req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                return res,redirect('/pageerror')
            }
            res.redirect('/admin/login')
        })
    } catch (error) {
        res.redirect('/admin/pageerror')
        
    }
}

const loadDashboard = async (req, res) => {
    try {
        const currentFilter = req.query.filter || 'monthly';
        const filters = ['weekly', 'monthly', 'yearly'];
        if (!filters.includes(currentFilter)) throw new Error('Invalid filter');

        const salesData = {};

        function calculateGrowth(current, previous) {
            if (previous === 0) return current > 0 ? 100 : 0;
            return +(((current - previous) / previous) * 100).toFixed(2);
        }

        for (const filter of filters) {
            let matchStage = { status: 'Delivered' };
            let prevMatchStage = { status: 'Delivered' };

            const now = new Date();
            const end = new Date(); 
            const start = new Date();

            if (filter === 'weekly') start.setDate(now.getDate() - 7);
            else if (filter === 'monthly') start.setMonth(now.getMonth() - 1);
            else if (filter === 'yearly') start.setFullYear(now.getFullYear() - 1);

            matchStage.createdOn = { $gte: start, $lte: end };

            const diff = end.getTime() - start.getTime();
            const prevStart = new Date(start.getTime() - diff);
            const prevEnd = new Date(start);

            prevMatchStage.createdOn = { $gte: prevStart, $lt: prevEnd };

            const aggregation = await Order.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: filter === 'weekly' ? '%Y-%m-%d' : filter === 'monthly' ? '%Y-%m' : '%Y',
                                date: '$createdOn',
                            }
                        },
                        totalSales: { $sum: '$finalAmount' }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            let prevAggregation = [];
            if (filter === 'monthly') {
                prevAggregation = await Order.aggregate([
                    { $match: prevMatchStage },
                    {
                        $group: {
                            _id: {
                                $dateToString: {
                                    format: '%Y-%m',
                                    date: '$createdOn',
                                }
                            },
                            totalSales: { $sum: '$finalAmount' }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);
            }

            const labels = aggregation.map(item => item._id);
            const data = aggregation.map(item => item.totalSales);
            const prevData = prevAggregation.map(item => item.totalSales);

            const currentStats = await Order.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$finalAmount' },
                        orders: { $sum: 1 },
                        customers: { $addToSet: '$userId' },
                    }
                }
            ]);

            const prevStats = await Order.aggregate([
                { $match: prevMatchStage },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$finalAmount' }
                    }
                }
            ]);

            const revenue = currentStats[0]?.revenue || 0;
            const orders = currentStats[0]?.orders || 0;
            const customers = currentStats[0]?.customers?.length || 0;
            const prevRevenue = prevStats[0]?.revenue || 0;
            const growth = calculateGrowth(revenue, prevRevenue);

            salesData[filter] = {
                labels,
                data,
                prevData: filter === 'monthly' ? prevData : undefined,
                stats: { revenue, orders, customers, growth }
            };
        }

        const topProducts = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            { $unwind: '$orderedItems' },
            {
                $group: {
                    _id: '$orderedItems.productId',
                    sales: { $sum: '$orderedItems.quantity' },
                    revenue: { $sum: '$orderedItems.totalPrice' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $project: {
                    name: '$product.productName',
                    sales: 1,
                    revenue: 1
                }
            },
            { $sort: { sales: -1, revenue: -1 } },
            { $limit: 10 }
        ]);

        const topCategories = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            { $unwind: '$orderedItems' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItems.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.productCategory',
                    sales: { $sum: '$orderedItems.quantity' },
                    revenue: { $sum: '$orderedItems.totalPrice' }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            {
                $project: {
                    name: '$category.name',
                    sales: 1,
                    revenue: 1
                }
            },
            { $sort: { sales: -1, revenue: -1 } },
            { $limit: 10 }
        ]);

        const topBrands = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            { $unwind: '$orderedItems' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItems.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.productBrand',
                    sales: { $sum: '$orderedItems.quantity' },
                    revenue: { $sum: '$orderedItems.totalPrice' }
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            { $unwind: '$brand' },
            {
                $project: {
                    name: '$brand.brandName',
                    sales: 1,
                    revenue: 1
                }
            },
            { $sort: { sales: -1, revenue: -1 } },
            { $limit: 10 }
        ]);

        const ledgerData = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdOn' } },
                    totalRevenue: { $sum: '$finalAmount' },
                    totalOrders: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } }
        ]);

        res.render('admin/dashboard', {
            currentFilter,
            salesData,
            topProducts,
            topCategories,
            topBrands,
            ledgerData
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading dashboard');
    }
};



const loadSales = async (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }

    try {
        const timeRange = req.query.range || 'monthly';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        let startDate, endDate = new Date();

        switch (timeRange) {
            case 'daily':
                startDate = new Date();
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'weekly':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'monthly':
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'yearly':
                startDate = new Date();
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            case 'custom':
                startDate = new Date(req.query.startDate);
                endDate = new Date(req.query.endDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            default:
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
                break;
        }

        const totalOrders = await Order.countDocuments({
            createdOn: { $gte: startDate, $lte: endDate },
            status: { $in: ['Delivered'] }
        });

        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find({
            createdOn: { $gte: startDate, $lte: endDate },
            status: { $in: ['Delivered'] }
        })
            .populate('userId')
            .sort({ createdOn: -1 }) 
            .skip(skip)
            .limit(limit);

        const allOrders = await Order.find({
            createdOn: { $gte: startDate, $lte: endDate },
            status: { $in: ['Delivered'] }
        });

        let grossSales = 0;
        let netSales = 0;
        let totalOfferDiscount = 0;
        let totalCouponDiscount = 0;
        let totalProductsSold = 0;
        let totalCouponsRedeemed = 0;

        allOrders.forEach(order => {
            grossSales += order.totalPrice || 0;
            totalOfferDiscount += order.offerDiscountTotal || 0;
            totalCouponDiscount += order.discount || 0;
            netSales += order.finalAmount || 0;

            order.orderedItems.forEach(item => {
                totalProductsSold += item.quantity;
            });

            if (order.couponApplied) totalCouponsRedeemed++;
        });

        const stats = {
            grossSales,
            netSales,
            productsSold: totalProductsSold,
            couponsRedeemed: totalCouponsRedeemed,
            offerDiscount: totalOfferDiscount,
            couponDiscount: totalCouponDiscount
        };

        res.render('admin/sales', {
            orders,
            stats,
            timeRange,
            startDate,
            endDate,
            currentPage: page,
            totalPages: totalPages,
            totalOrders: totalOrders
        });

    } catch (err) {
        console.error('Error loading sales:', err);
        res.status(500).send('Internal Server Error');
    }
};




module.exports = {
    loadLogin,
    login,
    pageerror,
    logout,
    loadDashboard,
    loadSales
}