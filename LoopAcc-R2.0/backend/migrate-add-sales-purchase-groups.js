#!/usr/bin/env node

/**
 * Migration Script: Add Sales Accounts and Purchase Accounts groups to existing companies
 *
 * This script adds the "Sales Accounts" and "Purchase Accounts" groups to all existing
 * companies in the database if they don't already exist.
 *
 * Usage: node migrate-add-sales-purchase-groups.js
 */

import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || "tally_clone";

if (!mongoUri) {
  console.error("❌ Missing MONGODB_URI in environment (.env)");
  process.exit(1);
}

async function migrateDatabase() {
  const client = new MongoClient(mongoUri, {});

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB:", mongoDbName);

    const db = client.db(mongoDbName);
    const companiesCollection = db.collection("companies");
    const groupsCollection = db.collection("groups");

    // Get all companies
    const companies = await companiesCollection.find({}).toArray();
    console.log(`\nFound ${companies.length} companies to update`);

    if (companies.length === 0) {
      console.log("No companies found. Migration not needed.");
      return;
    }

    let addedGroupsCount = 0;
    let skippedCount = 0;

    // Process each company
    for (const company of companies) {
      console.log(`\n📋 Processing company: ${company.name} (${company.id})`);

      // Check if Sales Accounts already exists
      const salesAccountsExists = await groupsCollection.findOne({
        company_id: company.id,
        name: "Sales Accounts",
      });

      // Check if Purchase Accounts already exists
      const purchaseAccountsExists = await groupsCollection.findOne({
        company_id: company.id,
        name: "Purchase Accounts",
      });

      const groupsToAdd = [];

      if (!salesAccountsExists) {
        groupsToAdd.push({
          id: uuidv4(),
          company_id: company.id,
          name: "Sales Accounts",
          nature: "income",
          is_system: true,
          parent_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log("  ✓ Will add: Sales Accounts");
      } else {
        console.log("  ⊘ Already exists: Sales Accounts");
        skippedCount++;
      }

      if (!purchaseAccountsExists) {
        groupsToAdd.push({
          id: uuidv4(),
          company_id: company.id,
          name: "Purchase Accounts",
          nature: "expense",
          is_system: true,
          parent_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log("  ✓ Will add: Purchase Accounts");
      } else {
        console.log("  ⊘ Already exists: Purchase Accounts");
        skippedCount++;
      }

      // Insert groups if needed
      if (groupsToAdd.length > 0) {
        try {
          const result = await groupsCollection.insertMany(groupsToAdd);
          console.log(`  ✅ Added ${result.insertedCount} groups`);
          addedGroupsCount += result.insertedCount;
        } catch (error) {
          console.error(`  ❌ Error adding groups: ${error.message}`);
        }
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total companies processed: ${companies.length}`);
    console.log(`Groups added: ${addedGroupsCount}`);
    console.log(`Groups skipped (already exist): ${skippedCount}`);
    console.log("=".repeat(50));
    console.log("✅ Migration completed successfully!\n");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("✓ Database connection closed");
    process.exit(0);
  }
}

// Run migration
console.log("🔄 Starting database migration...");
console.log(
  "Adding Sales Accounts and Purchase Accounts groups to existing companies\n"
);
migrateDatabase().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
