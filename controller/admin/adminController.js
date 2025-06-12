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
const PDFDocument = require('pdfkit'); 
const fs = require('fs');
const path = require('path');



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

const loadDashboard = async (req, res) => {
    try {
        const currentFilter = req.query.filter || 'monthly';
        const activeSection = req.query.section || 'overview';

        // Validate filter
        const filters = ['weekly', 'monthly', 'yearly'];
        if (!filters.includes(currentFilter)) {
            throw new Error('Invalid filter');
        }

        const salesData = {};

        // Define date ranges for filters
        for (const filter of filters) {
            let matchStage = { status: { $in: ['Delivered', 'Processing', 'Shipped'] } }; // Only count successful orders
            const now = new Date();

            if (filter === 'weekly') {
                const lastWeek = new Date(now.setDate(now.getDate() - 7));
                matchStage.createdOn = { $gte: lastWeek };
            } else if (filter === 'monthly') {
                const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
                matchStage.createdOn = { $gte: lastMonth };
            } else if (filter === 'yearly') {
                const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
                matchStage.createdOn = { $gte: lastYear };
            }

            // Sales aggregation for chart
            const aggregation = await Order.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: filter === 'weekly' ? '%Y-%m-%d' : filter === 'monthly' ? '%Y-%m' : '%Y',
                                date: '$createdOn',
                            },
                        },
                        totalSales: { $sum: '$finalAmount' },
                    },
                },
                { $sort: { _id: 1 } },
            ]);

            const labels = aggregation.map((item) => item._id);
            const data = aggregation.map((item) => item.totalSales);

            // Stats aggregation
            const statsAggregation = await Order.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$finalAmount' },
                        orders: { $sum: 1 },
                        customers: { $addToSet: '$userId' },
                    },
                },
            ]);

            const revenue = statsAggregation[0]?.revenue || 0;
            const orders = statsAggregation[0]?.orders || 0;
            const customers = statsAggregation[0]?.customers?.length || 0;

            // Calculate growth (compare with previous period)
            let prevMatchStage = { ...matchStage };
            if (filter === 'weekly') {
                prevMatchStage.createdOn = {
                    $gte: new Date(now.setDate(now.getDate() - 14)),
                    $lt: new Date(now.setDate(now.getDate() - 7)),
                };
            } else if (filter === 'monthly') {
                prevMatchStage.createdOn = {
                    $gte: new Date(now.setMonth(now.getMonth() - 2)),
                    $lt: new Date(now.setMonth(now.getMonth() - 1)),
                };
            } else {
                prevMatchStage.createdOn = {
                    $gte: new Date(now.setFullYear(now.getFullYear() - 2)),
                    $lt: new Date(now.setFullYear(now.getFullYear() - 1)),
                };
            }

            const prevStats = await Order.aggregate([
                { $match: prevMatchStage },
                { $group: { _id: null, revenue: { $sum: '$finalAmount' } } },
            ]);

            const prevRevenue = prevStats[0]?.revenue || 0;
            const growth = prevRevenue
                ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(2)
                : 0;

            salesData[filter] = {
                labels,
                data,
                stats: { revenue, orders, customers, growth },
            };
        }

        // Top 10 Products
        const topProducts = await Order.aggregate([
            { $match: { status: { $in: ['Delivered', 'Processing', 'Shipped'] } } },
            { $unwind: '$orderedItems' },
            {
                $group: {
                    _id: '$orderedItems.productId',
                    sales: { $sum: '$orderedItems.quantity' },
                    revenue: { $sum: '$orderedItems.totalPrice' },
                },
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product',
                },
            },
            { $unwind: '$product' },
            {
                $project: {
                    name: '$product.productName',
                    sales: 1,
                    revenue: 1,
                },
            },
            { $sort: { sales: -1, revenue: -1 } },
            { $limit: 10 },
        ]);

        // Top 10 Categories
        const topCategories = await Order.aggregate([
            { $match: { status: { $in: ['Delivered', 'Processing', 'Shipped'] } } },
            { $unwind: '$orderedItems' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItems.productId',
                    foreignField: '_id',
                    as: 'product',
                },
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.productCategory',
                    sales: { $sum: '$orderedItems.quantity' },
                    revenue: { $sum: '$orderedItems.totalPrice' },
                },
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category',
                },
            },
            { $unwind: '$category' },
            {
                $project: {
                    name: '$category.name',
                    sales: 1,
                    revenue: 1,
                },
            },
            { $sort: { sales: -1, revenue: -1 } },
            { $limit: 10 },
        ]);

        // Top 10 Brands
        const topBrands = await Order.aggregate([
            { $match: { status: { $in: ['Delivered', 'Processing', 'Shipped'] } } },
            { $unwind: '$orderedItems' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItems.productId',
                    foreignField: '_id',
                    as: 'product',
                },
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.productBrand',
                    sales: { $sum: '$orderedItems.quantity' },
                    revenue: { $sum: '$orderedItems.totalPrice' },
                },
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brand',
                },
            },
            { $unwind: '$brand' },
            {
                $project: {
                    name: '$brand.brandName',
                    sales: 1,
                    revenue: 1,
                },
            },
            { $sort: { sales: -1, revenue: -1 } },
            { $limit: 10 },
        ]);

        // Handle ledger book generation
        if (req.query.action === 'generateLedger') {
            const ledgerData = await Order.aggregate([
                { $match: { status: { $in: ['Delivered', 'Processing', 'Shipped'] } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdOn' } },
                        totalRevenue: { $sum: '$finalAmount' },
                        totalOrders: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]);

            // Generate PDF
            const doc = new PDFDocument();
            const filePath = path.join(__dirname, '../public/ledger.pdf');
            doc.pipe(fs.createWriteStream(filePath));

            doc.fontSize(18).text('Ledger Book', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`);
            doc.moveDown();

            ledgerData.forEach((entry) => {
                doc.text(`Date: ${entry._id}`);
                doc.text(`Total Revenue: ₹${entry.totalRevenue.toLocaleString('en-IN')}`);
                doc.text(`Total Orders: ${entry.totalOrders}`);
                doc.moveDown();
            });

            doc.end();

            return res.download(filePath, 'ledger.pdf', (err) => {
                if (err) {
                    console.error('Error downloading ledger:', err);
                    res.status(500).send('Error generating ledger');
                }
                // Optionally delete the file after download
                fs.unlinkSync(filePath);
            });
        }

        res.render('admin/dashboard', {
            currentFilter,
            activeSection,
            salesData,
            topProducts,
            topCategories,
            topBrands,
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.render('admin/dashboard', {
            currentFilter: 'monthly',
            activeSection: 'overview',
            salesData: {
                weekly: { labels: [], data: [], stats: { revenue: 0, orders: 0, customers: 0, growth: 0 } },
                monthly: { labels: [], data: [], stats: { revenue: 0, orders: 0, customers: 0, growth: 0 } },
                yearly: { labels: [], data: [], stats: { revenue: 0, orders: 0, customers: 0, growth: 0 } },
            },
            topProducts: [],
            topCategories: [],
            topBrands: [],
        });
    }
};



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
            case 'yearly':
                startDate = new Date();
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            case 'custom':
                startDate = req.query.startDate ? new Date(req.query.startDate) : new Date();
                endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
                break;
            default:
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
        }

        const totalOrdersCount = await Order.countDocuments({
            createdOn: { $gte: startDate, $lte: endDate },
            status: 'Delivered'
        });

        const orders = await Order.find({
            createdOn: { $gte: startDate, $lte: endDate },
            status: 'Delivered'
        })
            .populate('userId', 'firstName lastName')
            .populate('orderedItems.productId')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        const productIds = [...new Set(orders.flatMap(order => 
            order.orderedItems.map(item => item.productId?._id?.toString()).filter(id => id)
        ))];

        const offers = await Offer.find({
            offerType: 'product',
            targetId: { $in: productIds },
            status: 'Active',
            endDate: { $gt: new Date() }
        }).lean();

        const offerMap = new Map();
        offers.forEach(offer => {
            const productId = offer.targetId.toString();
            if (!offerMap.has(productId)) {
                offerMap.set(productId, []);
            }
            offerMap.get(productId).push(offer);
        });

        const stats = orders.reduce((acc, order) => {
            let orderGrossSales = 0;
            let orderNetSales = 0;
            let orderProductsSold = 0;
            let orderOfferDiscountTotal = 0;

            const validItems = order.orderedItems; // All items are valid since order is Delivered

            validItems.forEach(item => {
                orderProductsSold += item.quantity || 0;
                const itemTotal = (item.price * item.quantity) || 0;
                orderGrossSales += itemTotal;

                const productOffers = offerMap.get(item.productId?._id?.toString()) || [];
                const itemOfferDiscount = productOffers.reduce((maxDiscount, offer) => {
                    if (!offer) return maxDiscount;
                    const isActive = offer.status === 'Active' && new Date(offer.endDate) > new Date();
                    if (isActive) {
                        const discount = (item.price * offer.discount / 100) * item.quantity;
                        return Math.max(maxDiscount, discount);
                    }
                    return maxDiscount;
                }, 0) || 0;
                orderOfferDiscountTotal += itemOfferDiscount;

                orderNetSales += itemTotal - itemOfferDiscount;
            });

            const couponDiscount = order.discount || 0;
            orderNetSales -= couponDiscount;

            acc.grossSales += orderGrossSales;
            acc.netSales += orderNetSales;
            acc.productsSold += orderProductsSold;
            acc.couponsRedeemed += order.couponApplied && couponDiscount > 0 ? 1 : 0;

            order.offerDiscountTotal = orderOfferDiscountTotal;

            return acc;
        }, {
            grossSales: 0,
            netSales: 0,
            productsSold: 0,
            couponsRedeemed: 0
        });

        const formattedOrders = orders.map(order => {
            const validItems = order.orderedItems;

            const offerDiscountTotal = validItems.reduce((total, item) => {
                const productOffers = offerMap.get(item.productId?._id?.toString()) || [];
                const itemOfferDiscount = productOffers.reduce((maxDiscount, offer) => {
                    if (!offer) return maxDiscount;
                    const isActive = offer.status === 'Active' && new Date(offer.endDate) > new Date();
                    if (isActive) {
                        const discount = (item.price * offer.discount / 100) * item.quantity;
                        return Math.max(maxDiscount, discount);
                    }
                    return maxDiscount;
                }, 0) || 0;
                return total + itemOfferDiscount;
            }, 0) || 0;

            return {
                customer: {
                    name: order.userId ? `${order.userId.firstName} ${order.userId.lastName}` : 'N/A',
                    id: order.userId?._id || 'N/A'
                },
                date: order.createdOn,
                totalPrice: order.totalPrice || 0,
                offerDiscountTotal: offerDiscountTotal,
                discount: order.discount || 0,
                finalAmount: order.finalAmount || 0,
                paymentMethod: order.paymentMethod || 'N/A',
                status: order.status || 'N/A'
            };
        });

        const totalPages = Math.ceil(totalOrdersCount / limit);

        res.render('admin/sales', {
            stats,
            orders: formattedOrders,
            timeRange,
            startDate,
            endDate,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error('Error loading sales page:', error);
        res.redirect('/admin/pageerror');
    }
};


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
    loadSales
}