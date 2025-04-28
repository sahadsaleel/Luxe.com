// const User = require('../../models/userSchema');
// const Product = require('../../models/productSchema');



// const addToCart = async (req, res) => {
//   try {
//     const { productId, variantId } = req.body;
//     const userId = req.session.user;

//     if (!productId || !variantId) {
//       return res.status(400).json({ success: false, message: 'Product ID and Variant ID are required' });
//     }

//     // Verify product and variant exist
//     const product = await Product.findById(productId);
//     if (!product || product.status !== 'listed') {
//       return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
//     }

//     const variant = product.variants.find(v => v._id.toString() === variantId);
//     if (!variant) {
//       return res.status(404).json({ success: false, message: 'Variant not found' });
//     }

//     // Update user's cart
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }

//     // Check if the product variant is already in the cart
//     const cartItem = user.cart.find(item => item.productId.toString() === productId && item.variantId.toString() === variantId);
//     if (cartItem) {
//       cartItem.quantity += 1;
//     } else {
//       user.cart.push({ productId, variantId, quantity: 1 });
//     }

//     await user.save();
//     res.json({ success: true, message: 'Product added to cart' });
//   } catch (error) {
//     console.error('Error adding to cart:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };

// const addToWishlist = async (req, res) => {
//   try {
//     const { productId } = req.body;
//     const userId = req.session.user;

//     if (!productId) {
//       return res.status(400).json({ success: false, message: 'Product ID is required' });
//     }

//     // Verify product exists
//     const product = await Product.findById(productId);
//     if (!product || product.status !== 'listed') {
//       return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
//     }

//     // Update user's wishlist
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }

//     const isInWishlist = user.wishlist.includes(productId);
//     if (isInWishlist) {
//       user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
//       await user.save();
//       res.json({ success: true, message: 'Product removed from wishlist' });
//     } else {
//       user.wishlist.push(productId);
//       await user.save();
//       res.json({ success: true, message: 'Product added to wishlist' });
//     }
//   } catch (error) {
//     console.error('Error updating wishlist:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };

// module.exports = {
//   addToCart,
//   addToWishlist,
// };