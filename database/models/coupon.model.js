import mongoose from "mongoose";
import { couponTypes } from "../../src/utils/constant/enums.js";

let couponSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowerCase: true,
    },
    type: {
      type: String,
      enum: Object.values(couponTypes),
      required: true,
      default: couponTypes.FIXED_AMOUNT,
    },
    fromDate: {
      type: Date,
      default: Date.now,
    },
    expire: {
      type: Date,
      default: Date.now() + 24 * 60 * 60 * 1000,
      validate: {
        validator: function (value) {
          return value > Date.now();
        },
        message: "Expiration date must be in the future",
      },
    },
    discount: {
      type: Number,
      min: 1,
    },
    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        count: { type: Number, default: 1 },
      },
    ],
    maxUsage: {
      type: Number,
      default: 1000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

let Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
