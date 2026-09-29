const mongoose = require("mongoose");

// Cashfree Order Schema for Premium Membership
const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESSFUL", "FAILED"],
      default: "PENDING",
      trim: true
    },
    paymentSessionId: {
      type: String,
      trim: true
    },
    // Optional metadata for additional tracking & backwards compatibility
    email: {
      type: String,
      lowercase: true,
      trim: true
    }
  },
  { timestamps: true }
);

// Pre-validate hook to support backwards-compatible field names (orderid, paymentid)
orderSchema.pre("validate", function () {
  if (!this.orderId && this.get("orderid")) {
    this.orderId = this.get("orderid");
  }
  if (!this.paymentSessionId && this.get("paymentid")) {
    this.paymentSessionId = this.get("paymentid");
  }
  if (this.amount === undefined || this.amount === null) {
    this.amount = 199.00;
  }
});

// Backward-compatibility virtual getters/setters
orderSchema.virtual("orderid")
  .get(function () { return this.orderId; })
  .set(function (val) { this.orderId = val; });

orderSchema.virtual("paymentid")
  .get(function () { return this.paymentSessionId; })
  .set(function (val) { this.paymentSessionId = val; });

// Indexes for high-performance querying
orderSchema.index({ userId: 1 });
orderSchema.index({ email: 1 });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);

