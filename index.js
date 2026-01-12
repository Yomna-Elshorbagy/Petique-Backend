import express from "express";
import { json } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { bootstrap } from "./src/modules/bootstrap.js";
import { webhookStripe } from "./src/utils/webHook.js";
import { socketAuth } from "./src/utils/socket-auth.js";
import { initializeSocketHandlers } from "./src/utils/socket-handlers.js";

const app = express();

const port = process.env.PORT || 3000;

// ===> 1- Create HTTP server
const httpServer = createServer(app);

// ===> 2- Initialize Socket.io with CORS configuration
const socketAllowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ];

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || socketAllowedOrigins
        : socketAllowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// ===> 3- Socket.io authentication middleware
io.use(socketAuth);

// ===> 4- Initialize socket handlers
initializeSocketHandlers(io);

// CORS configuration - allow multiple origins in development
// MUST be applied BEFORE other middleware to handle preflight OPTIONS requests
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        process.env.NODE_ENV === "development"
      ) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all in development, restrict in production
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "authentication",
      "accessToken",
      "X-Requested-With",
      "x-client-user-agent",
      "X-Client-User-Agent",
    ],
    exposedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Stripe webhook must be before json() middleware (needs raw body)
app.post("/webHook", express.raw({ type: "application/json" }), webhookStripe);

// Body parsing middleware
app.use(json());
app.get("/", (req, res) => {
  res.json({
    message: `Welcom to ${process.env.APPLICATION_NAME} Backend ❤️`,
  });
});
bootstrap(app);

// Use httpServer instead of app.listen
httpServer.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}!`);
  console.log(`📡 Socket.io server initialized`);
});
