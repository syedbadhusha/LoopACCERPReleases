import express from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
import { getUserDb, getDb } from "../db.js";
import { sendPasswordResetEmail, sendLicenseActivationNotice } from "../services/emailService.js";

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user — creates a new license and makes this user the owner.
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, fullName, maxUsers } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Email, password, and full name are required",
      });
    }

    const db = getUserDb();

    // Allow same email to own multiple licenses — only block if this exact (email + is_owner) combo
    // already exists as a fully registered owner
    const existingOwner = await db
      .collection("users")
      .findOne({ email: normalizedEmail, is_owner: true });
    if (existingOwner) {
      return res.status(400).json({
        success: false,
        message: "This email already has a registered license. Please sign in instead.",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const userId = uuidv4();
    const licenseId = uuidv4();

    // Create license first
    const license = {
      id: licenseId,
      owner_user_id: userId,
      plan: "standard",
      max_users: Number(maxUsers) > 0 ? Number(maxUsers) : 1,
      is_active: false,
      valid_from: new Date(),
      valid_until: null, // null = no expiry; set a date to enforce expiry
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection("licenses").insertOne(license);

    // Create owner user linked to license
    const newUser = {
      id: userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      full_name: fullName,
      license_id: licenseId,
      is_owner: true,
      status: "active",
      must_change_password: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection("users").insertOne(newUser);

    const { password_hash, ...userWithoutPassword } = newUser;
    const { ...licenseData } = license;

    // Send activation notice to admin — fire-and-forget (don't block response)
    sendLicenseActivationNotice({
      fullName: newUser.full_name,
      email: newUser.email,
      licenseId: license.id,
      registeredAt: newUser.created_at,
    }).catch((err) => console.warn("Activation notice email error:", err.message));

    res.status(201).json({
      success: true,
      message: "Registration successful!",
      user: userWithoutPassword,
      license: licenseData,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to register user",
    });
  }
});

/**
 * POST /api/auth/check-email
 * Check if email exists in database
 */
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const db = getUserDb();
    const user = await db.collection("users").findOne({ email: normalizedEmail });

    res.json({
      success: true,
      exists: !!user,
    });
  } catch (error) {
    console.error("Check email error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to check email",
    });
  }
});

/**
 * Shared helper: complete login for a single resolved user record.
 */
async function completeLogin(db, user, res) {
  // Block pending accounts
  if (user.status === "pending") {
    return res.status(403).json({
      success: false,
      message: "Account not activated. Please contact your administrator.",
    });
  }

  // Fetch license info
  const license = user.license_id
    ? await db.collection("licenses").findOne({ id: user.license_id })
    : null;

  if (license && !license.is_active) {
    return res.status(403).json({
      success: false,
      message: "Your license is not yet activated. Please contact the app administrator to activate your account.",
    });
  }

  if (license && license.valid_until) {
    const expiry = new Date(license.valid_until);
    expiry.setHours(23, 59, 59, 999);
    console.log(`[LICENSE] valid_until=${license.valid_until} parsed=${expiry.toISOString()} now=${new Date().toISOString()} expired=${expiry < new Date()}`);
    if (expiry < new Date()) {
      return res.status(403).json({
        success: false,
        message: `Your license expired on ${expiry.toLocaleDateString("en-GB")}. Please contact LoopAcc Support to renew.`,
      });
    }
  }

  // Block if already logged in from another session
  if (user.session_token && user.session_expires_at && new Date(user.session_expires_at) > new Date()) {
    return res.status(409).json({
      success: false,
      message: "You are already logged in from another device or browser. Please log out first.",
    });
  }

  // Create new session token
  const sessionToken = uuidv4();
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.collection("users").updateOne(
    { id: user.id },
    { $set: { last_login: new Date(), updated_at: new Date(), session_token: sessionToken, session_expires_at: sessionExpiresAt } },
  );

  const { password_hash, ...userWithoutPassword } = user;

  return res.json({
    success: true,
    message: user.must_change_password
      ? "Login successful! Please change your temporary password."
      : "Login successful!",
    user: userWithoutPassword,
    license: license
      ? { id: license.id, plan: license.plan, max_users: license.max_users, is_active: license.is_active, valid_until: license.valid_until }
      : null,
    must_change_password: !!user.must_change_password,
    session_token: sessionToken,
  });
}

/**
 * POST /api/auth/signin
 * Login user with email and password.
 * If email has multiple licenses, returns a license selection list instead of logging in.
 */
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const db = getUserDb();

    // Find ALL user records with this email (one per license)
    const allUsers = await db.collection("users").find({ email: normalizedEmail }).toArray();
    if (!allUsers.length) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    // Verify password against the first record (password is the same across all records for this email)
    const isPasswordValid = await bcrypt.compare(password, allUsers[0].password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    // Single license → auto-login
    if (allUsers.length === 1) {
      return await completeLogin(db, allUsers[0], res);
    }

    // Multiple licenses → return selection list (include basic license info for display)
    const mainDb = getDb();
    const licenseOptions = await Promise.all(
      allUsers.map(async (u) => {
        const lic = u.license_id
          ? await db.collection("licenses").findOne({ id: u.license_id })
          : null;
        // Fetch the first company belonging to this license for display
        const firstCompany = u.license_id
          ? await mainDb.collection("companies").findOne(
              { license_id: u.license_id },
              { sort: { created_at: 1 }, projection: { name: 1 } }
            )
          : null;
        return {
          user_id: u.id,
          license_id: u.license_id,
          is_owner: u.is_owner,
          plan: lic?.plan ?? "standard",
          is_active: lic?.is_active ?? false,
          valid_until: lic?.valid_until ?? null,
          company_name: firstCompany?.name ?? null,
        };
      })
    );

    return res.json({
      success: true,
      requires_license_selection: true,
      licenses: licenseOptions,
    });
  } catch (error) {
    console.error("Signin error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to login" });
  }
});

/**
 * POST /api/auth/signin-select
 * Complete login after user selects a license from the picker.
 * Body: { email, password, user_id }
 */
router.post("/signin-select", async (req, res) => {
  try {
    const { email, password, user_id } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password || !user_id) {
      return res.status(400).json({ success: false, message: "email, password and user_id are required" });
    }

    const db = getUserDb();
    const user = await db.collection("users").findOne({ id: user_id, email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid selection." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    return await completeLogin(db, user, res);
  } catch (error) {
    console.error("Signin-select error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to login" });
  }
});

/**
 * POST /api/auth/signout
 * Logout user (placeholder for future session management)
 */
router.post("/signout", async (req, res) => {
  try {
    const { session_token } = req.body;
    if (session_token) {
      const db = getUserDb();
      await db.collection("users").updateOne(
        { session_token },
        { $set: { session_token: null, session_expires_at: null, updated_at: new Date() } },
      );
    }
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Signout error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to logout",
    });
  }
});

/**
 * POST /api/auth/verify-session
 * Re-validates the stored auth session token and checks license status/expiry.
 * Called on every page load so active users get kicked immediately when license expires.
 */
router.post("/verify-session", async (req, res) => {
  try {
    const { session_token } = req.body;
    if (!session_token) {
      return res.status(401).json({ success: false, message: "No session token provided." });
    }

    const db = getUserDb();
    const user = await db.collection("users").findOne({ session_token });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid or expired session." });
    }

    // Check session TTL
    if (!user.session_expires_at || new Date(user.session_expires_at) <= new Date()) {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    // Check license
    const license = user.license_id
      ? await db.collection("licenses").findOne({ id: user.license_id })
      : null;

    if (license && !license.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your license has been deactivated. Please contact LoopAcc Support.",
      });
    }

    if (license && license.valid_until) {
      const expiry = new Date(license.valid_until);
      expiry.setHours(23, 59, 59, 999);
      if (expiry < new Date()) {
        return res.status(403).json({
          success: false,
          message: `Your license expired on ${expiry.toLocaleDateString("en-GB")}. Please contact LoopAcc Support to renew.`,
        });
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Verify session error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

/**
 * POST /api/auth/request-password-reset
 * Request password reset - generates reset token and sends email
 */
router.post("/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    console.log(`📧 Password reset requested for: ${normalizedEmail}`);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const db = getUserDb();

    // Find user
    const user = await db.collection("users").findOne({ email: normalizedEmail });
    if (!user) {
      console.log(`⚠️  No user found with email: ${normalizedEmail}`);
      const isDev = process.env.NODE_ENV !== "production";
      return res.json({
        success: true,
        emailDispatched: false,
        message: isDev
          ? "No account found for this email in current database."
          : "If an account exists with this email, a password reset link has been sent.",
      });
    }

    console.log(`✓ User found: ${user.full_name}`);

    // Generate reset token (6-digit code)
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    console.log(`🔑 Generated reset code: ${resetToken} (expires in 15 min)`);

    // Save reset token to database
    await db.collection("users").updateOne(
      { id: user.id },
      {
        $set: {
          reset_token: resetToken,
          reset_token_expiry: resetTokenExpiry,
          updated_at: new Date(),
        },
      },
    );

    console.log(`💾 Reset code saved to database`);

    // Build reset link
    const frontendBaseUrl =
      process.env.FRONTEND_URL || process.env.APP_BASE_URL || "http://localhost:5173";
    const resetLink = `${frontendBaseUrl}/auth?type=recovery&token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

    console.log(`📨 Attempting to send email to: ${normalizedEmail}`);

    // Send password reset email
    const emailResult = await sendPasswordResetEmail(
      normalizedEmail,
      resetToken,
      resetLink,
    );

    if (emailResult.success) {
      console.log(`✅ Password reset email sent successfully to ${normalizedEmail}`);
      console.log(`   Message ID: ${emailResult.messageId}`);
    } else {
      console.log(
        `❌ Email sending failed, but reset code is available in console`,
      );
    }

    res.json({
      success: true,
      emailDispatched: emailResult.success,
      message: emailResult.success
        ? "Password reset email has been sent. Please check your inbox."
        : "Password reset code has been generated. Check the server console/terminal for the reset code.",
      // For development, include the token in response
      resetToken:
        process.env.NODE_ENV === "development" ? resetToken : undefined,
      resetLink: process.env.NODE_ENV === "development" ? resetLink : undefined,
    });
  } catch (error) {
    console.error("Request password reset error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process password reset request",
    });
  }
});

/**
 * POST /api/auth/verify-reset-token
 * Verify if reset token is valid
 */
router.post("/verify-reset-token", async (req, res) => {
  try {
    const { email, token } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !token) {
      return res.status(400).json({
        success: false,
        message: "Email and token are required",
      });
    }

    const db = getUserDb();

    // Find user with valid token
    const user = await db.collection("users").findOne({
      email: normalizedEmail,
      reset_token: token,
      reset_token_expiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify token",
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, token, and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const db = getUserDb();

    // Find user with valid token
    const user = await db.collection("users").findOne({
      email: normalizedEmail,
      reset_token: token,
      reset_token_expiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await db.collection("users").updateOne(
      { id: user.id },
      {
        $set: {
          password_hash: passwordHash,
          updated_at: new Date(),
        },
        $unset: {
          reset_token: "",
          reset_token_expiry: "",
        },
      },
    );

    res.json({
      success: true,
      message:
        "Password reset successful! You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password",
    });
  }
});

/**
 * POST /api/auth/add-user
 * Owner/admin adds a sub-user under the same license with a temporary password.
 * Body: { ownerUserId, email, fullName, tempPassword }
 */
router.post("/add-user", async (req, res) => {
  try {
    const { ownerUserId, email, fullName, tempPassword } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!ownerUserId || !normalizedEmail || !fullName || !tempPassword) {
      return res.status(400).json({
        success: false,
        message: "ownerUserId, email, fullName, and tempPassword are required",
      });
    }

    if (tempPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Temporary password must be at least 6 characters",
      });
    }

    const db = getUserDb();

    // Verify the requesting user exists and get their license
    const ownerUser = await db.collection("users").findOne({ id: ownerUserId });
    if (!ownerUser) {
      return res.status(403).json({ success: false, message: "Owner user not found" });
    }

    const licenseId = ownerUser.license_id;
    if (!licenseId) {
      return res.status(403).json({ success: false, message: "No license associated with this user" });
    }

    // Fetch license and check max_users
    const license = await db.collection("licenses").findOne({ id: licenseId });
    if (!license || !license.is_active) {
      return res.status(403).json({ success: false, message: "License is inactive or not found" });
    }

    const currentUserCount = await db
      .collection("users")
      .find({ license_id: licenseId, status: { $ne: "removed" } })
      .toArray()
      .then((arr) => arr.length);

    if (currentUserCount >= license.max_users) {
      return res.status(400).json({
        success: false,
        message: `User limit reached. Your license allows a maximum of ${license.max_users} users. Please upgrade your plan.`,
      });
    }

    // Check if this email already exists under the same license (cross-license duplicates are allowed)
    const existingUser = await db.collection("users").findOne({ email: normalizedEmail, license_id: licenseId });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "This email is already added to your license.",
      });
    }

    // Hash the temporary password
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUserId = uuidv4();
    const newUser = {
      id: newUserId,
      email: normalizedEmail,
      password_hash: passwordHash,
      full_name: fullName,
      license_id: licenseId,
      is_owner: false,
      status: "active",
      must_change_password: true,   // Force password change on first login
      added_by: ownerUserId,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection("users").insertOne(newUser);

    const { password_hash, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: `User ${fullName} added successfully. They must change their password on first login.`,
      user: userWithoutPassword,
      users_used: currentUserCount + 1,
      max_users: license.max_users,
    });
  } catch (error) {
    console.error("Add user error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add user",
    });
  }
});

/**
 * POST /api/auth/change-password
 * User changes their password (mandatory on first login if must_change_password is true).
 * Body: { userId, currentPassword, newPassword }
 */
router.post("/change-password", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "userId, currentPassword, and newPassword are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const db = getUserDb();

    const user = await db.collection("users").findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await db.collection("users").updateOne(
      { id: userId },
      {
        $set: {
          password_hash: newHash,
          must_change_password: false,
          updated_at: new Date(),
        },
      },
    );

    res.json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to change password",
    });
  }
});

/**
 * GET /api/auth/users/:licenseId
 * Get all users under a license (for owner/admin user management screen).
 */
router.get("/users/:licenseId", async (req, res) => {
  try {
    const { licenseId } = req.params;
    const db = getUserDb();

    const license = await db.collection("licenses").findOne({ id: licenseId });
    if (!license) {
      return res.status(404).json({ success: false, message: "License not found" });
    }

    const users = await db
      .collection("users")
      .find({ license_id: licenseId, status: { $ne: "removed" } })
      .toArray();

    const sanitized = users.map(({ password_hash, reset_token, reset_token_expiry, ...u }) => u);

    res.json({
      success: true,
      data: sanitized,
      users_used: sanitized.length,
      max_users: license.max_users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch users" });
  }
});

/**
 * DELETE /api/auth/users/:userId
 * Owner removes a sub-user from the license (hard delete — removes from collection).
 * Query: ?ownerUserId=xxx
 */
router.delete("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { ownerUserId } = req.query;

    if (!ownerUserId) {
      return res.status(400).json({ success: false, message: "ownerUserId query param is required" });
    }

    const db = getUserDb();

    const ownerUser = await db.collection("users").findOne({ id: ownerUserId });
    if (!ownerUser || !ownerUser.is_owner) {
      return res.status(403).json({ success: false, message: "Only the license owner can remove users" });
    }

    const targetUser = await db.collection("users").findOne({ id: userId });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (targetUser.is_owner) {
      return res.status(400).json({ success: false, message: "Cannot remove the license owner" });
    }

    if (targetUser.license_id !== ownerUser.license_id) {
      return res.status(403).json({ success: false, message: "User does not belong to your license" });
    }

    // Hard delete — remove from collection so the email can be reused
    await db.collection("users").deleteOne({ id: userId });

    res.json({ success: true, message: "User removed from license." });
  } catch (error) {
    console.error("Remove user error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to remove user" });
  }
});

/**
 * PUT /api/auth/license/:licenseId
 * Update license max_users or plan (for admin/support use).
 * Body: { max_users, plan, valid_until }
 */
router.put("/license/:licenseId", async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { max_users, plan, valid_until, is_active } = req.body;

    const db = getUserDb();
    const license = await db.collection("licenses").findOne({ id: licenseId });
    if (!license) {
      return res.status(404).json({ success: false, message: "License not found" });
    }

    const updates = { updated_at: new Date() };
    if (max_users !== undefined) updates.max_users = Number(max_users);
    if (plan !== undefined) updates.plan = plan;
    if (valid_until !== undefined) updates.valid_until = valid_until ? new Date(valid_until) : null;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    await db.collection("licenses").updateOne({ id: licenseId }, { $set: updates });

    res.json({ success: true, message: "License updated." });
  } catch (error) {
    console.error("Update license error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update license" });
  }
});

export default router;

