import { catchAsyncError } from "../../utils/catch-error.js";
import Conversation from "./../../../database/models/conversation.model.js";
import User from "./../../../database/models/user.model.js";
import { AppError } from "../../utils/catch-error.js";
import Message from './../../../database/models/message.model.js';

/**
 * Get all conversations for the authenticated user
 */
export const getConversations = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;

  const conversations = await Conversation.find({
    participants: userId,
  })
    .populate("participants", "userName email image role")
    .populate({
      path: "lastMessage",
      populate: {
        path: "senderId",
        select: "userName image",
      },
    })
    .sort({ lastMessageAt: -1 });

  // Transform to include unread count for current user
  const conversationsWithUnread = conversations.map((conv) => {
    const convObj = conv.toObject();
    convObj.unreadCount = conv.unreadCount.get(userId.toString()) || 0;
    convObj.isArchived = conv.isArchived.get(userId.toString()) || false;
    return convObj;
  });

  res.status(200).json({
    success: true,
    data: conversationsWithUnread,
  });
});

/**
 * Get or create a conversation between two users
 */
export const getOrCreateConversation = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;
  const { otherUserId } = req.params;

  if (!otherUserId) {
    throw new AppError("Other user ID is required", 400);
  }

  if (userId.toString() === otherUserId) {
    throw new AppError("Cannot create conversation with yourself", 400);
  }

  // Verify other user exists
  const otherUser = await User.findById(otherUserId);
  if (!otherUser) {
    throw new AppError("User not found", 404);
  }

  // Find or create conversation
  const conversation = await Conversation.findOrCreateConversation(
    userId,
    otherUserId
  );

  await conversation.populate("participants", "userName email image role");
  if (conversation.lastMessage) {
    await conversation.populate({
      path: "lastMessage",
      populate: {
        path: "senderId",
        select: "userName image",
      },
    });
  }

  const convObj = conversation.toObject();
  convObj.unreadCount = conversation.unreadCount.get(userId.toString()) || 0;
  convObj.isArchived = conversation.isArchived.get(userId.toString()) || false;

  res.status(200).json({
    success: true,
    data: convObj,
  });
});

/**
 * Get messages for a conversation
 */
export const getMessages = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  // Verify user is part of conversation
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new AppError("Conversation not found", 404);
  }

  if (!conversation.participants.includes(userId)) {
    throw new AppError("Not authorized to view this conversation", 403);
  }

  // Get messages (exclude deleted messages for this user)
  const skip = (page - 1) * limit;
  const messages = await Message.find({
    conversationId,
    deletedFor: { $ne: userId },
  })
    .populate("senderId", "userName email image role")
    .populate("receiverId", "userName email image role")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip);

  // Mark messages as read
  const unreadMessageIds = messages
    .filter((msg) => msg.receiverId._id.toString() === userId.toString() && !msg.isRead)
    .map((msg) => msg._id);

  if (unreadMessageIds.length > 0) {
    await Message.updateMany(
      { _id: { $in: unreadMessageIds } },
      { isRead: true, readAt: new Date() }
    );

    // Reset unread count
    conversation.unreadCount.set(userId.toString(), 0);
    await conversation.save();
  }

  // Get total count
  const totalMessages = await Message.countDocuments({
    conversationId,
    deletedFor: { $ne: userId },
  });

  res.status(200).json({
    success: true,
    data: {
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalMessages,
        pages: Math.ceil(totalMessages / limit),
      },
    },
  });
});

/**
 * Get users available for chat (for staff/doctor/owner to see pet owners)
 */
export const getAvailableUsers = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;
  const userRole = req.authUser.role;
  const { role, search } = req.query;

  let query = { status: "verified", isActive: true };

  // Staff, doctor, owner can chat with pet owners
  if (["staff", "doctor", "owner", "admin"].includes(userRole)) {
    if (role) {
      query.role = role;
    } else {
      query.role = "petOwner";
    }
  } else if (userRole === "petOwner") {
    // Pet owners can chat with staff, doctors, owner, admin
    query.role = { $in: ["staff", "doctor", "owner", "admin"] };
  }

  // Search by name or email
  if (search) {
    query.$or = [
      { userName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(query)
    .select("userName email image role")
    .limit(50);

  res.status(200).json({
    success: true,
    data: users,
  });
});

/**
 * Delete a message
 */
export const deleteMessage = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;
  const { messageId } = req.params;

  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError("Message not found", 404);
  }

  // Only sender or receiver can delete
  if (
    message.senderId.toString() !== userId.toString() &&
    message.receiverId.toString() !== userId.toString()
  ) {
    throw new AppError("Not authorized to delete this message", 403);
  }

  // Add user to deletedFor array (soft delete)
  if (!message.deletedFor.includes(userId)) {
    message.deletedFor.push(userId);
    await message.save();
  }

  res.status(200).json({
    success: true,
    message: "Message deleted successfully",
  });
});

/**
 * Archive/unarchive a conversation
 */
export const toggleArchiveConversation = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;
  const { conversationId } = req.params;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new AppError("Conversation not found", 404);
  }

  if (!conversation.participants.includes(userId)) {
    throw new AppError("Not authorized", 403);
  }

  const currentStatus = conversation.isArchived.get(userId.toString()) || false;
  conversation.isArchived.set(userId.toString(), !currentStatus);
  await conversation.save();

  res.status(200).json({
    success: true,
    data: {
      isArchived: !currentStatus,
    },
  });
});


/**
 * Clear all chats for current user (soft delete messages only for him)
 */
export const clearAllChats = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;

  // Get all conversations user participates in
  const conversations = await Conversation.find({
    participants: userId,
  }).select("_id");

  const conversationIds = conversations.map((c) => c._id);

  if (conversationIds.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No chats to clear",
    });
  }

  // Soft delete all messages for this user
  await Message.updateMany(
    {
      conversationId: { $in: conversationIds },
      deletedFor: { $ne: userId },
    },
    {
      $addToSet: { deletedFor: userId },
    }
  );

  // Reset unread counts & unarchive
  await Conversation.updateMany(
    { _id: { $in: conversationIds } },
    {
      $set: {
        [`unreadCount.${userId}`]: 0,
        [`isArchived.${userId}`]: false,
      },
    }
  );

  res.status(200).json({
    success: true,
    message: "All chats cleared successfully",
  });
});
