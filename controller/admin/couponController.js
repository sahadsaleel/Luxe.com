const Coupon = require('../../models/couponSchema');


const getCoupons = async (req, res) => {
  try {
    const sort = req.query.sort || 'newest';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sortOptions = {
      newest: { createdOn: -1 },
      oldest: { createdOn: 1 },
      'a-z': { name: 1 },
      'z-a': { name: -1 }
    };

    const [coupons, totalCoupons] = await Promise.all([
      Coupon.find()
        .sort(sortOptions[sort] || sortOptions.newest)
        .skip(skip)
        .limit(limit),
      Coupon.countDocuments()
    ]);

    const totalPages = Math.ceil(totalCoupons / limit);

    res.render('admin/coupons', {
      coupons,
      currentPage: page,
      totalPages,
      limit,
      sort
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ message: 'Failed to load coupons' });
  }
};


const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.json(coupon);
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json({ message: 'Failed to load coupon' });
  }
};

const addCoupon = async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { name, code, discountAmount, minimumPrice, usageLimit, isList, validFrom, expireOn } = req.body;

    if (!name || !code || !discountAmount || !minimumPrice || !usageLimit || isList === undefined || !validFrom || !expireOn) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validFromDate = new Date(validFrom);
    validFromDate.setHours(0, 0, 0, 0);

    if (validFromDate < today) {
      return res.status(400).json({ message: 'Valid from date cannot be in the past' });
    }

    const couponData = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      discountAmount: parseFloat(discountAmount),
      minimumPrice: parseFloat(minimumPrice),
      usageLimit: parseInt(usageLimit, 10),
      isList: Boolean(isList),
      validFrom: new Date(validFrom),
      expireOn: new Date(expireOn)
    };

    if (isNaN(couponData.discountAmount) || couponData.discountAmount <= 0) {
      return res.status(400).json({ message: 'Discount amount must be greater than 0' });
    }
    if (isNaN(couponData.minimumPrice) || couponData.minimumPrice < 0) {
      return res.status(400).json({ message: 'Minimum price cannot be negative' });
    }
    if (couponData.discountAmount >= couponData.minimumPrice) {
      return res.status(400).json({ message: 'Discount amount cannot be greater than or equal to minimum cart value' });
    }
    if (isNaN(couponData.usageLimit) || couponData.usageLimit < 0) {
      return res.status(400).json({ message: 'Usage limit cannot be negative' });
    }
    if (isNaN(couponData.validFrom.getTime()) || isNaN(couponData.expireOn.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const newCoupon = new Coupon(couponData);
    await newCoupon.save();
    res.status(201).json({ message: 'Coupon created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(error.errors).map(e => e.message).join(', ') });
    }
    console.error('Error adding coupon:', error);
    res.status(500).json({ message: 'Failed to create coupon' });
  }
};

const editCoupon = async (req, res) => {
  try {
    const couponData = {
      name: req.body.name?.trim(),
      code: req.body.code?.trim().toUpperCase(),
      discountAmount: parseFloat(req.body.discountAmount),
      minimumPrice: parseFloat(req.body.minimumPrice),
      usageLimit: parseInt(req.body.usageLimit, 10),
      isList: Boolean(req.body.isList),
      validFrom: new Date(req.body.validFrom),
      expireOn: new Date(req.body.expireOn)
    };

    if (Object.values(couponData).some(val => val === undefined || val === null || val === '')) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validFromDate = new Date(couponData.validFrom);
    validFromDate.setHours(0, 0, 0, 0);

    const existingCoupon = await Coupon.findById(req.params.id);
    const existingValidFrom = new Date(existingCoupon.validFrom);
    existingValidFrom.setHours(0, 0, 0, 0);

    if (validFromDate.getTime() !== existingValidFrom.getTime() && validFromDate < today) {
      return res.status(400).json({ message: 'Valid from date cannot be in the past' });
    }

    if (isNaN(couponData.discountAmount) || couponData.discountAmount <= 0) {
      return res.status(400).json({ message: 'Discount amount must be greater than 0' });
    }
    if (isNaN(couponData.minimumPrice) || couponData.minimumPrice < 0) {
      return res.status(400).json({ message: 'Minimum price cannot be negative' });
    }
    if (couponData.discountAmount >= couponData.minimumPrice) {
      return res.status(400).json({ message: 'Discount amount cannot be greater than or equal to minimum cart value' });
    }
    if (isNaN(couponData.validFrom.getTime()) || isNaN(couponData.expireOn.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, couponData, { new: true, runValidators: true });
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.json({ message: 'Coupon updated successfully' });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(400).json({ message: error.message || 'Failed to update coupon' });
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    
    await Coupon.updateOne(
      { _id: req.params.id },
      { $set: { isList: !coupon.isList } }
    );

    res.json({ 
      message: `Coupon ${coupon.isList ? 'disabled' : 'enabled'} successfully`,
      isList: !coupon.isList 
    });
  } catch (error) {
    console.error('Error toggling coupon status:', error);
    res.status(500).json({ message: 'Failed to toggle coupon status' });
  }
};

module.exports = { 
  getCoupons,
  getCouponById,
  addCoupon,
  editCoupon,
  toggleCouponStatus
 };