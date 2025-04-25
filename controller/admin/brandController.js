const Brand = require('../../models/brandSchema');
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs').promises;

const getBrandPage = async (req, res) => {
  try {
    const brands = await Brand.find().sort({ createdAt: -1 });
    res.render('admin/brands', { data: brands });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.redirect('/admin/pageerror');
  }
};

const addBrand = async (req, res) => {
  try {
    // console.log('Received request add brand:', req.body, req.file);
    const { brandName, status } = req.body;
    const file = req.file;

    if (!brandName || !status || !file) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existingBrand = await Brand.findOne({ brandName });
    if (existingBrand) {
      return res.status(400).json({ success: false, message: 'Brand name already exists' });
    }

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    //Wrap the stream in a Promise
    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            unique_filename: true,
            folder: 'brands',
            transformation: [{ width: 200, height: 200, crop: 'limit' }],
            resource_type: 'image',
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(buffer);
      });
    };

    //Await the result
    let result;
    try {
      result = await streamUpload(file.buffer);
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({ success: false, message: 'Failed to upload image to Cloudinary' });
    }

    //Now safely use result
    const newBrand = new Brand({
      brandName,
      brandImage: result.secure_url,
      cloudinaryPublicId: result.public_id,
      isBlocked: status === 'inactive',
    });
    await newBrand.save();

    res.status(201).json({ success: true, message: 'Brand added successfully' });
  } catch (error) {
    console.error('Error adding brand:', error);
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
    // console.log('Received request edit brand:', req.body, req.file);
    const { id, brandName, status } = req.body;
    const file = req.file;

    if (!id || !brandName || !status) {
      return res.status(400).json({ success: false, message: 'ID, brand name, and status are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid brand ID' });
    }

    // Check brand is exists
    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    // Check for duplicate brand name
    const existingBrand = await Brand.findOne({ brandName, _id: { $ne: id } });
    if (existingBrand) {
      return res.status(400).json({ success: false, message: 'Brand name already exists' });
    }

    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    let imageUrl = brand.brandImage;
    let cloudinaryPublicId = brand.cloudinaryPublicId;

    // Handle new image upload
    if (file) {
      // Delete old image from Cloudinary 
      // if exists
      if (cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(cloudinaryPublicId);
        } catch (err) {
          console.warn('Failed to delete old Cloudinary image:', err.message);
        }
      }

      // Upload new image to Cloudinary
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: 'brands',
              transformation: [{ width: 200, height: 200, crop: 'limit' }],
              resource_type: 'image'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });
      };

      try {
        const result = await streamUpload(file.buffer);
        imageUrl = result.secure_url;
        cloudinaryPublicId = result.public_id;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ success: false, message: 'Failed to upload image to Cloudinary' });
      }
    }

    // Update the brand
    const updatedBrand = await Brand.findOneAndUpdate(
      { _id: id, __v: brand.__v },
      {
        brandName,
        brandImage: imageUrl,
        cloudinaryPublicId,
        isBlocked: status === 'inactive',
        updatedAt: new Date(),
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!updatedBrand) {
      return res.status(409).json({ success: false, message: 'Concurrent update detected. Please refresh and try again.' });
    }

    res.status(200).json({ success: true, message: 'Brand updated successfully' });

  } catch (error) {
    console.error('Error updating brand:', error);
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
    console.log('Received request to delete brand:', req.body);
    const { id } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Valid brand ID is required' });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    if (brand.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(brand.cloudinaryPublicId);
      } catch (err) {
        console.warn('Failed to delete Cloudinary image:', err.message);
      }
    }

    await Brand.findByIdAndDelete(id);
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
