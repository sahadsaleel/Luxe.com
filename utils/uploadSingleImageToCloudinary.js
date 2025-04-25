const cloudinary = require('../config/cloudinary');

const uploadSingleImageToCloudinary = async (file, folder) => {
    try {
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(file.buffer);
        });
        return result;
    } catch (error) {
        throw new Error(`Cloudinary upload failed: ${error.message}`);
    }
};

module.exports = uploadSingleImageToCloudinary;