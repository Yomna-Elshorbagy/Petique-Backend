import { Router } from "express";
import { isAuthenticated } from "../../middelwares/auth.js";
import * as chatController from "./chat.controller.js";

const chatRouter = Router();

// ===> All routes require authentication
chatRouter.use(isAuthenticated);

// ===> Get all conversations for current user
chatRouter.get("/conversations", chatController.getConversations);

// ===> Get or create conversation with a user
chatRouter.get("/conversations/:otherUserId", chatController.getOrCreateConversation);

// ===> Get messages for a conversation
chatRouter.get("/conversations/:conversationId/messages", chatController.getMessages);

// ===> Get available users for chat
chatRouter.get("/users", chatController.getAvailableUsers);

// ===> Delete a message
chatRouter.delete("/messages/:messageId", chatController.deleteMessage);

// ===> Archive/unarchive conversation
chatRouter.patch("/conversations/:conversationId/archive", chatController.toggleArchiveConversation);

export default chatRouter;


