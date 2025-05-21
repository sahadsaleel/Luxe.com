const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const Offer = require("../../models/offerSchema");

// Load offer page
const offerPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const search = req.query.search || "";
    const skip = limit * (page - 1);

    // Fetch active products, categories, and brands for dropdowns
    const products = await Product.find({ isBlocked: false }).lean();
    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({ isListed: true }).lean();

    // Search query for offers
    const query = search
      ? {
          $or: [
            { offerName: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
          status: "Active",
        }
      : { status: "Active" };

    // Fetch offers with populated targetId field
    const offers = await Offer.find(query)
      .populate({
        path: "targetId",
        select: "name",
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const totalOffers = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    res.render("offer", {
      products,
      categories,
      brands,
      offers,
      currentPage: page,
      totalPages,
      search,
    });
  } catch (error) {
    console.error("Error loading offer page:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add new offer
const addOffer = async (req, res) => {
  try {
    const {
      offerName,
      description,
      offerType,
      itemSelect,
      startDate,
      endDate,
      discount,
    } = req.body;

    // Check if offer already exists
    const existingOffer = await Offer.findOne({ offerName });
    if (existingOffer) {
      return res.status(409).json({ success: false, message: "Offer already exists" });
    }

    // Validate dates
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: "End date must be after start date" });
    }

    // Validate discount
    if (discount <= 0 || discount > 100) {
      return res.status(400).json({ success: false, message: "Discount must be between 0 and 100" });
    }

    const newOffer = new Offer({
      offerName,
      description,
      offerType,
      targetId: itemSelect,
      startDate,
      endDate,
      discount,
      status: "Active",
    });

    await newOffer.save();
    res.json({ success: true, message: "Offer added successfully" });
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).json({ success: false, message: "Failed to add offer" });
  }
};

// Get single offer
const getOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate({
        path: "targetId",
        select: "name",
      })
      .lean();

    if (!offer || offer.status === "Disabled") {
      return res.status(404).json({ error: "Offer not found" });
    }

    res.json(offer);
  } catch (error) {
    console.error("Error fetching offer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Edit offer
const editOffer = async (req, res) => {
  try {
    const {
      eofferName,
      edescription,
      eofferType,
      eitemSelect,
      estartDate,
      eendDate,
      ediscount,
      eofferId,
    } = req.body;

    const offer = await Offer.findById(eofferId);
    if (!offer || offer.status === "Disabled") {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Validate dates
    if (new Date(estartDate) > new Date(eendDate)) {
      return res.status(400).json({ success: false, message: "End date must be after start date" });
    }

    // Validate discount
    if (ediscount <= 0 || ediscount > 100) {
      return res.status(400).json({ success: false, message: "Discount must be between 0 and 100" });
    }

    // Check for duplicate offerName (excluding current offer)
    const existingOffer = await Offer.findOne({ offerName: eofferName, _id: { $ne: eofferId } });
    if (existingOffer) {
      return res.status(409).json({ success: false, message: "Offer name already exists" });
    }

    offer.offerName = eofferName;
    offer.description = edescription;
    offer.offerType = eofferType;
    offer.targetId = eitemSelect;
    offer.startDate = estartDate;
    offer.endDate = eendDate;
    offer.discount = ediscount;

    await offer.save();
    res.json({ success: true, message: "Offer updated successfully" });
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(500).json({ success: false, message: "Failed to update offer" });
  }
};

// Disable offer
const disableOffer = async (req, res) => {
  try {
    const { offerId } = req.body;
    const offer = await Offer.findById(offerId);
    if (!offer || offer.status === "Disabled") {
      return res.status(404).json({ error: "Offer not found" });
    }

    offer.status = "Disabled";
    await offer.save();
    res.json({ success: true, message: "Offer disabled successfully" });
  } catch (error) {
    console.error("Error disabling offer:", error);
    res.status(500).json({ success: false, message: "Failed to disable offer" });
  }
};

// Enable offer
const enableOffer = async (req, res) => {
  try {
    const { offerId } = req.body;
    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    offer.status = "Active";
    await offer.save();
    res.json({ success: true, message: "Offer enabled successfully" });
  } catch (error) {
    console.error("Error enabling offer:", error);
    res.status(500).json({ success: false, message: "Failed to enable offer" });
  }
};

// Fetch items for applicableTo dropdown based on offerType
const getApplicableItems = async (req, res) => {
  try {
    const { offerType } = req.params;
    let items;

    switch (offerType.toLowerCase()) {
      case "product":
        items = await Product.find({ isBlocked: false }).select("name _id").lean();
        break;
      case "category":
        items = await Category.find({ isListed: true }).select("name _id").lean();
        break;
      case "brand":
        items = await Brand.find({ isListed: true }).select("name _id").lean();
        break;
      default:
        return res.status(400).json({ error: "Invalid offer type" });
    }

    res.json(items);
  } catch (error) {
    console.error(`Error fetching ${offerType} items:`, error);
    res.status(500).json({ error: `Failed to fetch ${offerType} items` });
  }
};

module.exports = {
  offerPage,
  addOffer,
  getOffer,
  editOffer,
  disableOffer,
  enableOffer,
  getApplicableItems,
};