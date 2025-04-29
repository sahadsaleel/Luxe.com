const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema')


const productViewPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.query.id;

 
    let userData = null;
    if (userId) {
      userData = await User.findById(userId);
    }



    const product = await Product.findById(productId)
      .populate('productBrand') 
      .populate('productCategory'); 

    if (!product) {
      return res.redirect('/pageNotFound');
    }

  
    const similarProducts = await Product.find({
      $or: [
        { productBrand: product.productBrand?._id }, 
        { productCategory: product.productCategory?._id }, 
      ],
      _id: { $ne: product._id }, 
      isDeleted: false, 
      'variants.quantity': { $gt: 0 },
    })
      .populate('productBrand')
      .populate('productCategory')
      .limit(4) 
      .sort({ createdAt: -1 });

    
    res.render('user/productViewPage', {
      user: userData || null, 
      product,
      brand: product.productBrand || {}, 
      category: product.productCategory || {}, 
      variants: product.variants || [], 
      similarProducts,
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.redirect('/pageNotFound');
  }
};

module.exports = { 
  productViewPage
 };