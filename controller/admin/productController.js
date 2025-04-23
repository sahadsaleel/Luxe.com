const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const mongoose = require('mongoose');
const cloudinary = require('../../config/cloudinary');
const streamifier = require('streamifier');



const getProductPage = async (req, res) => {
    try {
        const search = req.query.search || '';
        const sort = req.query.sort || 'newest';
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        let sortOption = { createdAt: -1 }; 
        if (sort === 'oldest') sortOption = { createdAt: 1 };
        if (sort === 'a-z') sortOption = { productName: 1 };
        if (sort === 'z-a') sortOption = { productName: -1 };

        const products = await Product.find({
            productName: { $regex: search, $options: 'i' }
        })
            .populate('productBrand')
            .populate('productCategory')
            .sort(sortOption);

        res.render('admin/products', {
            cat: categories,
            brand: brands,
            products
        });
    } catch (error) {
        console.error('Error in getProductPage:', error);
        res.redirect('/admin/pageerror');
    }
};


const addProductPage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        res.render('admin/addProduct', {
            cat: categories,
            brand: brands
        });
    } catch (error) {
        console.error('Error in addProductPage:', error);
        res.redirect('/admin/pageerror');
    }
};

const addProduct = async (req, res) => {
    try {
        const productData = req.body;

        // Check if product already exists
        const productExists = await Product.findOne({
            productName: productData.productName,
            isDeleted: false
        });
        if (productExists) {
            return res.status(400).json({
                success: false,
                message: 'Product already exists, please try with another name'
            });
        }

        // Upload images to Cloudinary
        const images = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const uploaded = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'product-images',
                            transformation: [
                                { width: 440, height: 440, crop: 'fill' },
                                { quality: 'auto', fetch_format: 'auto' }
                            ]
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(file.buffer).pipe(stream);
                });

                images.push(uploaded.secure_url);
            }
        }

        if (images.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one product image is required'
            });
        }

        // Parse variants if sent as a string
        let rawVariants = productData.variants;
        if (typeof rawVariants === 'string') {
            try {
                rawVariants = JSON.parse(rawVariants);
            } catch {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid variants format'
                });
            }
        }

        // Process variants
        const variants = [];
        if (rawVariants && Array.isArray(rawVariants)) {
            rawVariants.forEach((variant, index) => {
                const { size, regularPrice, salePrice, quantity } = variant;

                if (!size || !regularPrice || !quantity) {
                    throw new Error(`Missing required fields in variant ${index + 1}`);
                }

                const regularPriceNum = parseFloat(regularPrice);
                const salePriceNum = salePrice ? parseFloat(salePrice) : 0;
                const quantityNum = parseInt(quantity);

                if (isNaN(regularPriceNum) || regularPriceNum <= 0) {
                    throw new Error(`Invalid regular price in variant ${index + 1}`);
                }
                if (salePrice && (isNaN(salePriceNum) || salePriceNum < 0)) {
                    throw new Error(`Invalid sale price in variant ${index + 1}`);
                }
                if (isNaN(quantityNum) || quantityNum < 0) {
                    throw new Error(`Invalid quantity in variant ${index + 1}`);
                }
                if (salePriceNum > 0 && salePriceNum >= regularPriceNum) {
                    throw new Error(`Sale price must be less than regular price in variant ${index + 1}`);
                }

                variants.push({
                    size,
                    regularPrice: regularPriceNum,
                    salePrice: salePriceNum,
                    quantity: quantityNum
                });
            });
        }

        if (variants.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one product variant is required'
            });
        }

        // Validate category and brand IDs
        if (!mongoose.Types.ObjectId.isValid(productData.productCategory)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category ID'
            });
        }
        if (!mongoose.Types.ObjectId.isValid(productData.productBrand)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid brand ID'
            });
        }

        // Create new product
        const newProduct = new Product({
            productName: productData.productName,
            productBrand: productData.productBrand,
            productCategory: productData.productCategory,
            productDescription: productData.productDescription,
            productImage: images,
            variants,
            status: productData.status || 'listed'
        });

        await newProduct.save();

        return res.status(200).json({
            success: true,
            message: 'Product added successfully'
        });
    } catch (error) {
        console.error('Error in addProduct:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error'
        });
    }
};

const editProduct = async (req, res) => {
    try {
        const productId = req.body.productId;
        const productData = req.body;

        // Validate product ID
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        // Find existing product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Validate category and brand IDs if provided
        if (productData.productCategory) {
            if (!mongoose.Types.ObjectId.isValid(productData.productCategory)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid category ID'
                });
            }
            const category = await Category.findById(productData.productCategory);
            if (!category || !category.isListed) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or unlisted category'
                });
            }
        }
        if (productData.productBrand) {
            if (!mongoose.Types.ObjectId.isValid(productData.productBrand)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid brand ID'
                });
            }
            const brand = await Brand.findById(productData.productBrand);
            if (!brand || brand.isBlocked) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or blocked brand'
                });
            }
        }

        // Handle images
        const images = [];
        const existingImages = Array.isArray(productData.existingImages)
            ? productData.existingImages
            : Object.values(productData.existingImages || {});
        const removedImages = productData.removedImages
            ? productData.removedImages.split(',').filter(img => img.trim())
            : [];

        // Keep existing images that are not removed
        for (const img of existingImages) {
            if (img && !removedImages.includes(img)) {
                images.push(img);
            }
        }

        // Delete removed images from Cloudinary
        for (const imgToRemove of removedImages) {
            if (!imgToRemove || imgToRemove.trim() === '') continue;
            try {
                const publicId = imgToRemove.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`product-images/${publicId}`);
            } catch (err) {
                console.error('Error deleting image from Cloudinary:', err);
            }
        }

        // Upload new images to Cloudinary
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const uploaded = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'product-images',
                            transformation: [
                                { width: 440, height: 440, crop: 'fill' },
                                { quality: 'auto', fetch_format: 'auto' }
                            ]
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(file.buffer).pipe(stream);
                });

                images.push(uploaded.secure_url);
            }
        }

        // Validate images
        if (images.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one product image is required'
            });
        }

        // Parse and process variants
        let rawVariants = productData.variants;
        if (typeof rawVariants === 'string') {
            try {
                rawVariants = JSON.parse(rawVariants);
            } catch {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid variants format'
                });
            }
        }

        const variants = [];
        if (rawVariants && Array.isArray(rawVariants)) {
            rawVariants.forEach((variant, index) => {
                const { size, regularPrice, salePrice, quantity } = variant;

                if (!size || !regularPrice || !quantity) {
                    throw new Error(`Missing required fields in variant ${index + 1}`);
                }

                const regularPriceNum = parseFloat(regularPrice);
                const salePriceNum = salePrice ? parseFloat(salePrice) : 0;
                const quantityNum = parseInt(quantity);

                if (isNaN(regularPriceNum) || regularPriceNum <= 0) {
                    throw new Error(`Invalid regular price in variant ${index + 1}`);
                }
                if (salePrice && (isNaN(salePriceNum) || salePriceNum < 0)) {
                    throw new Error(`Invalid sale price in variant ${index + 1}`);
                }
                if (isNaN(quantityNum) || quantityNum < 0) {
                    throw new Error(`Invalid quantity in variant ${index + 1}`);
                }
                if (salePriceNum > 0 && salePriceNum >= regularPriceNum) {
                    throw new Error(`Sale price must be less than regular price in variant ${index + 1}`);
                }

                variants.push({
                    size,
                    regularPrice: regularPriceNum,
                    salePrice: salePriceNum,
                    quantity: quantityNum
                });
            });
        }

        if (variants.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one product variant is required'
            });
        }

        // Prepare update data
        const updateData = {
            ...(productData.productName && { productName: productData.productName }),
            ...(productData.productBrand && { productBrand: productData.productBrand }),
            ...(productData.productCategory && { productCategory: productData.productCategory }),
            ...(productData.productDescription && { productDescription: productData.productDescription }),
            ...(productData.status && { status: productData.status }),
            productImage: images,
            variants,
            updatedAt: new Date()
        };

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (updatedProduct) {
            return res.status(200).json({
                success: true,
                message: 'Product updated successfully'
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Failed to update product'
            });
        }
    } catch (error) {
        console.error('Error in editProduct:', error);
        return res.status(500).json({
            success: false,
            message: `Internal Server Error: ${error.message}`
        });
    }
};

const editProductPage = async (req, res) => {
    try {
        const productId = req.query.id;
        if (!productId) {
            return res.redirect('/admin/products');
        }

        const product = await Product.findById(productId).populate('productBrand productCategory');
        if (!product) {
            return res.redirect('/admin/products');
        }

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        res.render('admin/editProduct', {
            product,
            cat: categories,
            brand: brands
        });
    } catch (error) {
        console.error('Error in editProductPage:', error);
        res.redirect('/admin/pageerror');
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.query.id;
        if (!productId) {
            return res.redirect('/admin/products');
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.redirect('/admin/products');
        }

        // Delete images from Cloudinary
        if (product.productImage && product.productImage.length > 0) {
            for (const img of product.productImage) {
                try {
                    const publicId = img.split('/').pop().split('.')[0];
                    await cloudinary.uploader.destroy(`product-images/${publicId}`);
                } catch (err) {
                    console.error('Error deleting image from Cloudinary:', err);
                }
            }
        }

        // Soft delete by updating status
        product.status = 'unlisted';
        await product.save();

        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error in deleteProduct:', error);
        res.redirect('/admin/pageerror');
    }
};

module.exports = {
    getProductPage,
    addProductPage,
    addProduct,
    editProductPage,
    editProduct,
    deleteProduct
};