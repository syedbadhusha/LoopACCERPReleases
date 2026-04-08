import express from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getUserDb } from "../db.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Email, password, and full name are required",
      });
    }

    const db = getUserDb();

    // Check if user already exists
    const existingUser = await db
      .collection("users")
      .findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email is already registered. Please sign in instead.",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    const newUser = {
      id: userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      full_name: fullName,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection("users").insertOne(newUser);

    // Return user without password
    const { password_hash, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: "Registration successful!",
      user: userWithoutPassword,
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
 * POST /api/auth/signin
 * Login user with email and password
 */
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const db = getUserDb();

    // Find user by email
    const user = await db.collection("users").findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login
    await db
      .collection("users")
      .updateOne(
        { id: user.id },
        { $set: { last_login: new Date(), updated_at: new Date() } },
      );

    // Return user without password
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: "Login successful!",
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Signin error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to login",
    });
  }
});

/**
 * POST /api/auth/signout
 * Logout user (placeholder for future session management)
 */
router.post("/signout", async (req, res) => {
  try {
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

export default router;

