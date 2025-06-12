const mongoose = require("mongoose");
const { Schema } = mongoose;

const offerSchema = new Schema({
  offerName: {
    type: String,
    required: [true, "Offer name is required"],
    unique: true,
    trim: true,
    minlength: [3, "Offer name must be at least 3 characters"],
    maxlength: [100, "Offer name cannot exceed 100 characters"],
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
    minlength: [10, "Description must be at least 10 characters"],
    maxlength: [500, "Description cannot exceed 500 characters"],
  },
  discount: {
    type: Number,
    required: [true, "Discount percentage is required"],
    min: [1, "Discount must be at least 1%"],
    max: [80, "Discount cannot exceed 80%"],
    validate: {
      validator: function(value) {
        return value <= 80;
      },
      message: "Maximum discount allowed is 80%"
    }
  },
  startDate: {
    type: Date,
    required: [true, "Start date is required"],
  },
  endDate: {
    type: Date,
    required: [true, "End date is required"],
    validate: {
      validator: function (value) {
        return this.startDate < value;
      },
      message: "End date must be after start date",
    },
  },
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active",
  },
  offerType: {
    type: String,
    enum: ["product", "categories", "brand"],
    required: [true, "Offer type is required"],
  },
  targetId: {
    type: Schema.Types.ObjectId,
    required: [true, "Target ID is required"],
    refPath: "offerType",
  },
}, { timestamps: true });

offerSchema.pre("save", function (next) {
  const now = new Date();
  if (this.endDate < now && this.status === "Active") {
    this.status = "Inactive";
  }
  next();
});

const Offer = mongoose.model("Offer", offerSchema);
module.exports = Offer;