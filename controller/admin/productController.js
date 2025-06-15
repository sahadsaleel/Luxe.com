const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary');
const streamifier = require('streamifier');
const Brand = require('../../models/brandSchema');
const Order = require('../../models/orderSchema');

const getProductPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sort = req.query.sort || 'newest';

    let sortOption = { createdAt: -1 };
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    if (sort === 'a-z') sortOption = { productName: 1 };
    if (sort === 'z-a') sortOption = { productName: -1 };

    const productData = await Product.find({
      productName: { $regex: search, $options: 'i' },
      isDeleted: false
    })
      .populate('productBrand')
      .populate('productCategory')
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const productIds = productData.map(product => product._id);
    const orderStats = await Order.aggregate([
      { $match: { 'orderedItems.productId': { $in: productIds } } },
      { $unwind: '$orderedItems' },
      { $match: { 'orderedItems.productId': { $in: productIds } } },
      {
        $group: {
          _id: '$orderedItems.productId',
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$orderedItems.status', 'Cancelled'] }, 1, 0] }
          },
          returnCount: {
            $sum: { $cond: [{ $eq: ['$orderedItems.status', 'Return Approved'] }, 1, 0] }
          }
        }
      }
    ]);

    const productStats = productData.map(product => {
      const stats = orderStats.find(stat => stat._id.toString() === product._id.toString()) || {
        cancelledCount: 0,
        returnCount: 0
      };
      return {
        ...product.toObject(),
        cancelledCount: stats.cancelledCount,
        returnCount: stats.returnCount
      };
    });

    const totalProduct = await Product.countDocuments({
      productName: { $regex: search, $options: 'i' },
      isDeleted: false
    });
    const totalPages = Math.ceil(totalProduct / limit);

    const categories = await Category.find({ isListed: true });
    const brands = await Brand.find({ isBlocked: false });

    res.render('admin/products', {
      cat: categories,
      brand: brands,
      products: productStats,
      currentPage: page,
      totalPages: totalPages,
      totalProduct: totalProduct,
      search,
      sort
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.redirect('/admin/pageerror');
  }
};


const addProduct = async (req, res) => {
  try {
    const { productName, productBrand, productCategory, productDescription, status, variants } = req.body;

    const productExists = await Product.findOne({ productName, isDeleted: false });
    if (productExists) {
      return res.status(400).json({ success: false, message: 'Product already exists' });
    }

    if (!productName || !productBrand || !productCategory || !productDescription || !status) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(productCategory) || !mongoose.Types.ObjectId.isValid(productBrand)) {
      return res.status(400).json({ success: false, message: 'Invalid category or brand' });
    }

    let parsedVariants;
    try {
      parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid variants format' });
    }

    if (!Array.isArray(parsedVariants) || parsedVariants.length > 5) {
      return res.status(400).json({ success: false, message: 'Maximum 5 variants are allowed' });
    }

    const processedVariants = parsedVariants.map((variant, index) => {
      const { size, salePrice, quantity } = variant;
      if (!size || !salePrice || !quantity) {
        throw new Error(`Missing fields in variant ${index + 1}`);
      }
      const salePriceNum = parseFloat(salePrice);
      const quantityNum = parseInt(quantity);
      
      if (isNaN(salePriceNum) || salePriceNum <= 0) {
        throw new Error(`Invalid price in variant ${index + 1}`);
      }
      if (isNaN(quantityNum) || quantityNum < 0) {
        throw new Error(`Invalid quantity in variant ${index + 1}`);
      }
      
      return { size, salePrice: salePriceNum, quantity: quantityNum };
    });

    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'product-images', 
                width: 800, 
                height: 800, 
                crop: 'fill', 
                quality: 'auto',
                fetch_format: 'auto',
                flags: 'preserve_transparency'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          });
          if (!images.includes(result.secure_url)) {
            images.push(result.secure_url);
          }
        } catch (uploadError) {
          console.error('Cloudinary upload error for file:', file.originalname, uploadError);
          return res.status(500).json({ success: false, message: 'Failed to upload one or more images to Cloudinary' });
        }
      }
    }

    if (images.length < 3 || images.length > 4) {
      return res.status(400).json({ success: false, message: 'Exactly 3 to 4 images are required' });
    }

    const newProduct = new Product({
      productName,
      productBrand,
      productCategory,
      productDescription,
      productImage: images,
      variants: processedVariants,
      status,
      isDeleted: false
    });

    await newProduct.save();
    return res.status(200).json({ success: true, message: 'Product added successfully' });
  } catch (error) {
    console.error('Error in addProduct:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to add product' });
  }
};

const editProduct = async (req, res) => {
  try {
    const { productId, productName, productBrand, productCategory, productDescription, status, variants, existingImages, removedImages } = req.body;
      
      if (!productId || !productName || !productBrand || !productCategory || !productDescription || !status) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let parsedVariants;
    try {
      parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid variants format' });
    }

    if (!Array.isArray(parsedVariants) || parsedVariants.length > 5) {
      return res.status(400).json({ success: false, message: 'Maximum 5 variants are allowed' });
    }

    const processedVariants = parsedVariants.map((variant, index) => {
      const { size, salePrice, quantity } = variant;
      if (!size || !salePrice || !quantity) {
        throw new Error(`Missing fields in variant ${index + 1}`);
      }
      const salePriceNum = parseFloat(salePrice);
      const quantityNum = parseInt(quantity);
      
      if (isNaN(salePriceNum) || salePriceNum <= 0) {
        throw new Error(`Invalid price in variant ${index + 1}`);
      }
      if (isNaN(quantityNum) || quantityNum < 0) {
        throw new Error(`Invalid quantity in variant ${index + 1}`);
      }
      
      return { size, salePrice: salePriceNum, quantity: quantityNum };
    });

    let images = [];
    const existingImagesArray = Array.isArray(existingImages) ? [...new Set(existingImages)] : existingImages ? [existingImages] : [];
    const removedImagesArray = removedImages ? removedImages.split(',').filter(img => img.trim()) : [];
    images = existingImagesArray.filter(img => img && !removedImagesArray.includes(img));

    for (const img of removedImagesArray) {
      if (img && img.trim()) {
        try {
          const publicId = img.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`product-images/${publicId}`);
        } catch (err) {
          console.error('Error deleting image from Cloudinary:', err);
        }
      }
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'product-images', 
                width: 800, 
                height: 800, 
                crop: 'fill', 
                quality: 90,
                fetch_format: 'auto',
                flags: 'preserve_transparency'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          });
          if (!images.includes(result.secure_url)) {
            images.push(result.secure_url);
          }
        } catch (uploadError) {
          console.error('Cloudinary upload error for: ', file.originalname, uploadError);
          return res.status(500).json({ success: false, message: 'Failed to upload one or more images to Cloudinary' });
        }
      }
    }

    if (images.length < 3 || images.length > 4) {
      return res.status(400).json({ success: false, message: 'Exactly 3 to 4 images are required' });
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productId, __v: product.__v },
      {
        productName,
        productBrand,
        productCategory,
        productDescription,
        status,
        productImage: images,
        variants: processedVariants,
        updatedAt: new Date(),
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(409).json({ success: false, message: 'Concurrent update detected. Please refresh and try again.' });
    }

    return res.status(200).json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error in editProduct:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update product' });
  }
};

const deleteProduct = async (req, res) => {
  try {
      const productId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(productId)) {
          return res.status(400).json({ success: false, message: 'Valid product ID is required' });
      }

      const product = await Product.findById(productId);
      if (!product) {
          return res.status(404).json({ success: false, message: 'Product not found' });
      }

      if (product.productImage && Array.isArray(product.productImage)) {
          for (const img of product.productImage) {
              try {
                  const publicId = img.split('/').pop().split('.')[0];
                  await cloudinary.uploader.destroy(`product-images/${publicId}`);
              } catch (err) {
                  console.warn('Failed to delete Cloudinary image:', err.message);
              }
          }
      }

      await Product.findByIdAndUpdate(productId, { isDeleted: true });
      return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
      console.error('Error deleting product:', error.message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params; 
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Valid product ID is required' });
    }

    const product = await Product.findOne({ _id: id, isDeleted: false })
      .populate('productBrand')
      .populate('productCategory');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({ success: true, data: product.toObject() });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

module.exports = {
  getProductPage,
  addProduct,
  editProduct,
  deleteProduct,
  getProductById,
};