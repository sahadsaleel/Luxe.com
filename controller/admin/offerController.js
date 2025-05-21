const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const Offer = require("../../models/offerSchema");

// Utility function to populate targetId based on offerType
const populateTargetId = async (offer) => {
  if (offer.offerType === "product") {
    offer.targetId = await Product.findById(offer.targetId)
      .select("productName")
      .lean();
  } else if (offer.offerType === "category") {
    offer.targetId = await Category.findById(offer.targetId)
      .select("name")
      .lean();
  } else if (offer.offerType === "brand") {
    offer.targetId = await Brand.findById(offer.targetId)
      .select("brandName")
      .lean();
  }
  return offer;
};

// Load offer page
const offerPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Increased limit for better UX
    const search = req.query.search || "";
    const sort = req.query.sort || "newest";
    const skip = limit * (page - 1);

    // Fetch products, categories, and brands for dropdowns
    const [products, categories, brands] = await Promise.all([
      Product.find({ isBlocked: false }).select("productName _id").lean(),
      Category.find({ isListed: true }).select("name _id").lean(),
      Brand.find({ isListed: true }).select("brandName _id").lean(),
    ]);

    // Build query for offers
    const query = search
      ? {
          $or: [
            { offerName: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const sortQuery = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "a-z": { offerName: 1 },
      "z-a": { offerName: -1 },
    }[sort] || { createdAt: -1 };

    // Fetch offers
    let offers = await Offer.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sortQuery)
      .lean();

    offers = await Promise.all(offers.map(populateTargetId));

    const totalOffers = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    res.render("admin/offers", {
      products,
      categories,
      brands,
      offers,
      currentPage: page,
      totalPages,
      search,
      sort,
    });
  } catch (error) {
    console.error("Error loading offer page:", error);
    res.status(500).render("error", {
      message: "Unable to load offers",
      error: error.message,
    });
  }
};

// Add new offer
const addOffer = async (req, res) => {
  try {
    const { offerName, description, offerType, itemSelect, startDate, endDate, discount } = req.body;

    // Validate required fields
    if (!offerName || !description || !offerType || !itemSelect || !startDate || !endDate || !discount) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Check for duplicate offer name
    const existingOffer = await Offer.findOne({ offerName });
    if (existingOffer) {
      return res.status(409).json({ success: false, message: "Offer name already exists" });
    }

    // Validate targetId based on offerType
    const isValidTarget = await validateTargetId(offerType, itemSelect);
    if (!isValidTarget) {
      return res.status(400).json({ success: false, message: `Invalid ${offerType} ID` });
    }

    const newOffer = new Offer({
      offerName,
      description,
      offerType,
      targetId: itemSelect,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      discount: parseFloat(discount),
      status: "Active",
    });

    await newOffer.save();
    res.json({ success: true, message: "Offer added successfully" });
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to add offer" });
  }
};

// Get single offer
const getOffer = async (req, res) => {
  try {
    let offer = await Offer.findById(req.params.id).lean();
    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found" });
    }

    offer = await populateTargetId(offer);
    res.json(offer);
  } catch (error) {
    console.error("Error fetching offer:", error);
    res.status(500).json({ success: false, message: "Failed to fetch offer" });
  }
};

// Edit offer
const editOffer = async (req, res) => {
  try {
    const { eofferId, eofferName, edescription, eofferType, eitemSelect, estartDate, eendDate, ediscount } = req.body;

    // Validate required fields
    if (!eofferId || !eofferName || !edescription || !eofferType || !eitemSelect || !estartDate || !eendDate || !ediscount) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const offer = await Offer.findById(eofferId);
    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found" });
    }

    // Check for duplicate offer name
    const existingOffer = await Offer.findOne({ offerName: eofferName, _id: { $ne: eofferId } });
    if (existingOffer) {
      return res.status(409).json({ success: false, message: "Offer name already exists" });
    }

    // Validate targetId
    const isValidTarget = await validateTargetId(eofferType, eitemSelect);
    if (!isValidTarget) {
      return res.status(400).json({ success: false, message: `Invalid ${eofferType} ID` });
    }

    // Update offer
    offer.offerName = eofferName;
    offer.description = edescription;
    offer.offerType = eofferType;
    offer.targetId = eitemSelect;
    offer.startDate = new Date(estartDate);
    offer.endDate = new Date(eendDate);
    offer.discount = parseFloat(ediscount);

    await offer.save();
    res.json({ success: true, message: "Offer updated successfully" });
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update offer" });
  }
};

// Disable offer
const disableOffer = async (req, res) => {
  try {
    const { offerId } = req.body;
    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found" });
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
      return res.status(404).json({ success: false, message: "Offer not found" });
    }

    offer.status = "Active";
    await offer.save();
    res.json({ success: true, message: "Offer enabled successfully" });
  } catch (error) {
    console.error("Error enabling offer:", error);
    res.status(500).json({ success: false, message: "Failed to enable offer" });
  }
};

const getApplicableItems = async (req, res) => {
    try {
        const { offerType } = req.params;
        let items = [];

        switch (offerType.toLowerCase()) {
            case "product":
                items = await Product.find({ isBlocked: false }).select("productName _id").lean();
                break;
            case "category":
                items = await Category.find({ isListed: true }).select("name _id").lean();
                break;
            case "brand":
                items = await Brand.find({ isBlocked: false }).select("brandName _id").lean();
                break;
            default:
                return res.status(400).json({ success: false, message: "Invalid offer type" });
        }

        res.json(items);
    } catch (error) {
        console.error(`Error fetching ${req.params.offerType} items:`, error);
        res.status(500).json({ success: false, message: `Failed to fetch ${req.params.offerType} items` });
    }
};

// Utility function to validate targetId
const validateTargetId = async (offerType, targetId) => {
  try {
    let model;
    switch (offerType.toLowerCase()) {
      case "product":
        model = Product;
        break;
      case "category":
        model = Category;
        break;
      case "brand":
        model = Brand;
        break;
      default:
        return false;
    }
    const item = await model.findById(targetId).lean();
    return !!item;
  } catch (error) {
    console.error(`Error validating targetId for ${offerType}:`, error);
    return false;
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