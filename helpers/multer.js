// Luxe.com/middleware/multerConfig.js
const multer = require('multer');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  }
});

const uploadSingleImage = upload.single('image');
const uploadMultipleImages = upload.array('images', 10); 

module.exports = { uploadSingleImage, uploadMultipleImages };