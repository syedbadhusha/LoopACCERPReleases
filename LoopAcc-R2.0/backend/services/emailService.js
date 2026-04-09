import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Email configuration
const EMAIL_USER = process.env.EMAIL_USER || "looptechbh@gmail.com";
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD; // Gmail App Password
const EMAIL_FROM = process.env.EMAIL_FROM || "LoopAcc <looptechbh@gmail.com>";
const EMAIL_SMTP_HOST = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
const EMAIL_SMTP_PORT = Number(process.env.EMAIL_SMTP_PORT || 587);

// Create transporter
let transporter = null;

function buildTransporter(port) {
  return nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function createTransporter() {
  if (!EMAIL_PASSWORD) {
    console.warn(
      "⚠️  EMAIL_PASSWORD not configured. Emails will be logged to console only.",
    );
    return null;
  }

  try {
    transporter = buildTransporter(EMAIL_SMTP_PORT);
    console.log(
      `✓ Email service configured (${EMAIL_SMTP_HOST}:${EMAIL_SMTP_PORT})`,
    );
    return transporter;
  } catch (error) {
    console.error("Failed to create email transporter:", error.message);
    return null;
  }
}

async function sendWithFallback(mailOptions) {
  const portsToTry = [EMAIL_SMTP_PORT, 587, 465].filter(
    (value, index, arr) => arr.indexOf(value) === index,
  );

  let lastError;
  for (const port of portsToTry) {
    try {
      const currentTransporter = buildTransporter(port);
      const info = await currentTransporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId, port };
    } catch (error) {
      lastError = error;
      console.warn(`Email send failed on ${EMAIL_SMTP_HOST}:${port} - ${error.message}`);
    }
  }

  return { success: false, error: lastError?.message || "Unknown email error" };
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(to, resetToken, resetLink) {
  const transporter = createTransporter();

  const mailOptions = {
    from: EMAIL_FROM,
    to: to,
    subject: "Password Reset Request - LoopAcc",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .reset-code { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea; margin: 20px 0; border-radius: 8px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
            <p>LoopAcc - Complete Accounting Solution</p>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We received a request to reset your password for your LoopAcc account.</p>
            
            <div class="reset-code">${resetToken}</div>
            
            <p><strong>Your 6-digit reset code is shown above.</strong></p>
            <p>You can also click the button below to reset your password directly:</p>
            
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </div>
            
            <div class="warning">
              <strong>⏰ This code will expire in 15 minutes</strong><br>
              If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
          </div>
          <div class="footer">
            <p>This is an automated email from LoopAcc. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} LoopAcc. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Password Reset Request - LoopAcc

Hello,

We received a request to reset your password for your LoopAcc account.

Your 6-digit reset code: ${resetToken}

This code will expire in 15 minutes.

Or click this link to reset your password:
${resetLink}

If you didn't request a password reset, please ignore this email.

---
This is an automated email from LoopAcc.
© ${new Date().getFullYear()} LoopAcc. All rights reserved.
    `,
  };

  // If email is not configured, just log to console
  if (!transporter) {
    console.log("\n" + "=".repeat(70));
    console.log("📧 EMAIL NOT CONFIGURED - PASSWORD RESET EMAIL CONTENT:");
    console.log("=".repeat(70));
    console.log(`To: ${to}`);
    console.log(`Subject: ${mailOptions.subject}`);
    console.log(`Reset Code: ${resetToken}`);
    console.log(`Reset Link: ${resetLink}`);
    console.log("=".repeat(70) + "\n");
    return { success: true, message: "Email logged to console (not sent)" };
  }

  // Send actual email
  try {
    const sendResult = await sendWithFallback(mailOptions);
    if (!sendResult.success) {
      throw new Error(sendResult.error);
    }

    console.log(`✓ Password reset email sent to ${to}`);
    console.log(`Message ID: ${sendResult.messageId}`);
    return { success: true, messageId: sendResult.messageId };
  } catch (error) {
    console.error("Failed to send email:", error.message);
    // Fallback to console logging
    console.log("\n" + "=".repeat(70));
    console.log("📧 EMAIL SENDING FAILED - PASSWORD RESET INFO:");
    console.log("=".repeat(70));
    console.log(`To: ${to}`);
    console.log(`Reset Code: ${resetToken}`);
    console.log(`Reset Link: ${resetLink}`);
    console.log(`Error: ${error.message}`);
    console.log("=".repeat(70) + "\n");
    return { success: false, error: error.message };
  }
}

/**
 * Test email configuration
 */
export async function testEmailConfiguration() {
  const transporter = createTransporter();

  if (!transporter) {
    return { success: false, message: "Email not configured" };
  }

  try {
    await transporter.verify();
    console.log("✓ Email configuration is valid");
    return { success: true, message: "Email configuration is valid" };
  } catch (error) {
    console.error("Email configuration error:", error.message);
    return { success: false, message: error.message };
  }
}
