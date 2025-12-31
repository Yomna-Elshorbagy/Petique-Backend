import mongoose, { Schema } from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    isArchived: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to ensure unique conversations between two users
conversationSchema.index({ participants: 1 }, { unique: false });

// Index for sorting by last message
conversationSchema.index({ lastMessageAt: -1 });

// Method to find or create conversation between two users
conversationSchema.statics.findOrCreateConversation = async function (
  user1Id,
  user2Id
) {
  // Sort IDs to ensure consistent conversation lookup
  const sortedIds = [user1Id, user2Id].sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );

  let conversation = await this.findOne({
    participants: { $all: sortedIds, $size: 2 },
  });

  if (!conversation) {
    conversation = await this.create({
      participants: sortedIds,
      unreadCount: new Map([
        [sortedIds[0].toString(), 0],
        [sortedIds[1].toString(), 0],
      ]),
      isArchived: new Map([
        [sortedIds[0].toString(), false],
        [sortedIds[1].toString(), false],
      ]),
    });
  }

  return conversation;
};

// Virtual to populate participants
conversationSchema.virtual("participantsDetails", {
  ref: "User",
  localField: "participants",
  foreignField: "_id",
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
