const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin/adminController');
const customerController = require('../controller/admin/customerController');
const categoryController = require('../controller/admin/categoryController');
const brandController = require('../controller/admin/brandController');
const productController = require('../controller/admin/productController');
const orderController = require('../controller/admin/orderController');
const { uploadSingleImage, uploadMultipleImages } = require('../helpers/multer');
const { userAuth, adminAuth } = require('../middleware/auth');

// Test route for Cloudinary uploads
router.post('/test-cloudinary', adminAuth, uploadSingleImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'test',
    });
    await fs.unlink(req.file.path);
    res.json({ success: true, url: result.secure_url, public_id: result.public_id });
  } catch (error) {
    if (req.file) await fs.unlink(req.file.path);
    console.error('Cloudinary test error:', error);
    res.status(500).json({ success: false, message: `Cloudinary error: ${error.message}` });
  }
});

// Login management
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/pageerror', adminController.pageerror);
router.get('/logout', adminController.logout);

// Customer management
router.get('/customers', adminAuth, customerController.customerInfo);
router.get('/blockCustomer', adminAuth, customerController.customerBlocked);
router.get('/unblockCustomer', adminAuth, customerController.customerUnblocked);
router.post('/upload-image',adminAuth, uploadSingleImage, customerController.uploadProfileImage);

// Category management
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/editCategory', adminAuth, categoryController.editCategory);
router.post('/deleteCategory', adminAuth, categoryController.deleteCategory);

// Brand management
router.get('/brands', adminAuth, brandController.getBrandPage);
router.post('/addBrand', adminAuth, uploadSingleImage, brandController.addBrand);
router.post('/editBrand', adminAuth, uploadSingleImage, brandController.editBrand);
router.post('/deleteBrand', adminAuth, brandController.deleteBrand);

// Product management
router.get('/products', adminAuth, productController.getProductPage);
router.post('/addProduct', adminAuth, uploadMultipleImages, productController.addProduct);
router.post('/editProduct', adminAuth, uploadMultipleImages, productController.editProduct);
router.get('/deleteProduct/:id', adminAuth, productController.deleteProduct);
router.get('/getProduct/:id', adminAuth, productController.getProductById); 


// Order management
router.get('/orders', adminAuth, orderController.loadOrderPage);
router.get('/orders/:orderId', adminAuth, orderController.loadOrderDetailPage);
router.post('/orders/:orderId/update-status', adminAuth, orderController.updateOrderStatus);




module.exports = router;