const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  balance: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: function(v) {
        return v >= 0;
      },
      message: 'Balance cannot be negative'
    }
  },
  currency: {
    type: String,
    default: "INR"
  },
//   finalAmount: {
//     type: Number,
//     required: true,
//   },
//   giftWrappingAmount: {
//     type: Number,
//     default: 0,
//   },
//   deliveryAmount: {
//     type: Number,
//     default: 0,
//   },
//   orderedItems: [{
//     productId: { type: Schema.Types.ObjectId, ref: 'Product' },
//     variantId: { type: Schema.Types.ObjectId },
//     quantity: { type: Number },
//     price: { type: Number },
//     totalPrice: { type: Number },
//     status: { type: String, default: 'Active' },
//     returnReason: { type: String },
//     returnComments: { type: String },
//     returnRequestedOn: { type: Date },
//     returnApprovedOn: { type: Date },
//   }],
  transactions: [{
    orderId: {
      type: String,
      required: false
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
      default: () => Math.random().toString(36).substr(2, 9),
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) {
          return v > 0;
        },
        message: 'Transaction amount must be positive'
      }
    },
    type: {
      type: String,
      enum: ["Credit", "Debit"],
      required: true
    },
    method: {
      type: String,
      enum: ["Razorpay", "Cashback", "Refund", "OrderPayment", "ReferralBonus", "SignupBonus", "CancelRefund", "ReturnRefund"],
      required: true
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending"
    },
    metadata: {
      orderId: String,
      orderItemId: String,
      refundReason: String,
      refundType: {
        type: String,
        enum: ["Cancel", "Return", "Admin", "Other"]
      }
    },
    date: {
      type: Date,
      default: Date.now
    },
    description: {
      type: String,
      default: "No description provided"
    }
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save hook to update lastUpdated
walletSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Method to add transaction
walletSchema.methods.addTransaction = async function(transactionData) {
  try {
    // Validate transaction amount
    if (!transactionData.amount || transactionData.amount <= 0) {
      throw new Error('Invalid transaction amount');
    }

    // Calculate new balance
    const newBalance = transactionData.type === 'Credit' 
      ? this.balance + transactionData.amount
      : this.balance - transactionData.amount;

    // Check if debit would make balance negative
    if (newBalance < 0) {
      throw new Error('Insufficient balance for debit transaction');
    }

    // Add transaction
    this.transactions.push(transactionData);
    this.balance = newBalance;
    this.lastUpdated = new Date();

    await this.save();
    return true;
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
};

const Wallet = mongoose.model('wallet', walletSchema);
module.exports = Wallet;