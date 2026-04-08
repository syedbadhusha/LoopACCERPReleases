import express from "express";
import {
  createCompanyService,
  getUserCompanies,
  updateCompanyService,
  loginToCompanyService,
} from "../services/companyService.js";
import { getDb } from "../db.js";

const router = express.Router();

/**
 * GET /api/companies/debug/all
 * Debug endpoint - list all companies and their users (development only)
 */
router.get("/debug/all", async (req, res) => {
  try {
    const db = getDb();
    const companies = await db.collection("companies").find({}).toArray();
    const users = await db.collection("company_users").find({}).toArray();

    return res.json({
      success: true,
      data: {
        totalCompanies: companies.length,
        totalUsers: users.length,
        companies: companies.map((c) => ({
          id: c.id,
          name: c.name,
          user_id: c.user_id,
        })),
        users: users.map((u) => ({
          id: u.id,
          company_id: u.company_id,
          username: u.username,
          is_active: u.is_active,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/companies
 * Create a new company
 */
router.post("/", async (req, res) => {
  try {
    const { companyData, userId } = req.body;

    if (!companyData || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyData and userId",
      });
    }

    if (!companyData.name || !companyData.country) {
      return res.status(400).json({
        success: false,
        message: "Missing required company fields: name, country",
      });
    }

    const result = await createCompanyService(companyData, userId);

    return res.status(201).json(result);
  } catch (error) {
    console.error("Company creation API error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create company",
    });
  }
});

/**
 * GET /api/companies/:userId
 * Get all companies for a user
 */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId parameter",
      });
    }

    const result = await getUserCompanies(userId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Get companies API error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch companies",
    });
  }
});

/**
 * POST /api/companies/:companyId/login
 * Login to a company
 */
router.post("/:companyId/login", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { username, password, userId } = req.body;

    console.log(
      `\n📝 Login attempt - Company: ${companyId}, User: ${username}, UserId: ${userId}`
    );

    if (!companyId || !username || !password || !userId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: companyId, username, password, userId",
      });
    }

    const result = await loginToCompanyService(
      companyId,
      username,
      password,
      userId
    );

    if (result.success) {
      console.log(`✓ Login successful for ${username}`);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Company login API error:", error);
    return res.status(401).json({
      success: false,
      message: error.message || "Failed to login to company",
      debug: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * PUT /api/companies/:companyId
 * Update company
 */
router.put("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { updateData, userId } = req.body;

    if (!companyId || !userId || !updateData) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: companyId, userId, updateData",
      });
    }

    const result = await updateCompanyService(companyId, updateData, userId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Company update API error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update company",
    });
  }
});

/**
 * POST /api/companies/session/validate
 * Validate a company session token
 */
router.post("/session/validate", async (req, res) => {
  try {
    const { sessionToken, userId } = req.body;

    if (!sessionToken || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing sessionToken or userId",
      });
    }

    const db = getDb();

    // Find the session
    const session = await db.collection("company_sessions").findOne({
      session_token: sessionToken,
      user_id: userId,
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    // Check if session expired
    if (new Date(session.expires_at) <= new Date()) {
      // Delete expired session
      await db.collection("company_sessions").deleteOne({ id: session.id });
      return res.status(401).json({
        success: false,
        message: "Session expired",
      });
    }

    // Get company and company user details
    const company = await db.collection("companies").findOne({
      id: session.company_id,
    });

    const companyUser = await db.collection("company_users").findOne({
      id: session.company_user_id,
    });

    if (!company || !companyUser) {
      return res.status(401).json({
        success: false,
        message: "Company or user not found",
      });
    }

    // Return valid session data
    return res.status(200).json({
      success: true,
      data: {
        session,
        company,
        user: {
          id: companyUser.id,
          username: companyUser.username,
          company_id: companyUser.company_id,
          is_active: companyUser.is_active,
        },
      },
    });
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to validate session",
    });
  }
});

/**
 * POST /api/companies/session/logout
 * Logout from company - delete session
 */
router.post("/session/logout", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Missing sessionId",
      });
    }

    const db = getDb();
    const result = await db.collection("company_sessions").deleteOne({
      id: sessionId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Session logout error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to logout",
    });
  }
});

/**
 * DELETE /api/companies/:companyId
 * Delete a company and all its related data
 */
router.delete("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { userId } = req.query;

    if (!companyId || !userId) {
      return res.status(400).json({
        success: false,
        message: "companyId and userId are required",
      });
    }

    const db = getDb();

    // Verify the company belongs to the requesting user
    const company = await db.collection("companies").findOne({
      id: String(companyId),
      user_id: String(userId),
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found or access denied",
      });
    }

    // Delete all related data in parallel
    await Promise.all([
      db.collection("company_users").deleteMany({ company_id: companyId }),
      db.collection("company_sessions").deleteMany({ company_id: companyId }),
      db.collection("groups").deleteMany({ company_id: companyId }),
      db.collection("ledgers").deleteMany({ company_id: companyId }),
      db.collection("items").deleteMany({ company_id: companyId }),
      db.collection("vouchers").deleteMany({ company_id: companyId }),
      db.collection("voucher_details").deleteMany({ company_id: companyId }),
      db.collection("ledger_entries").deleteMany({ company_id: companyId }),
      db.collection("bills").deleteMany({ company_id: companyId }),
      db.collection("batch_allocations").deleteMany({ company_id: companyId }),
      db.collection("uom").deleteMany({ company_id: companyId }),
      db.collection("stock_groups").deleteMany({ company_id: companyId }),
      db.collection("stock_categories").deleteMany({ company_id: companyId }),
      db.collection("voucher_types").deleteMany({ company_id: companyId }),
    ]);

    // Finally delete the company itself
    await db.collection("companies").deleteOne({ id: String(companyId) });

    console.log(`Company ${companyId} deleted by user ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Company deleted successfully",
    });
  } catch (error) {
    console.error("Company delete API error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete company",
    });
  }
});

export default router;
