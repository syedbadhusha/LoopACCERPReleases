import express from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db.js";

const router = express.Router();

// ─── Permission keys ────────────────────────────────────────────────────────
// Keep this in sync with the frontend PERMISSIONS constant.
export const ALL_PERMISSIONS = {
  // Masters
  master_groups:    "Group Master",
  master_ledgers:   "Ledger Master",
  master_vouchertype: "Voucher Type Master",
  master_items:     "Item Master",
  master_uom:       "UOM Master",
  master_stockgroup: "Stock Group Master",
  master_stockcategory: "Stock Category Master",
  // Reports
  report_profitloss:    "Profit & Loss",
  report_balancesheet:  "Balance Sheet",
  report_trialbalance:  "Trial Balance",
  report_groupsummary:  "Group Summary",
  report_ledger:        "Ledger Report",
  report_groupvouchers: "Group Vouchers",
  report_voucherhistory: "Voucher History",
  report_salesregister:  "Sales Register",
  report_purchaseregister: "Purchase Register",
  report_stocksummary:  "Stock Summary",
  report_batchsummary:  "Batch Summary",
  report_outstanding_receivable: "Outstanding Receivables",
  report_outstanding_payable:    "Outstanding Payables",
  // Dashboard Permissions
  dashboard_total_sales: 'Dashboard: Total Sales',
  dashboard_total_purchase: 'Dashboard: Total Purchase',
  dashboard_outstanding_receivable: 'Dashboard: Outstanding Receivables',
  dashboard_outstanding_payable: 'Dashboard: Outstanding Payables',
  dashboard_pos_hold: 'Dashboard: POS Hold',
  dashboard_cash_in_hand: 'Dashboard: Cash in Hand',
  dashboard_bank_accounts: 'Dashboard: Bank Accounts',
   dashboard_bar_chart: 'Dashboard: Bar Chart',
};

// Voucher-type-level sub-permissions
export const VOUCHER_ACTIONS = ['view', 'create', 'edit', 'delete', 'print'];

// ─── Helper: verify company admin ───────────────────────────────────────────
async function requireCompanyAdmin(db, companyId, requesterId) {
  const reqUser = await db.collection("company_users").findOne({
    company_id: companyId,
    user_id: requesterId,
  });
  if (!reqUser || !reqUser.is_admin) {
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/company-users/:companyId/roles
 * List all roles for a company.
 */
router.get("/:companyId/roles", async (req, res) => {
  try {
    const { companyId } = req.params;
    const db = getDb();
    const roles = await db
      .collection("roles")
      .find({ company_id: companyId })
      .sort({ name: 1 })
      .toArray();
    return res.json({ success: true, data: roles });
  } catch (err) {
    console.error("List roles error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/company-users/:companyId/roles
 * Create a new role.
 * Body: { requesterId, name, permissions: { ... }, voucher_permissions: { [typeId]: { view, create, edit, delete } } }
 */
router.post("/:companyId/roles", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { requesterId, name, permissions, voucher_permissions } = req.body;

    if (!name || !requesterId) {
      return res.status(400).json({ success: false, message: "requesterId and name are required." });
    }

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can manage roles." });
    }

    // Check duplicate name
    const existing = await db.collection("roles").findOne({ company_id: companyId, name: String(name).trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: `Role "${name}" already exists.` });
    }

    const role = {
      id: uuidv4(),
      company_id: companyId,
      name: String(name).trim(),
      permissions: permissions || {},
      voucher_permissions: voucher_permissions || {},
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection("roles").insertOne(role);
    return res.status(201).json({ success: true, data: role });
  } catch (err) {
    console.error("Create role error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/company-users/:companyId/roles/:roleId
 * Update a role's name and/or permissions.
 * Body: { requesterId, name?, permissions?, voucher_permissions? }
 */
router.put("/:companyId/roles/:roleId", async (req, res) => {
  try {
    const { companyId, roleId } = req.params;
    const { requesterId, name, permissions, voucher_permissions } = req.body;

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can manage roles." });
    }

    const updates = { updated_at: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (permissions !== undefined) updates.permissions = permissions;
    if (voucher_permissions !== undefined) updates.voucher_permissions = voucher_permissions;

    const result = await db.collection("roles").updateOne(
      { id: roleId, company_id: companyId },
      { $set: updates }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Role not found." });
    }
    return res.json({ success: true, message: "Role updated." });
  } catch (err) {
    console.error("Update role error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/company-users/:companyId/roles/:roleId
 * Delete a role (only if no users are currently assigned to it).
 * Query: ?requesterId=xxx
 */
router.delete("/:companyId/roles/:roleId", async (req, res) => {
  try {
    const { companyId, roleId } = req.params;
    const { requesterId } = req.query;

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can manage roles." });
    }

    // Prevent deletion if users are assigned
    const assignedCount = await db
      .collection("company_users")
      .countDocuments({ company_id: companyId, role_id: roleId });
    if (assignedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role — ${assignedCount} user(s) are assigned to it. Reassign them first.`,
      });
    }

    await db.collection("roles").deleteOne({ id: roleId, company_id: companyId });
    return res.json({ success: true, message: "Role deleted." });
  } catch (err) {
    console.error("Delete role error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY USER ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/company-users/:companyId/users
 * List all users (including admin) for a company.
 * Query: ?requesterId=xxx
 */
router.get("/:companyId/users", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { requesterId } = req.query;

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can list users." });
    }

    const users = await db
      .collection("company_users")
      .find({ company_id: companyId })
      .sort({ created_at: 1 })
      .toArray();

    const sanitized = users.map(({ password_hash, ...u }) => u);
    return res.json({ success: true, data: sanitized });
  } catch (err) {
    console.error("List company users error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/company-users/:companyId/users
 * Create a new company sub-user.
 * Body: { requesterId, username, password, fullName, role_id }
 */
router.post("/:companyId/users", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { requesterId, username, password, fullName, role_id } = req.body;

    if (!requesterId || !username || !password) {
      return res.status(400).json({ success: false, message: "requesterId, username and password are required." });
    }

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can add users." });
    }

    const normalizedUsername = String(username).trim().toLowerCase();

    // Check duplicate username within company
    const existing = await db.collection("company_users").findOne({
      company_id: companyId,
      username: normalizedUsername,
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Username "${normalizedUsername}" already exists in this company.` });
    }

    if (role_id) {
      const role = await db.collection("roles").findOne({ id: role_id, company_id: companyId });
      if (!role) {
        return res.status(400).json({ success: false, message: "Selected role not found." });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      company_id: companyId,
      user_id: null,          // not linked to a license user
      username: normalizedUsername,
      full_name: fullName || normalizedUsername,
      password_hash: passwordHash,
      role_id: role_id || null,
      is_admin: false,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection("company_users").insertOne(newUser);
    const { password_hash, ...safe } = newUser;
    return res.status(201).json({ success: true, data: safe });
  } catch (err) {
    console.error("Create company user error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/company-users/:companyId/users/:userId
 * Update a company user (role, active status, full_name, password).
 * Body: { requesterId, role_id?, is_active?, fullName?, password? }
 */
router.put("/:companyId/users/:userId", async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { requesterId, role_id, is_active, fullName, password } = req.body;

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can update users." });
    }

    const target = await db.collection("company_users").findOne({ id: userId, company_id: companyId });
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    if (target.is_admin) return res.status(400).json({ success: false, message: "Cannot modify the company admin account." });

    const updates = { updated_at: new Date() };
    if (role_id !== undefined) updates.role_id = role_id || null;
    if (is_active !== undefined) updates.is_active = !!is_active;
    if (fullName !== undefined) updates.full_name = fullName;
    if (password) updates.password_hash = await bcrypt.hash(password, 10);

    await db.collection("company_users").updateOne({ id: userId }, { $set: updates });
    return res.json({ success: true, message: "User updated." });
  } catch (err) {
    console.error("Update company user error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/company-users/:companyId/users/:userId
 * Remove a company sub-user (cannot remove admin).
 * Query: ?requesterId=xxx
 */
router.delete("/:companyId/users/:userId", async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { requesterId } = req.query;

    const db = getDb();
    if (!(await requireCompanyAdmin(db, companyId, requesterId))) {
      return res.status(403).json({ success: false, message: "Only company admin can remove users." });
    }

    const target = await db.collection("company_users").findOne({ id: userId, company_id: companyId });
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    if (target.is_admin) return res.status(400).json({ success: false, message: "Cannot delete the company admin account." });

    await db.collection("company_users").deleteOne({ id: userId });
    return res.json({ success: true, message: "User removed." });
  } catch (err) {
    console.error("Delete company user error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/company-users/:companyId/my-permissions
 * Return the permissions for the currently logged-in company user.
 * Query: ?companyUserId=xxx
 */
router.get("/:companyId/my-permissions", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { companyUserId } = req.query;

    const db = getDb();
    const companyUser = await db.collection("company_users").findOne({
      id: companyUserId,
      company_id: companyId,
    });
    if (!companyUser) {
      return res.status(404).json({ success: false, message: "Company user not found." });
    }

    // Admin has all permissions
    if (companyUser.is_admin) {
      const allTrue = Object.fromEntries(Object.keys(ALL_PERMISSIONS).map((k) => [k, true]));
      // For admin, fetch all voucher types and grant all actions on each
      const allVoucherTypes = await db
        .collection("voucher_types")
        .find({ company_id: companyId })
        .project({ id: 1, name: 1 })
        .toArray();
      const adminVoucherPerms = {};
      for (const vt of allVoucherTypes) {
        adminVoucherPerms[vt.id] = { view: true, create: true, edit: true, delete: true, print: true };
      }
      return res.json({ success: true, is_admin: true, permissions: allTrue, voucher_permissions: adminVoucherPerms });
    }

    let permissions = {};
    let voucher_permissions = {};
    if (companyUser.role_id) {
      const role = await db.collection("roles").findOne({ id: companyUser.role_id });
      permissions = role?.permissions || {};
      voucher_permissions = role?.voucher_permissions || {};
    }

    return res.json({ success: true, is_admin: false, permissions, voucher_permissions });
  } catch (err) {
    console.error("Get permissions error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
