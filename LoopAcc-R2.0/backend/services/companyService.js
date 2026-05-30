import { getDb, initializeDatabase } from "../db.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { replaceDefaultGroupsForCompany } from "./groupService.js";
import { createDefaultVoucherTypesForCompany } from "./voucherTypeService.js";

/**
 * Default company settings
 */
const DEFAULT_SETTINGS = {
  auto_backup: "true",
  backup_frequency: "daily",
  decimal_places: "2",
  date_format: "dd/mm/yyyy",
  gst_applicable: "true",
  show_discount_column: "false",
  email_invoice: "false",
  item_wise_discount_enabled: "false",
};

/**
 * Create a new company with admin user and default ledger groups
 */
export async function createCompanyService(companyData, userId) {
  try {
    // Initialize database on first company creation
    console.log("Ensuring database is initialized...");
    await initializeDatabase();
    const db = getDb();

    // Hash the admin password
    const hashedPassword = await bcrypt.hash(companyData.admin_password, 10);

    // Prepare company data
    const { admin_password, ...companyDataToSave } = companyData;

    const companyId = uuidv4();
    const insertData = {
      id: companyId,
      ...companyDataToSave,
      user_id: userId,
      license_id: companyData.license_id || null,
      admin_password_hash: hashedPassword,
      created_by: userId,
      settings: DEFAULT_SETTINGS,
      created_at: new Date(),
      updated_at: new Date(),
    };

    console.log("Creating company:", insertData);

    const res = await db.collection("companies").insertOne(insertData);
    if (!res.acknowledged) {
      throw new Error("Company creation failed: insertOne not acknowledged");
    }

    console.log("Company created:", companyId);

    // Create company user
    const userDoc = {
      id: uuidv4(),
      company_id: companyId,
      user_id: userId,
      username: companyData.admin_username,
      password_hash: hashedPassword,
      is_admin: true,
      role_id: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const userRes = await db.collection("company_users").insertOne(userDoc);
    if (!userRes.acknowledged) {
      throw new Error(
        "Company user creation failed: insertOne not acknowledged"
      );
    }

    console.log("Company user created");

    // Create default ledger groups
    await replaceDefaultGroupsForCompany(companyId);

    // Create default voucher types with numbering settings
    await createDefaultVoucherTypesForCompany(companyId, DEFAULT_SETTINGS);

    return {
      success: true,
      company: insertData,
      message: "Company created successfully with default ledger groups",
    };
  } catch (error) {
    console.error("Company creation service error:", error);
    throw error;
  }
}

/**
 * Get all companies for a user.
 * When licenseId is provided, returns ALL companies under that license
 * (visible to every user on the same license).
 * Falls back to user_id query when no licenseId is given.
 */
export async function getUserCompanies(userId, licenseId) {
  try {
    const db = getDb();
    const query = licenseId
      ? { license_id: licenseId }
      : { user_id: userId };
    const data = await db
      .collection("companies")
      .find(query)
      .toArray();
    return { success: true, data };
  } catch (error) {
    console.error("Get companies error:", error);
    throw error;
  }
}

/**
 * Login to a company
 */
export async function loginToCompanyService(
  companyId,
  username,
  password,
  userId
) {
  try {
    const db = getDb();

    // Find company user by username
    const companyUser = await db.collection("company_users").findOne({
      company_id: companyId,
      username: username,
      is_active: true,
    });

    if (!companyUser) {
      throw new Error("Invalid username or password");
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(
      password,
      companyUser.password_hash
    );
    if (!passwordMatch) {
      throw new Error("Invalid username or password");
    }

    // Create session token
    const sessionToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    const session = {
      id: uuidv4(),
      user_id: userId,
      company_id: companyId,
      company_user_id: companyUser.id,
      session_token: sessionToken,
      expires_at: expiresAt,
      created_at: new Date(),
    };

    const sessionRes = await db
      .collection("company_sessions")
      .insertOne(session);
    if (!sessionRes.acknowledged) {
      throw new Error("Failed to create session");
    }

    // Prepare sanitized company user object (omit password_hash)
    const safeUser = {
      id: companyUser.id,
      company_id: companyUser.company_id,
      user_id: companyUser.user_id,
      username: companyUser.username,
      full_name: companyUser.full_name || companyUser.username,
      is_admin: companyUser.is_admin || false,
      role_id: companyUser.role_id || null,
      is_active: companyUser.is_active,
      created_at: companyUser.created_at,
      updated_at: companyUser.updated_at,
    };

    console.log(
      `Company login successful: company=${companyId}, user=${companyUser.username}`
    );
    return {
      success: true,
      data: {
        session_token: sessionToken,
        company_id: companyId,
        expires_at: expiresAt.toISOString(),
        user: safeUser,
      },
      message: "Logged in successfully",
    };
  } catch (error) {
    console.error("Company login error:", error);
    throw error;
  }
}

/**
 * Update company
 */
export async function updateCompanyService(companyId, updateData, userId) {
  try {
    // Debug logging
    console.log("[updateCompanyService] companyId:", companyId, "userId:", userId, "updateData:", updateData);

    const db = getDb();
    const company = await db.collection("companies").findOne({ id: companyId });
    console.log("[updateCompanyService] found company:", company);
    // Check if user is admin in company_users
    const companyUser = await db.collection("company_users").findOne({ company_id: companyId, user_id: userId, is_active: true });
    if (!companyUser || !companyUser.is_admin) {
      console.warn("[updateCompanyService] User is not admin or not found in company_users");
      throw new Error("Unauthorized: Only company admin can update company profile");
    }

    const res = await db
      .collection("companies")
      .findOneAndUpdate(
        { id: companyId },
        { $set: { ...updateData, updated_at: new Date() } },
        { returnDocument: "after" }
      );
    console.log("[updateCompanyService] update result:", res);

    if (!res.value) {
      console.error("[updateCompanyService] Company update failed");
      throw new Error("Company update failed");
    }

    return { success: true, company: res.value };
  } catch (error) {
    console.error("Company update error:", error);
    throw error;
  }
}
