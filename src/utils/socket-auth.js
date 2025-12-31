import User from "../../database/models/user.model.js";
import { status } from "./constant/enums.js";
import jwt from "jsonwebtoken";
import Token from "../../database/models/token.model.js";

/**
 * *** Socket.io Authentication Middleware
 * *** Verifies JWT token from socket handshake
 */
export const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.token;

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // Determine which secret key to use based on token prefix
    // For simplicity, we'll check if token starts with a known prefix
    let decoded;

    try {
      // Try with main secret key first
      decoded = jwt.verify(token, process.env.SECRET_KEY);
    } catch (err) {
      // Try with reset password secret key
      try {
        decoded = jwt.verify(token, process.env.SECRETKEYRESETPASS);
      } catch (resetErr) {
        return next(new Error("Invalid or expired token"));
      }
    }
    
    // ===> Verify the token payload has required fields
    if (!decoded._id) {
      return next(new Error("Invalid token payload"));
    }

    // ===> Verify token exists in database
    const dbToken = await Token.findOne({
      token,
      userId: decoded._id,
      isValid: true,
    });

    if (!dbToken || new Date() > dbToken.expiresAt) {
      return next(new Error("Token is invalid or has expired"));
    }

    // ===> Get user details
    const user = await User.findOne({
      _id: decoded._id,
      status: status.VERIFIED,
    }).select("-password");

    if (!user || !user.isActive) {
      return next(new Error("User not found or inactive"));
    }

    // ===> Attach user to socket
    socket.user = user;
    socket.userId = user._id.toString();

    next();
  } catch (error) {
    next(new Error("Authentication failed: " + error.message));
  }
};

