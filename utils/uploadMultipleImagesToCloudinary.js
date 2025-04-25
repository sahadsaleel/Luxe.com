const cloudinary = require('../config/cloudinary');

const uploadMultipleImagesToCloudinary = async (files, folder) => {
    const uploadPromises = files.map(file => {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(file.buffer);
        });
    });
    return Promise.all(uploadPromises);
};

module.exports = uploadMultipleImagesToCloudinary;