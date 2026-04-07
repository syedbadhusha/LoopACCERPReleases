import dotenv from "dotenv";
import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || "tally_clone";
const mongoDirectUri = process.env.MONGODB_DIRECT_URI;
const mongoFallbackUri =
  process.env.MONGODB_FALLBACK_URI ||
  `mongodb://127.0.0.1:27017/${mongoDbName}`;
const allowLocalFallback =
  process.env.ALLOW_LOCAL_FILE_DB_FALLBACK !== "false" &&
  process.env.NODE_ENV !== "production";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localDbFilePath = path.join(__dirname, ".localdb.json");

if (!mongoUri) {
  throw new Error("Missing MONGODB_URI in environment (.env)");
}

let client;
let db;
let connectPromise;

function readLocalStore() {
  try {
    if (!fs.existsSync(localDbFilePath)) {
      return {};
    }

    const raw = fs.readFileSync(localDbFilePath, "utf-8");
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    console.warn(`Failed to read local DB file: ${error.message}`);
    return {};
  }
}

function writeLocalStore(store) {
  try {
    fs.writeFileSync(localDbFilePath, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.warn(`Failed to write local DB file: ${error.message}`);
  }
}

function isDateLike(value) {
  if (value instanceof Date) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

function toComparableDate(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function matchesQuery(doc, query = {}) {
  for (const [key, condition] of Object.entries(query)) {
    const fieldValue = doc[key];

    if (
      condition &&
      typeof condition === "object" &&
      !Array.isArray(condition) &&
      "$gt" in condition
    ) {
      const target = condition.$gt;
      if (isDateLike(fieldValue) || isDateLike(target)) {
        if (toComparableDate(fieldValue) <= toComparableDate(target)) {
          return false;
        }
      } else if (!(fieldValue > target)) {
        return false;
      }
      continue;
    }

    if (fieldValue !== condition) {
      return false;
    }
  }

  return true;
}

function createLocalDb() {
  const store = readLocalStore();

  function ensureCollection(name) {
    if (!Array.isArray(store[name])) {
      store[name] = [];
      writeLocalStore(store);
    }
    return store[name];
  }

  return {
    listCollections() {
      return {
        async toArray() {
          return Object.keys(store).map((name) => ({ name }));
        },
      };
    },
    async createCollection(name) {
      ensureCollection(name);
      return { collectionName: name };
    },
    async dropCollection(name) {
      if (store[name]) {
        delete store[name];
        writeLocalStore(store);
      }
      return true;
    },
    collection(name) {
      return {
        async createIndex() {
          // No-op for local file DB fallback.
          return "local-file-index";
        },
        async findOne(query = {}) {
          const items = ensureCollection(name);
          return items.find((item) => matchesQuery(item, query)) || null;
        },
        find(query = {}) {
          return {
            async toArray() {
              const items = ensureCollection(name);
              return items.filter((item) => matchesQuery(item, query));
            },
          };
        },
        async insertOne(document) {
          const items = ensureCollection(name);
          const doc = {
            ...document,
            _id: document._id || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          };
          items.push(doc);
          writeLocalStore(store);
          return { acknowledged: true, insertedId: doc._id };
        },
        async updateOne(filter, update, options = {}) {
          const items = ensureCollection(name);
          const index = items.findIndex((item) => matchesQuery(item, filter));
          const setValues = update?.$set || {};

          if (index >= 0) {
            items[index] = { ...items[index], ...setValues };
            writeLocalStore(store);
            return {
              acknowledged: true,
              matchedCount: 1,
              modifiedCount: 1,
              upsertedId: null,
            };
          }

          if (options.upsert) {
            const upsertDoc = {
              ...filter,
              ...setValues,
              _id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            };
            items.push(upsertDoc);
            writeLocalStore(store);
            return {
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
              upsertedId: upsertDoc._id,
            };
          }

          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedId: null,
          };
        },
      };
    },
  };
}

function createMongoClient(uri) {
  return new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
}

function isSrvLookupError(error) {
  return /querySrv|ENOTFOUND|ECONNREFUSED/i.test(error?.message || "");
}

async function connectWithPublicDns(uri) {
  const currentServers = dns.getServers();
  const preferredServers = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];

  try {
    dns.setServers(preferredServers);
    return await connectWithUri(uri, "primary URI with public DNS");
  } finally {
    try {
      dns.setServers(currentServers);
    } catch {
      // Keep running even if restoring DNS servers fails.
    }
  }
}

async function connectWithUri(uri, label) {
  const nextClient = createMongoClient(uri);
  await nextClient.connect();
  client = nextClient;
  db = client.db(mongoDbName);
  console.log(`✓ Connected to MongoDB (${label}): ${mongoDbName}`);
  return db;
}

export async function connectToMongo() {
  if (db) return db;

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      return await connectWithUri(mongoUri, "primary URI");
    } catch (primaryError) {
      const canRetryWithPublicDns =
        mongoUri?.startsWith("mongodb+srv://") && isSrvLookupError(primaryError);

      if (canRetryWithPublicDns) {
        console.warn(
          `Primary MongoDB SRV lookup failed (${primaryError.message}). Retrying with public DNS resolvers...`,
        );

        try {
          return await connectWithPublicDns(mongoUri);
        } catch (dnsRetryError) {
          console.warn(
            `Public DNS retry failed (${dnsRetryError.message}). Falling back to alternate URI if configured...`,
          );
        }
      }

      const canTryFallback =
        mongoFallbackUri &&
        mongoFallbackUri !== mongoUri &&
        isSrvLookupError(primaryError);

      const canTryDirectUri =
        Boolean(mongoDirectUri) &&
        mongoDirectUri !== mongoUri &&
        isSrvLookupError(primaryError);

      if (canTryDirectUri) {
        console.warn(
          `Trying direct MongoDB URI fallback after SRV failure...`,
        );

        try {
          return await connectWithUri(mongoDirectUri, "direct URI fallback");
        } catch (directError) {
          console.warn(
            `Direct URI fallback failed (${directError.message}). Continuing with other fallbacks...`,
          );
        }
      }

      if (!canTryFallback) {
        if (allowLocalFallback) {
          db = createLocalDb();
          console.warn(
            `MongoDB unavailable (${primaryError.message}). Using local file DB fallback at ${localDbFilePath}`,
          );
          return db;
        }
        throw primaryError;
      }

      console.warn(
        `Primary MongoDB connection failed (${primaryError.message}). Trying fallback URI...`,
      );

      try {
        return await connectWithUri(mongoFallbackUri, "fallback URI");
      } catch (fallbackError) {
        if (allowLocalFallback) {
          db = createLocalDb();
          console.warn(
            `MongoDB fallback unavailable (${fallbackError.message}). Using local file DB fallback at ${localDbFilePath}`,
          );
          return db;
        }
        throw new Error(
          `Primary MongoDB failed (${primaryError.message}); fallback failed (${fallbackError.message}).`,
        );
      }
    }
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

async function migrateLegacyBillAllocationCollection(database, names) {
  if (!names.includes("bill_allocation")) {
    return;
  }

  const legacyCollection = database.collection("bill_allocation");
  const billsCollection = database.collection("bills");
  const legacyBills = await legacyCollection.find({}).toArray();

  if (legacyBills.length > 0) {
    for (const legacyBill of legacyBills) {
      const { _id, ...billData } = legacyBill;
      const normalizedBill = {
        ...billData,
        id: billData.id || String(_id),
        updated_at: billData.updated_at || new Date(),
      };

      await billsCollection.updateOne(
        { id: normalizedBill.id },
        { $set: normalizedBill },
        { upsert: true },
      );
    }
  }

  try {
    await database.dropCollection("bill_allocation");
    console.log(
      `[DB MIGRATION] Migrated ${legacyBills.length} records from bill_allocation to bills and dropped legacy collection`,
    );
  } catch (dropError) {
    console.warn(
      `[DB MIGRATION] Migrated ${legacyBills.length} records to bills, but failed to drop bill_allocation: ${dropError.message}`,
    );
  }
}

async function migrateBillsAmountModel(database) {
  const billsCollection = database.collection("bills");
  const bills = await billsCollection.find({}).toArray();

  if (bills.length === 0) {
    return;
  }

  let migrated = 0;

  for (const bill of bills) {
    const hasNewKeys =
      bill.opening !== undefined &&
      bill.credit !== undefined &&
      bill.debit !== undefined &&
      bill.closing !== undefined;

    if (
      hasNewKeys &&
      bill.balance_type === undefined &&
      bill.isDeemedPositive === undefined &&
      bill.amount === undefined
    ) {
      continue;
    }

    const numericAmount = Number(bill.amount || 0);
    const opening =
      bill.opening !== undefined
        ? Number(bill.opening || 0)
        : bill.openingBalance !== undefined
          ? Number(bill.openingBalance || 0)
          : bill.balance_type === "debit"
            ? -Math.abs(numericAmount)
            : Math.abs(numericAmount);

    const credit =
      bill.credit !== undefined
        ? Math.abs(Number(bill.credit || 0))
        : numericAmount > 0
          ? Math.abs(numericAmount)
          : 0;

    const debit =
      bill.debit !== undefined
        ? Math.abs(Number(bill.debit || 0))
        : numericAmount < 0
          ? Math.abs(numericAmount)
          : 0;

    const netClosing = opening + credit - debit;

    await billsCollection.updateOne(
      { _id: bill._id },
      {
        $set: {
          opening,
          credit,
          debit,
          closing: netClosing,
          openingBalance: opening,
          closingBalance: netClosing,
          updated_at: new Date(),
        },
        $unset: {
          balance_type: "",
          isDeemedPositive: "",
          amount: "",
        },
      },
    );

    migrated += 1;
  }

  if (migrated > 0) {
    console.log(
      `[DB MIGRATION] Updated ${migrated} bills to opening/credit/debit/closing schema`,
    );
  }
}

async function migrateLedgerMasterBalanceModel(database) {
  const ledgersCollection = database.collection("ledgers");
  const ledgers = await ledgersCollection.find({}).toArray();

  if (ledgers.length === 0) {
    return;
  }

  let migrated = 0;

  for (const ledger of ledgers) {
    const hasNewKeys =
      ledger.opening !== undefined &&
      ledger.credit !== undefined &&
      ledger.debit !== undefined &&
      ledger.closing !== undefined;

    if (hasNewKeys && ledger.opening_balance === undefined && ledger.balance_type === undefined) {
      continue;
    }

    const inferredType =
      ledger.balance_type || (Number(ledger.opening || 0) < 0 ? "debit" : "credit");

    const opening =
      ledger.opening !== undefined
        ? Number(ledger.opening || 0)
        : inferredType === "debit"
          ? -Math.abs(Number(ledger.opening_balance || 0))
          : Math.abs(Number(ledger.opening_balance || 0));

    const credit =
      ledger.credit !== undefined ? Math.abs(Number(ledger.credit || 0)) : 0;
    const debit =
      ledger.debit !== undefined ? -Math.abs(Number(ledger.debit || 0)) : 0;
    const closing = opening + credit + debit;

    await ledgersCollection.updateOne(
      { _id: ledger._id },
      {
        $set: {
          opening,
          credit,
          debit,
          closing,
          updated_at: new Date(),
        },
        $unset: {
          opening_balance: "",
          balance_type: "",
        },
      },
    );

    migrated += 1;
  }

  if (migrated > 0) {
    console.log(
      `[DB MIGRATION] Updated ${migrated} ledgers to opening/credit/debit/closing schema`,
    );
  }

  try {
    await database.dropCollection("ledger_entries");
    console.log("[DB MIGRATION] Dropped legacy ledger_entries collection");
  } catch (dropError) {
    console.warn(
      `[DB MIGRATION] Failed to drop ledger_entries collection: ${dropError.message}`,
    );
  }
}

async function migrateItemMasterStockValueModel(database) {
  const itemsCollection = database.collection("item_master");
  const items = await itemsCollection.find({}).toArray();

  if (items.length === 0) {
    return;
  }

  let migrated = 0;

  for (const item of items) {
    const openingQty = Number(item.opening_stock ?? item.opening_qty ?? 0) || 0;
    const openingRate = Number(item.opening_rate || 0) || 0;
    const openingValue =
      item.opening_value !== undefined
        ? Number(item.opening_value || 0)
        : openingQty * openingRate;

    const inwardQty = Number(item.inward_qty || 0) || 0;
    const inwardValue = Number(item.inward_value || 0) || 0;
    const inwardRate = inwardQty > 0 ? inwardValue / inwardQty : 0;

    const outwardQty = Number(item.outward_qty || 0) || 0;
    const outwardValue = Number(item.outward_value || 0) || 0;
    const outwardRate = outwardQty > 0 ? outwardValue / outwardQty : 0;

    const closingQty = openingQty + inwardQty - outwardQty;
    const closingValue = openingValue + inwardValue - outwardValue;
    const closingRate = closingQty > 0 ? closingValue / closingQty : 0;

    const hasAllNewKeys =
      item.inward_rate !== undefined &&
      item.inward_value !== undefined &&
      item.outward_rate !== undefined &&
      item.outward_value !== undefined &&
      item.closing_rate !== undefined &&
      item.closing_value !== undefined;

    if (hasAllNewKeys) {
      continue;
    }

    await itemsCollection.updateOne(
      { _id: item._id },
      {
        $set: {
          opening_stock: openingQty,
          opening_rate: openingRate,
          opening_value: openingValue,
          inward_qty: inwardQty,
          inward_rate: inwardRate,
          inward_value: inwardValue,
          outward_qty: outwardQty,
          outward_rate: outwardRate,
          outward_value: outwardValue,
          closing_qty: closingQty,
          closing_rate: closingRate,
          closing_value: closingValue,
          updated_at: new Date(),
        },
      },
    );

    migrated += 1;
  }

  if (migrated > 0) {
    console.log(
      `[DB MIGRATION] Backfilled stock value/rate fields for ${migrated} items in item_master`,
    );
  }
}

/**
 * Ensure required collections and indexes exist. This function is idempotent.
 */
export async function initializeDatabase() {
  try {
    const database = await connectToMongo();

    console.log("Checking/initializing MongoDB collections...");

    const existing = await database
      .listCollections({}, { nameOnly: true })
      .toArray();
    const names = existing.map((c) => c.name);

    // Ensure collections exist (Mongo creates on first insert, but we create here for clarity)
    const required = [
      "users",
      "companies",
      "company_users",
      "groups",
      "ledgers",
      "item_master",
      "uom_master",
      "stock_groups",
      "stock_categories",
      "vouchers",
      "batch_allocation",
      "bills",
    ];
    for (const col of required) {
      if (!names.includes(col)) {
        await database.createCollection(col);
        console.log(`Created collection: ${col}`);
      }
    }

    await migrateLegacyBillAllocationCollection(database, names);
    await migrateBillsAmountModel(database);
    await migrateLedgerMasterBalanceModel(database);
    await migrateItemMasterStockValueModel(database);

    // Create indexes
    await database
      .collection("users")
      .createIndex({ email: 1 }, { unique: true });
    await database
      .collection("groups")
      .createIndex({ company_id: 1, name: 1 }, { unique: true });
    await database
      .collection("ledgers")
      .createIndex({ company_id: 1, name: 1 }, { unique: true });
    await database
      .collection("item_master")
      .createIndex({ company_id: 1, name: 1 }, { unique: true });
    await database
      .collection("company_users")
      .createIndex({ company_id: 1, username: 1 }, { unique: true });
    await database
      .collection("batch_allocation")
      .createIndex(
        { item_id: 1, batch_number: 1, company_id: 1 },
        { unique: true },
      );
    await database
      .collection("bills")
      .createIndex({ company_id: 1, ledger_id: 1, bill_reference: 1 });
    await database
      .collection("bills")
      .createIndex({ company_id: 1, closing: 1 });
    await database.collection("bills").createIndex({ voucher_id: 1 });

    console.log("✓ MongoDB collections and indexes are ready");
  } catch (err) {
    console.error("MongoDB initialization error:", err.message || err);
    throw err;
  }
}

export function getDb() {
  if (!db)
    throw new Error("MongoDB not connected. Call connectToMongo() first.");
  return db;
}

export async function closeMongo() {
  if (client) await client.close();
}
