import Message from "../../database/models/message.model.js";
import Conversation from "../../database/models/conversation.model.js";

/**
 * *** Socket.io Event Handlers
 */
export const initializeSocketHandlers = (io) => {
  // ===> Store active users: { userId: socketId }
  const activeUsers = new Map();

  // ===> Helper function to get socket ID by user ID
  const getSocketId = (userId) => {
    return activeUsers.get(userId.toString());
  };

  // ===> Helper function to emit to a specific user
  const emitToUser = (userId, event, data) => {
    const socketId = getSocketId(userId);
    if (socketId) {
      io.to(socketId).emit(event, data);
    }
  };

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    const userRole = socket.user.role;

    console.log(`✅ User connected: ${socket.user.userName} (${userId}) - Role: ${userRole}`);

    // ==> Store user as active
    activeUsers.set(userId, socket.id);

    // ==> Join user's personal room
    socket.join(`user_${userId}`);

    // ==> Join role-based rooms for admin/owner/staff
    if (["admin", "owner", "staff", "doctor"].includes(userRole)) {
      socket.join(`role_${userRole}`);
      socket.join("clinic_staff"); // All clinic staff in one room
    }

    // ==> Emit online status to all users
    io.emit("user_online", { userId, isOnline: true });

    /**
     * *** Handle joining a conversation room
     */
    socket.on("join_conversation", async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        
        if (!conversation || !conversation.participants.includes(userId)) {
          socket.emit("error", { message: "Conversation not found or access denied" });
          return;
        }

        socket.join(`conversation_${conversationId}`);
        socket.emit("joined_conversation", { conversationId });

        // ==> Mark messages as read when joining
        await Message.updateMany(
          {
            conversationId,
            receiverId: userId,
            isRead: false,
          },
          {
            isRead: true,
            readAt: new Date(),
          }
        );

        // ==> Reset unread count
        conversation.unreadCount.set(userId.toString(), 0);
        await conversation.save();

        // ==> Notify other participant
        const otherParticipant = conversation.participants.find(
          (p) => p.toString() !== userId
        );
        if (otherParticipant) {
          emitToUser(otherParticipant, "conversation_read", {
            conversationId,
            readBy: userId,
          });
        }
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    /**
     * *** Handle leaving a conversation room
     */
    socket.on("leave_conversation", ({ conversationId }) => {
      socket.leave(`conversation_${conversationId}`);
      socket.emit("left_conversation", { conversationId });
    });

    /**
     * *** Handle sending a message
     */
    socket.on("send_message", async (data) => {
      try {
        const { conversationId, receiverId, message, messageType = "text" } = data;

        if (!message || !message.trim()) {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        // 1- Find or create conversation
        let conversation = await Conversation.findById(conversationId);
        
        if (!conversation) {
          // Create new conversation
          conversation = await Conversation.findOrCreateConversation(
            userId,
            receiverId
          );
        }

        // 2-  Verify user is part of conversation
        if (!conversation.participants.includes(userId)) {
          socket.emit("error", { message: "Not authorized for this conversation" });
          return;
        }

        // 3- Create message
        const newMessage = await Message.create({
          conversationId: conversation._id,
          senderId: userId,
          receiverId,
          message: message.trim(),
          messageType,
        });

        // 4- Update conversation
        conversation.lastMessage = newMessage._id;
        conversation.lastMessageAt = new Date();

        // 5- Update unread count
        const currentUnread = conversation.unreadCount.get(receiverId.toString()) || 0;
        conversation.unreadCount.set(receiverId.toString(), currentUnread + 1);
        conversation.unreadCount.set(userId.toString(), 0); // Reset sender's unread

        await conversation.save();

        // 6- Populate sender details
        await newMessage.populate("sender", "userName email image role");

        // 7- Emit to conversation room
        io.to(`conversation_${conversation._id}`).emit("new_message", {
          message: newMessage,
          conversationId: conversation._id,
        });

        // 8- Also emit to sender and receiver's personal rooms
        emitToUser(userId, "message_sent", { message: newMessage });
        emitToUser(receiverId, "new_message", {
          message: newMessage,
          conversationId: conversation._id,
        });

        // 9- Emit conversation update to both participants
        const conversationData = await Conversation.findById(conversation._id)
          .populate("participants", "userName email image role")
          .populate("lastMessage");

        emitToUser(userId, "conversation_updated", conversationData);
        emitToUser(receiverId, "conversation_updated", conversationData);

      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: error.message });
      }
    });

    /**
     * *** Handle typing indicator
     */
    socket.on("typing_start", async ({ conversationId, receiverId }) => {
      emitToUser(receiverId, "user_typing", {
        conversationId,
        userId,
        isTyping: true,
      });
    });

    socket.on("typing_stop", async ({ conversationId, receiverId }) => {
      emitToUser(receiverId, "user_typing", {
        conversationId,
        userId,
        isTyping: false,
      });
    });

    /**
     * *** Handle message read receipt
     */
    socket.on("mark_as_read", async ({ conversationId, messageIds }) => {
      try {
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            receiverId: userId,
          },
          {
            isRead: true,
            readAt: new Date(),
          }
        );

        // ==> Update conversation unread count
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.unreadCount.set(userId.toString(), 0);
          await conversation.save();

          // ==> Notify other participant
          const otherParticipant = conversation.participants.find(
            (p) => p.toString() !== userId
          );
          if (otherParticipant) {
            emitToUser(otherParticipant, "messages_read", {
              conversationId,
              readBy: userId,
            });
          }
        }
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    /**
     * *** Handle disconnect
     */
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.user.userName} (${userId})`);
      
      // ==> Remove from active users
      activeUsers.delete(userId);

      // ==> Emit offline status
      io.emit("user_offline", { userId, isOnline: false });
    });

    /**
     * *** Handle get online users
     */
    socket.on("get_online_users", () => {
      const onlineUserIds = Array.from(activeUsers.keys());
      socket.emit("online_users", { users: onlineUserIds });
    });
  });

  return io;
};


