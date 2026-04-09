import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectToMongo, initializeDatabase, initializeAuthDatabase } from "./db.js";
import authRouter from "./routes/auth.js";
import companiesRouter from "./routes/companies.js";
import groupsRouter from "./routes/groups.js";
import ledgersRouter from "./routes/ledgers.js";
import itemsRouter from "./routes/items.js";
import batchAllocationsRouter from "./routes/batchAllocations.js";
import uomRouter from "./routes/uom.js";
import stockGroupsRouter from "./routes/stockGroups.js";
import stockCategoriesRouter from "./routes/stockCategories.js";
import vouchersRouter from "./routes/vouchers.js";
import settingsRouter from "./routes/settings.js";
import billsRouter from "./routes/bills.js";
import voucherTypesRouter from "./routes/voucherTypes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_CORS_ORIGINS = [
  "https://loopaccerp.netlify.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:3000",
];
const CORS_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Process-level error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Middleware
// CORS configuration: allow common local dev origins, and relax in non-production for easier testing
if (process.env.NODE_ENV === "production") {
  app.use(
    cors({
      origin: CORS_ORIGINS,
      credentials: true,
    }),
  );
} else {
  // In development allow any origin to simplify local testing
  app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Initialize database on startup (non-blocking)
let dbInitialized = false;
let dbInitPromise = null;
let dbLastInitError = null;
let dbLastInitFailureAt = 0;
const DB_INIT_RETRY_COOLDOWN_MS = 10000;

async function ensureDatabaseReady() {
  if (dbInitialized) {
    return;
  }

  const withinRetryCooldown =
    dbLastInitError &&
    Date.now() - dbLastInitFailureAt < DB_INIT_RETRY_COOLDOWN_MS;
  if (withinRetryCooldown) {
    throw dbLastInitError;
  }

  if (dbInitPromise) {
    await dbInitPromise;
    return;
  }

  dbInitPromise = (async () => {
    try {
      await initializeDatabase();
      await initializeAuthDatabase();
      dbInitialized = true;
      dbLastInitError = null;
      dbLastInitFailureAt = 0;
      console.log("Database initialized successfully");
      return;
    } catch (initError) {
      console.error("Failed full database initialization:", initError.message);

      // Fallback: if Mongo is reachable, allow requests even if index/setup had issues.
      try {
        await connectToMongo();
        dbInitialized = true;
        dbLastInitError = null;
        dbLastInitFailureAt = 0;
        console.warn(
          "MongoDB connection is available. Continuing with partial DB initialization.",
        );
      } catch (connectionError) {
        dbLastInitError = connectionError;
        dbLastInitFailureAt = Date.now();
        throw connectionError;
      }
    }
  })();

  try {
    await dbInitPromise;
  } finally {
    dbInitPromise = null;
  }
}

(async () => {
  try {
    console.log("Initializing database...");
    await ensureDatabaseReady();
  } catch (error) {
    console.error("Failed to initialize database:", error.message);
    // Continue - middleware will retry when API requests arrive.
  }
})();

// Middleware to ensure DB is initialized before handling requests
app.use(async (req, res, next) => {
  // Log API requests first
  if (req.path.startsWith("/api")) {
    console.log(
      `[API] ${req.method} ${req.originalUrl} - from ${req.ip || req.hostname}`,
    );
  }

  if (dbInitialized) {
    return next();
  }

  try {
    await ensureDatabaseReady();
    return next();
  } catch (error) {
    console.error("Failed to initialize database on request:", error.message);
    return res.status(500).json({
      success: false,
      message: "Database not available",
      error: error.message,
    });
  }
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/ledgers", ledgersRouter);
app.use("/api/items", itemsRouter);
app.use("/api/batch-allocations", batchAllocationsRouter);
app.use("/api/uom", uomRouter);
app.use("/api/stock-groups", stockGroupsRouter);
app.use("/api/stock-categories", stockCategoriesRouter);
app.use("/api/vouchers", vouchersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/bills", billsRouter);
app.use("/api/voucher-types", voucherTypesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Backend server running at http://0.0.0.0:${PORT}`);
  console.log(`✓ Try http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
  console.log(`✓ CORS enabled for local frontend`);
});

// Set a timeout for any hanging operations
server.setTimeout(30000); // 30 second timeout
