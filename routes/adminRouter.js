
const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin/adminController'); // Updated path
const customerController = require('../controller/admin/customerController');
const categoryController = require('../controller/admin/categoryController');
const brandController = require('../controller/admin/brandController');
const productController = require('../controller/admin/productController');
const { userAuth, adminAuth } = require('../middleware/auth');
const { uploadSingleImage, uploadMultipleImages } = require('../helpers/multer'); // Updated from middleware/multerConfig

// Multer error handling middleware
const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message });
  } else if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

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

// Category management
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/editCategory', adminAuth, categoryController.editCategory);
router.post('/deleteCategory', adminAuth, categoryController.deleteCategory);

// Brand management
router.get('/brands', adminAuth, brandController.getBrandPage);
router.post('/addBrand', adminAuth, uploadSingleImage, handleMulterErrors, brandController.addBrand);
router.post('/editBrand', adminAuth, uploadSingleImage, handleMulterErrors, brandController.editBrand);
router.post('/deleteBrand', adminAuth, brandController.deleteBrand);

// Product management
router.get('/products', adminAuth, productController.getProductPage);
router.get('/addProduct', adminAuth, productController.addProductPage);
router.post('/addProduct', adminAuth, uploadMultipleImages, handleMulterErrors, productController.addProduct);
router.get('/editProduct', adminAuth, productController.editProductPage);
router.post('/editProduct', adminAuth, uploadMultipleImages, handleMulterErrors, productController.editProduct);
router.get('/deleteProduct', adminAuth, productController.deleteProduct);

module.exports = router;