import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getUserDb } from "../db.js";

const router = express.Router();

// In-memory admin session tokens  { token -> expiresAt }
const adminSessions = new Map();
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// --- Middleware: verify admin token ---
function requireAdminToken(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  const expiresAt = adminSessions.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    adminSessions.delete(token);
    return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }
  next();
}

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of adminSessions.entries()) {
    if (now > exp) adminSessions.delete(token);
  }
}, 30 * 60 * 1000);

/**
 * POST /api/admin/login
 * Validate against EMAIL_USER + EMAIL_PASSWORD from env.
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const validEmail = (process.env.EMAIL_USER || "").trim().toLowerCase();
    const validPassword = process.env.EMAIL_PASSWORD || "";

    if (
      email.trim().toLowerCase() !== validEmail ||
      password !== validPassword
    ) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials." });
    }

    const token = uuidv4();
    adminSessions.set(token, Date.now() + TOKEN_TTL_MS);

    return res.json({ success: true, token });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/**
 * POST /api/admin/logout
 */
router.post("/logout", requireAdminToken, (req, res) => {
  const token = req.headers["authorization"].slice(7);
  adminSessions.delete(token);
  return res.json({ success: true });
});

/**
 * GET /api/admin/licenses
 * Returns all licenses with their users.
 */
router.get("/licenses", requireAdminToken, async (req, res) => {
  try {
    const db = getUserDb();

    const [licenses, users] = await Promise.all([
      db.collection("licenses").find({}).sort({ created_at: -1 }).toArray(),
      db.collection("users").find({ status: { $ne: "removed" } }).toArray(),
    ]);

    // Group users by license_id
    const usersByLicense = {};
    for (const u of users) {
      const lid = String(u.license_id || "");
      if (!usersByLicense[lid]) usersByLicense[lid] = [];
      usersByLicense[lid].push({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        is_owner: u.is_owner,
        status: u.status,
        must_change_password: u.must_change_password,
        created_at: u.created_at,
        last_login: u.last_login,
      });
    }

    const result = licenses.map((lic) => ({
      id: lic.id,
      plan: lic.plan || "standard",
      max_users: lic.max_users,
      is_active: lic.is_active,
      valid_until: lic.valid_until,
      created_at: lic.created_at,
      users: usersByLicense[String(lic.id)] || [],
    }));

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("Admin get licenses error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/**
 * PUT /api/admin/licenses/:licenseId/plan
 * Update the plan (and max_users) for a license.
 * Body: { plan: "standard" | "premium" | "gold" | "platinum" }
 */
const PLAN_MAX_USERS = {
  standard: 1,
  premium: 5,
  gold: 25,
  platinum: 100,
};

router.put("/licenses/:licenseId/plan", requireAdminToken, async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { plan } = req.body;

    if (!plan || !PLAN_MAX_USERS[plan]) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Must be one of: standard, premium, gold, platinum.",
      });
    }

    const db = getUserDb();
    const result = await db.collection("licenses").updateOne(
      { id: String(licenseId) },
      {
        $set: {
          plan,
          max_users: PLAN_MAX_USERS[plan],
          updated_at: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "License not found." });
    }

    return res.json({
      success: true,
      message: `Plan updated to ${plan} (max ${PLAN_MAX_USERS[plan]} users).`,
      plan,
      max_users: PLAN_MAX_USERS[plan],
    });
  } catch (err) {
    console.error("Admin update plan error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/**
 * PUT /api/admin/licenses/:licenseId/status
 * Activate or deactivate a license.
 * Body: { is_active: boolean }
 */
router.put("/licenses/:licenseId/status", requireAdminToken, async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { is_active } = req.body;

    const db = getUserDb();

    const updateFields = { is_active: !!is_active, updated_at: new Date().toISOString() };

    // When activating, set default 30-day expiry only if no valid_until is already set
    if (is_active) {
      const existing = await db.collection("licenses").findOne({ id: String(licenseId) });
      if (!existing?.valid_until) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        expiry.setHours(23, 59, 59, 999);
        updateFields.valid_until = expiry.toISOString();
        updateFields.activated_at = new Date().toISOString();
      }
    }

    await db.collection("licenses").updateOne(
      { id: String(licenseId) },
      { $set: updateFields }
    );

    return res.json({
      success: true,
      message: `License ${is_active ? "activated" : "deactivated"}.`,
      valid_until: updateFields.valid_until ?? null,
    });
  } catch (err) {
    console.error("Admin update license status error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/**
 * PUT /api/admin/licenses/:licenseId/expiry
 * Update the valid_until date for a license.
 * Body: { valid_until: "YYYY-MM-DD" }  — pass null/empty to remove expiry
 */
router.put("/licenses/:licenseId/expiry", requireAdminToken, async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { valid_until } = req.body;

    let expiryValue = null;
    if (valid_until) {
      const d = new Date(valid_until);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD." });
      }
      expiryValue = d.toISOString();
    }

    const db = getUserDb();
    const result = await db.collection("licenses").updateOne(
      { id: String(licenseId) },
      { $set: { valid_until: expiryValue, updated_at: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "License not found." });
    }

    return res.json({
      success: true,
      message: expiryValue
        ? `Expiry updated to ${new Date(expiryValue).toLocaleDateString()}.`
        : "Expiry removed (no expiration).",
      valid_until: expiryValue,
    });
  } catch (err) {
    console.error("Admin update expiry error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

export default router;
