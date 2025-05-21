const Coupon = require('../../models/couponSchema');

const getCoupons = async (req, res) => {
  try {
    const sort = req.query.sort || 'newest';
    const sortOptions = {
      newest: { createdOn: -1 },
      oldest: { createdOn: 1 },
      'a-z': { name: 1 },
      'z-a': { name: -1 }
    };

    const coupons = await Coupon.find().sort(sortOptions[sort] || sortOptions.newest);
    res.render('admin/coupons', { coupons });
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

    const { name, code, discountValue, minimumPrice, usageLimit, isList, validFrom, expireOn } = req.body;

    if (!name || !code || !discountValue || !minimumPrice || !usageLimit || isList === undefined || !validFrom || !expireOn) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const couponData = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      discountValue: parseFloat(discountValue),
      minimumPrice: parseFloat(minimumPrice),
      usageLimit: parseInt(usageLimit, 10),
      isList: Boolean(isList),
      validFrom: new Date(validFrom),
      expireOn: new Date(expireOn)
    };

    if (isNaN(couponData.discountValue) || couponData.discountValue <= 0 || couponData.discountValue > 100) {
      return res.status(400).json({ message: 'Discount must be between 0 and 100%' });
    }
    if (isNaN(couponData.minimumPrice) || couponData.minimumPrice < 0) {
      return res.status(400).json({ message: 'Minimum price cannot be negative' });
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
      discountValue: parseFloat(req.body.discountValue),
      minimumPrice: parseFloat(req.body.minimumPrice),
      usageLimit: parseInt(req.body.usageLimit, 10),
      isList: Boolean(req.body.isList),
      validFrom: new Date(req.body.validFrom),
      expireOn: new Date(req.body.expireOn)
    };

    if (Object.values(couponData).some(val => val === undefined || val === null || val === '')) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (isNaN(couponData.discountValue) || couponData.discountValue <= 0 || couponData.discountValue > 100) {
      return res.status(400).json({ message: 'Discount must be between 0 and 100%' });
    }
    if (isNaN(couponData.minimumPrice) || couponData.minimumPrice < 0) {
      return res.status(400).json({ message: 'Minimum price cannot be negative' });
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

const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }
    res.json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: 'Failed to delete coupon' });
  }
};

module.exports = { getCoupons, getCouponById, addCoupon, editCoupon, deleteCoupon };