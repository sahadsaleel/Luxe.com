const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema')
const Brand = require('../../models/brandSchema')


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


const searchProduct = async (req,res)=>{
      try {
        const { query } = req.query;

        if (!query) {
            return res.json([]);
        }

        const products = await Product.find({
            $and: [
                { status: 'listed' },
                { isDeleted: false },
                {
                    $or: [
                        { productName: { $regex: query, $options: 'i' } },{ 
                            productCategory: {
                                $in: await Category.find({ 
                                    name: { $regex: query, $options: 'i' } 
                                }).distinct('_id')
                            }},
                        { 
                            productBrand: {
                                $in: await Brand.find({ 
                                    brandName: { $regex: query, $options: 'i' } 
                                }).distinct('_id')
                            }
                        }
                    ]
                }
            ]
        })
        .populate('productCategory', 'name')
        .populate('productBrand', 'brandName')
        .select('productName productImage productCategory productBrand variants')
        .limit(10);

        res.json(products);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

module.exports = { 
    productViewPage, 
    searchProduct
 };