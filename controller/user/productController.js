const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');




const productViewPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.query.id;

   
    const product = await Product.findById(productId)
      .populate('productBrand') 
      .populate('productCategory'); 

    if (!product) {
      return res.redirect('/pageNotFound');
    }


    const similarProducts = await Product.find({
      $or: [
        { productBrand: product.productBrand?._id }, 
        { productCategory: product.productCategory?._id }
      ],
      _id: { $ne: product._id }, 
      isDeleted: false 
    })
      .populate('productBrand')
      .populate('productCategory')
      .limit(3); 
    
    res.render('user/productViewPage', {
      user: userData,
      product: product,
      brand: product.productBrand ,
      category: product.productCategory ,
      variants: product.variants ,
      similarProducts: similarProducts
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.redirect('/pageNotFound');
  }
};

module.exports = {
  productViewPage,
};