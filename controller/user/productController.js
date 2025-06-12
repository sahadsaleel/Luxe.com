const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema')



const productViewPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.query.id;

    let userData = null;
    let wishlist = null;
    let isInWishlist = false;

    if (userId) {
      userData = await User.findById(userId);
      wishlist = await Wishlist.findOne({ userId }).populate('products.productId');
      if (wishlist && wishlist.products.some(p => p.productId._id.toString() === productId)) {
        isInWishlist = true;
      }
    }

    const product = await Product.findById(productId)
      .populate('productBrand', 'brandName offers')
      .populate('productCategory', 'name offers')
      .populate('offers');

    if (!product) {
      return res.redirect('/pageNotFound');
    }

    const activeOffers = await Offer.find({
      status: 'Active',
      endDate: { $gt: new Date() },
    });

    const basePrice = product.variants && product.variants.length > 0
      ? product.variants[0].salePrice
      : 0;

    let bestOffer = null;
    let discountedPrice = basePrice;

    const productOffers = activeOffers.filter(offer =>
      offer.offerType === 'product' && offer.targetId.toString() === product._id.toString()
    );
    const categoryOffers = activeOffers.filter(offer =>
      offer.offerType === 'categories' && product.productCategory && offer.targetId.toString() === product.productCategory._id.toString()
    );
    const brandOffers = activeOffers.filter(offer =>
      offer.offerType === 'brand' && product.productBrand && offer.targetId.toString() === product.productBrand._id.toString()
    );

    const allOffers = [...productOffers, ...categoryOffers, ...brandOffers];
    if (allOffers.length > 0) {
      bestOffer = allOffers.reduce((best, offer) => (offer.discount > best.discount ? offer : best), allOffers[0]);
      discountedPrice = basePrice - (basePrice * bestOffer.discount / 100);
    }

    const variants = product.variants.map(variant => {
      const variantBasePrice = variant.salePrice;
      const variantDiscountedPrice = bestOffer ? variantBasePrice - (variantBasePrice * bestOffer.discount / 100) : variantBasePrice;
      return {
        ...variant.toObject(),
        discountedPrice: variantDiscountedPrice,
      };
    });

    const similarProducts = await Product.find({
      $or: [
        { productBrand: product.productBrand?._id },
        { productCategory: product.productCategory?._id },
      ],
      _id: { $ne: product._id },
      isDeleted: false,
      'variants.quantity': { $gt: 0 },
    })
      .populate('productBrand', 'brandName')
      .populate('productCategory', 'name')
      .limit(4)
      .sort({ createdAt: -1 });

    const similarProductsWithOffers = similarProducts.map(product => {
      const basePrice = product.variants && product.variants.length > 0
        ? (product.variants[0].salePrice > 0 ? product.variants[0].salePrice : product.variants[0].regularPrice)
        : 0;

      let bestOffer = null;
      let discountedPrice = basePrice;

      const productOffers = activeOffers.filter(offer =>
        offer.offerType === 'product' && offer.targetId.toString() === product._id.toString()
      );
      const categoryOffers = activeOffers.filter(offer =>
        offer.offerType === 'categories' && product.productCategory && offer.targetId.toString() === product.productCategory._id.toString()
      );
      const brandOffers = activeOffers.filter(offer =>
        offer.offerType === 'brand' && product.productBrand && offer.targetId.toString() === product.productBrand._id.toString()
      );

      const allOffers = [...productOffers, ...categoryOffers, ...brandOffers];
      if (allOffers.length > 0) {
        bestOffer = allOffers.reduce((best, offer) => (offer.discount > best.discount ? offer : best), allOffers[0]);
        discountedPrice = basePrice - (basePrice * bestOffer.discount / 100);
      }

      return {
        ...product.toObject(),
        price: basePrice,
        discountedPrice,
        offers: productOffers,
        category: {
          ...product.productCategory,
          offers: categoryOffers,
        },
        brand: {
          ...product.productBrand,
          offers: brandOffers,
        },
      };
    });

    res.render('user/productViewPage', {
      user: userData || null,
      product: {
        ...product.toObject(),
        price: basePrice,
        discountedPrice,
        offers: productOffers,
        category: {
          ...product.productCategory,
          offers: categoryOffers,
        },
        brand: {
          ...product.productBrand,
          offers: brandOffers,
        },
        variants,
      },
      brand: product.productBrand || {},
      category: product.productCategory || {},
      variants,
      similarProducts: similarProductsWithOffers,
      wishlist: wishlist || { products: [] },
      isInWishlist,
    });
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.redirect('/pageNotFound');
  }
};


const searchProduct = async (req, res) => {
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
            { productName: { $regex: query, $options: 'i' } },
            {
              productCategory: {
                $in: await Category.find({
                  name: { $regex: query, $options: 'i' },
                }).distinct('_id'),
              },
            },
            {
              productBrand: {
                $in: await Brand.find({
                  brandName: { $regex: query, $options: 'i' },
                }).distinct('_id'),
              },
            },
          ],
        },
      ],
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
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user;
    const { currentPageUrl } = req.body; 

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to add to wishlist',
      });
    }

    const product = await Product.findOne({
      _id: productId,
      isDeleted: false,
      status: 'listed',
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or unavailable',
      });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (wishlist) {
      const itemExists = wishlist.products.some(
        (item) => item.productId.toString() === productId
      );
      if (itemExists) {
        return res.status(400).json({
          success: false,
          message: 'Product already in wishlist',
        });
      }
      wishlist.products.push({ productId });
      await wishlist.save();
    } else {
      wishlist = await Wishlist.create({
        userId,
        products: [{ productId }],
      });
    }

    res.status(200).json({
      success: true,
      message: 'Added to wishlist',
      data: wishlist,
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add to wishlist. Please try again.',
    });
  }
};

const loadWishlistPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const userData = await User.findById(userId);
    const wishlist = await Wishlist.findOne({ userId }).populate('products.productId');

    res.render('user/userWishlist', {
      user: userData || null,
      wishlist: wishlist || { products: [] },
    });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.redirect('/pageNotFound');
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user;
    const { currentPageUrl } = req.body; 
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to remove from wishlist',
      });
    }

    const wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found',
      });
    }

    const itemExists = wishlist.products.some(
      (item) => item.productId.toString() === productId
    );

    if (!itemExists) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in wishlist',
      });
    }

    wishlist.products = wishlist.products.filter(
      (item) => item.productId.toString() !== productId
    );
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Removed from wishlist',
      data: wishlist,
    });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove from wishlist. Please try again.',
    });
  }
};

module.exports = {
  productViewPage,
  searchProduct,
  addToWishlist,
  loadWishlistPage,
  removeFromWishlist,
};