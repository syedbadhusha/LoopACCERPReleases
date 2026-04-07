import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || "tally_clone";

async function listUsers() {
  console.log("🔍 Checking User Accounts in Database");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let client;
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(mongoDbName);

    const users = await db.collection("users").find({}).toArray();

    if (users.length === 0) {
      console.log("❌ No users found in the database!");
      console.log("\n💡 You need to create an account first.");
      console.log("\nOptions:");
      console.log("1. Use the Sign Up tab on the login page");
      console.log("2. Or run: node create-test-user.js");
    } else {
      console.log(`✅ Found ${users.length} user(s):\n`);

      users.forEach((user, index) => {
        console.log(`${index + 1}. User Account:`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Full Name: ${user.full_name}`);
        console.log(
          `   Created: ${user.created_at ? new Date(user.created_at).toLocaleString() : "N/A"}`,
        );
        console.log();
      });

      console.log("\n📋 LOGIN CREDENTIALS:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Email: ${users[0].email}`);
      console.log("Password: (The password you set when creating the account)");

      console.log(
        "\n\n💡 If you created a test user, the password is: admin123",
      );
      console.log("💡 If you signed up yourself, use the password you entered");
    }

    console.log("\n\n🔧 TROUBLESHOOTING:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("If you're getting login errors:");
    console.log("1. Make sure backend server is running (node server.js)");
    console.log("2. Check browser console (F12) for error details");
    console.log("3. Verify you're using the correct email and password");
    console.log("4. Try creating a new account using Sign Up tab");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

listUsers();
