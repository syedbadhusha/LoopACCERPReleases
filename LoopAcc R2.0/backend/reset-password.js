import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import readline from "readline";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const authDbName = process.env.AUTH_DB_NAME || "loopacc_auth";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function resetPassword() {
  console.log("🔐 Password Reset Tool");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let client;
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(authDbName);

    // List all users
    const users = await db.collection("users").find({}).toArray();

    if (users.length === 0) {
      console.log("❌ No users found in database!");
      return;
    }

    console.log("Available users:");
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.full_name})`);
    });

    console.log();
    const email = await question("Enter the email address to reset password: ");

    const user = await db.collection("users").findOne({ email: email.trim() });

    if (!user) {
      console.log(`\n❌ User with email '${email}' not found!`);
      return;
    }

    console.log(`\n✅ Found user: ${user.full_name} (${user.email})`);

    const newPassword = await question(
      "Enter new password (min 6 characters): ",
    );

    if (newPassword.length < 6) {
      console.log("\n❌ Password must be at least 6 characters long!");
      return;
    }

    const confirmPassword = await question("Confirm new password: ");

    if (newPassword !== confirmPassword) {
      console.log("\n❌ Passwords do not match!");
      return;
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.collection("users").updateOne(
      { id: user.id },
      {
        $set: {
          password_hash: passwordHash,
          updated_at: new Date(),
        },
      },
    );

    console.log("\n✅ Password reset successful!");
    console.log("\n📋 New Login Credentials:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${newPassword}`);
    console.log("\nYou can now login with these credentials!");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  } finally {
    rl.close();
    if (client) {
      await client.close();
    }
  }
}

resetPassword();
