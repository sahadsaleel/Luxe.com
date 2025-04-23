const Brand = require('../../models/brandSchema');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary'); 



const getBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    
    const brandData = await Brand.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalBrands = await Brand.countDocuments();
    const totalPages = Math.ceil(totalBrands / limit);

    res.render('admin/brands', {
      data: brandData,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
    });
  } catch (error) {
    console.error('Error fetching brand page:', error);
    res.redirect('/admin/pageerror');
  }
};



const addBrand = async (req, res) => {
  try {
    const { brandName, status } = req.body;
    const file = req.file;

    // console.log('ekjh:', { brandName, status, file });

    // Validate inputs
    if (!brandName || !status || !file) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check for duplicate brand
    const existingBrand = await Brand.findOne({ brandName });
    if (existingBrand) {
      await fs.unlink(file.path); // Clean up temporary file
      return res.status(400).json({ success: false, message: 'Brand name already exists' });
    }

    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      await fs.unlink(file.path); // Clean up temporary file
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'brands', // Optional: Organize images in a folder
      transformation: [{ width: 200, height: 200, crop: 'limit' }], // Optional: Resize image
    });

    // Clean up temporary file
    await fs.unlink(file.path);

    // Create new brand
    const newBrand = new Brand({
      brandName,
      brandImage: result.secure_url, // Store Cloudinary URL
      cloudinaryPublicId: result.public_id, // Store public_id for deletion
      isBlocked: status === 'inactive',
    });
    await newBrand.save();

    // console.log('Brand added:', newBrand)
    res.status(201).json({ success: true, message: 'Brand added successfully' });
  } catch (error) {
    console.error('Error adding brand:', error);
    if (req.file) await fs.unlink(req.file.path); // Clean up on error
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: `Validation error: ${error.message}` });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Brand name already exists' });
    }
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};



const editBrand = async (req, res) => {
  try {
    const { id, brandName, status } = req.body;
    const file = req.file;


    // Validate inputs
    if (!id || !brandName || !status) {
      if (file) await fs.unlink(file.path); // Clean up temporary file
      return res.status(400).json({ success: false, message: 'ID, brand name, and status are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (file) await fs.unlink(file.path);
      return res.status(400).json({ success: false, message: 'Invalid brand ID' });
    }

    // Find brand
    const brand = await Brand.findById(id);
    if (!brand) {
      if (file) await fs.unlink(file.path); 
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    // Check for duplicate brand name
    const existingBrand = await Brand.findOne({ brandName, _id: { $ne: id } });
    if (existingBrand) {
      if (file) await fs.unlink(file.path);
      return res.status(400).json({ success: false, message: 'Brand name already exists' });
    }

    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      if (file) await fs.unlink(file.path);
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    let imageUrl = brand.brandImage;
    let cloudinaryPublicId = brand.cloudinaryPublicId;

    // Handle image update
    if (file) {
      // Delete old image from Cloudinary if it exists
      if (brand.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(brand.cloudinaryPublicId);
        } catch (err) {
          console.warn('Failed to delete old Cloudinary image:', err.message);
        }
      }

      // Upload new image to Cloudinary
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'brands',
        transformation: [{ width: 200, height: 200, crop: 'limit' }],
      });

      imageUrl = result.secure_url;
      cloudinaryPublicId = result.public_id;

      // Clean up temporary file
      await fs.unlink(file.path);
    }

    // Update brand
    brand.brandName = brandName;
    brand.brandImage = imageUrl;
    brand.cloudinaryPublicId = cloudinaryPublicId;
    brand.isBlocked = status === 'inactive';

    await brand.save();
    // console.log('Brand updated:', brand)

    res.status(200).json({ success: true, message: 'Brand updated successfully' });
  } catch (error) {
    console.error('Error updating brand:', error);
    if (req.file) await fs.unlink(req.file.path); // Clean up on error
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: `Validation error: ${error.message}` });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Brand name already exists' });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid brand ID' });
    }
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};




const deleteBrand = async (req, res) => {
  try {
    const { id } = req.body;

    // console.log('Delete request:', { id });

    // Validate input
    if (!id) {
      return res.status(400).json({ success: false, message: 'Brand ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid brand ID' });
    }

    // Find brand
    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    // Delete image from Cloudinary if it exists
    if (brand.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(brand.cloudinaryPublicId);
      } catch (err) {
        console.warn('Failed to delete Cloudinary image:', err.message);
      }
    }

    // Delete brand
    await Brand.findByIdAndDelete(id);
    // console.log('Brand deleted:', id)

    res.status(200).json({ success: true, message: 'Brand deleted successfully' });
  } catch (error) {
    console.error('Error deleting brand:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid brand ID' });
    }
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

module.exports = {
  getBrandPage,
  addBrand,
  editBrand,
  deleteBrand,
};