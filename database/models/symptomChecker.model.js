import mongoose from "mongoose";

const symptomCheckerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pet",
      required: true,
    },
    symptoms: {
      appetite: {
        type: String,
        enum: ["normal", "decreased", "none", "increased"],
        required: true,
      },
      energy: {
        type: String,
        enum: ["normal", "low", "very_low", "high"],
        required: true,
      },
      vomiting: {
        type: Boolean,
        required: true,
      },
      age: {
        type: String,
        required: true,
      },
      additionalNotes: {
        type: String,
        default: "",
      },
    },
    aiAnalysis: {
      recommendation: {
        type: String,
        enum: ["emergency", "appointment", "home_care"],
        required: true,
      },
      urgency: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        required: true,
      },
      explanation: {
        type: String,
        required: true,
      },
      suggestedActions: [String],
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    resolvedAt: Date,
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for faster queries
symptomCheckerSchema.index({ user: 1, createdAt: -1 });
symptomCheckerSchema.index({ pet: 1 });

export default mongoose.model("SymptomChecker", symptomCheckerSchema);
