# Backend Database Schema Documentation

## Overview

This document describes the MongoDB collections and their schemas used in the LoopAcc backend application.

---

## 1. Companies Collection

**Collection Name:** `companies`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  user_id: string (UUID),               // Owner's user ID (from Supabase Auth)
  name: string,                         // Company name (required, unique per user)
  country: string,                      // Country code (e.g., "US", "IN")
  state?: string,                       // State/Province
  city?: string,                        // City
  postal_code?: string,                 // Postal/Zip code
  address?: string,                     // Company address
  financial_year_start: string,         // Start date (ISO 8601 format)
  financial_year_end?: string,          // End date (ISO 8601 format)
  currency: string,                     // Currency code (e.g., "USD", "INR")
  tax_registration_number?: string,     // Tax ID
  tax_type?: string,                    // Type of tax (e.g., "GST", "VAT")
  admin_password_hash: string,          // Bcrypt hashed password for company admin
  is_active: boolean,                   // Whether company is active
  created_by: string (UUID),            // User who created the company
  created_at: Date,                     // Creation timestamp
  updated_at: Date,                     // Last update timestamp
  books_beginning?: string              // Accounting period start date
}
```

### Indexes

```javascript
{ user_id: 1, name: 1 }  // Unique index for user's companies
```

---

## 2. Company Users Collection

**Collection Name:** `company_users`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Reference to company
  user_id: string (UUID),               // Reference to main user
  username: string,                     // Company-specific username
  password_hash: string,                // Bcrypt hashed password
  role_id?: string,                     // User role (admin, user, etc.)
  is_active: boolean,                   // Whether user is active
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, username: 1 }  // Unique index for company users
{ user_id: 1 }                  // For finding all users
```

---

## 3. Company Sessions Collection

**Collection Name:** `company_sessions`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  user_id: string (UUID),               // User who owns the session
  company_id: string (UUID),            // Company being accessed
  company_user_id: string (UUID),       // Company user record
  session_token: string (UUID),         // Unique session token
  expires_at: Date,                     // Expiration time (24 hours from creation)
  created_at: Date                      // Creation timestamp
}
```

### Indexes

```javascript
{
  session_token: 1;
} // For fast session lookup
{
  user_id: 1;
} // For finding user sessions
{
  expires_at: 1;
} // For cleanup of expired sessions
```

---

## 4. Groups Collection (Ledger Groups)

**Collection Name:** `groups`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company this group belongs to
  name: string,                         // Group name (e.g., "Assets", "Sales")
  nature: string (enum),                // Type of group - one of:
                                        // "assets", "liability", "income", "expense"
  is_system: boolean,                   // Whether it's a default system group
  parent_id?: string (UUID),            // Parent group ID (for hierarchies)
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, name: 1 }  // Unique index
{ company_id: 1 }           // For listing by company
```

---

## 5. Ledgers Collection

**Collection Name:** `ledgers`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company this ledger belongs to
  group_id: string (UUID),              // Ledger group ID
  name: string,                         // Ledger name
  balance_type: string (enum),          // Balance type - one of:
                                        // "Debit", "Credit", "Bank"
  opening_balance: number,              // Opening balance (default: 0)
  opening_balance_type?: string,        // Type of opening balance ("Debit" or "Credit")
  description?: string,                 // Description
  is_active: boolean,                   // Whether ledger is active
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, name: 1 }  // Unique index
{ company_id: 1 }           // For listing by company
{ group_id: 1 }             // For grouping ledgers
```

---

## 6. Items Collection

**Collection Name:** `items`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company this item belongs to
  name: string,                         // Item name
  description?: string,                 // Item description
  hsn_code?: string,                    // HSN/SAC code for tax
  sku?: string,                         // Stock Keeping Unit
  unit_of_measure_id?: string (UUID),   // Default UOM
  stock_group_id?: string (UUID),       // Stock group
  stock_category_id?: string (UUID),    // Stock category
  opening_quantity?: number,            // Opening stock quantity
  opening_rate?: number,                // Opening stock rate
  reorder_level?: number,               // Minimum stock level
  is_active: boolean,                   // Whether item is active
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, name: 1 }  // Unique index
{ company_id: 1 }           // For listing by company
```

---

## 7. Units of Measure Collection

**Collection Name:** `uom` (Unit of Measure)

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id?: string (UUID),           // Company (optional, can be global)
  symbol: string,                       // Unit symbol (e.g., "kg", "m", "l")
  description?: string,                 // Full description (e.g., "Kilogram")
  is_active: boolean,                   // Whether UOM is active
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{
  symbol: 1;
} // For finding by symbol
{
  company_id: 1;
} // For company-specific UOMs
```

---

## 8. Stock Groups Collection

**Collection Name:** `stock_groups`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company this group belongs to
  name: string,                         // Stock group name
  description?: string,                 // Description
  is_system: boolean,                   // Whether it's a default system group
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, name: 1 }  // Unique index
{ company_id: 1 }           // For listing by company
```

---

## 9. Stock Categories Collection

**Collection Name:** `stock_categories`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company this category belongs to
  name: string,                         // Category name
  description?: string,                 // Description
  is_system: boolean,                   // Whether it's a default system category
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, name: 1 }  // Unique index
{ company_id: 1 }           // For listing by company
```

---

## 10. Vouchers Collection

**Collection Name:** `vouchers`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company this voucher belongs to
  voucher_type: string (enum),          // Type - one of:
                                        // "sales", "purchase", "payment", "receipt"
  reference_no: string,                 // Voucher reference number
  date: Date,                           // Voucher date

  // For Sales/Purchase vouchers
  party_name?: string,                  // Party name
  party_gstin?: string,                 // Party GSTIN
  bill_no?: string,                     // Bill number
  bill_date?: Date,                     // Bill date

  // Line items array
  items: [
    {
      id: string (UUID),
      item_id?: string (UUID),          // Reference to item master
      description: string,              // Item description
      quantity: number,                 // Quantity
      rate: number,                     // Rate per unit
      amount: number,                   // Total amount (quantity × rate)
      hsn_code?: string,
      tax_type?: string,                // IGST, CGST/SGST, etc.
      tax_rate?: number,
      tax_amount?: number,
      line_note?: string                // Item-level notes
    }
  ],

  // Ledger entries
  ledger_entries: [
    {
      id: string (UUID),
      ledger_id: string (UUID),         // Reference to ledger
      debit_amount?: number,
      credit_amount?: number,
      narration?: string
    }
  ],

  // Summary fields
  subtotal: number,                     // Sum of all item amounts
  tax_total?: number,                   // Total taxes
  net_amount: number,                   // Final amount

  // Additional details
  notes?: string,                       // General notes
  is_draft: boolean,                    // Whether voucher is draft
  approval_status?: string,             // approved, rejected, pending
  created_by: string (UUID),            // User who created voucher
  created_at: Date,                     // Creation timestamp
  updated_at: Date                      // Last update timestamp
}
```

### Indexes

```javascript
{ company_id: 1, voucher_type: 1 }  // For listing by type
{ company_id: 1, date: 1 }          // For date range queries
{ reference_no: 1 }                 // For finding by reference
{ company_id: 1 }                   // For company lookups
```

---

## 11. Settings Collection

**Collection Name:** `settings`

### Schema

```javascript
{
  id: string (UUID),                    // Unique identifier
  company_id: string (UUID),            // Company these settings belong to
  user_id: string (UUID),               // User who owns these settings

  // Company settings
  financial_year_start: string,         // Financial year start (ISO date)
  financial_year_end: string,           // Financial year end (ISO date)
  default_gst_rate?: number,            // Default GST rate percentage

  // Feature flags
  enable_tax: boolean,                  // Whether to show tax fields
  enable_stock: boolean,                // Whether to track stock
  enable_budget: boolean,               // Whether to use budgets

  // Display preferences
  number_format?: string,               // Number format preference
  date_format?: string,                 // Date format preference

  created_at: Date,
  updated_at: Date
}
```

### Indexes

```javascript
{ company_id: 1 }           // For company settings
{ user_id: 1, company_id: 1 }  // For user's company settings
```

---

## Data Type Notes

### UUIDs

All ID fields should use UUID v4 format (36 characters including hyphens):

```
Example: "550e8400-e29b-41d4-a716-446655440000"
```

### Dates

All date fields use ISO 8601 format with timezone:

```
Example: "2025-12-11T10:30:00.000Z"
```

### Enums

Strict enum values must be used:

- **nature** (Groups): "assets", "liability", "income", "expense"
- **balance_type** (Ledgers): "Debit", "Credit", "Bank"
- **voucher_type** (Vouchers): "sales", "purchase", "payment", "receipt"

### Numbers

- Use JavaScript `number` type (not strings)
- For monetary amounts, store as decimal numbers (not integers)
- Example: 1000.50 (not "1000.50" or 100050)

---

## Relationships

```
User (Supabase Auth)
  └── Companies
      └── Company Users
      └── Company Sessions
      └── Groups (Ledger Groups)
      │   └── Ledgers
      │       └── Vouchers (Ledger Entries)
      └── Items
      │   ├── Stock Groups
      │   └── Stock Categories
      └── UOM
      └── Vouchers
          ├── Items (via voucher line items)
          └── Ledgers (via ledger entries)
      └── Settings
```

---

## Migration Notes

### Creating Collections

```javascript
// Collections are created automatically on first insert
// But explicit creation is recommended:

db.createCollection("companies");
db.createCollection("company_users");
db.createCollection("company_sessions");
db.createCollection("groups");
db.createCollection("ledgers");
db.createCollection("items");
db.createCollection("uom");
db.createCollection("stock_groups");
db.createCollection("stock_categories");
db.createCollection("vouchers");
db.createCollection("settings");
```

### Creating Indexes

```javascript
// Compound indexes for unique constraints
db.companies.createIndex({ user_id: 1, name: 1 }, { unique: true });
db.company_users.createIndex({ company_id: 1, username: 1 }, { unique: true });
db.groups.createIndex({ company_id: 1, name: 1 }, { unique: true });
db.ledgers.createIndex({ company_id: 1, name: 1 }, { unique: true });
db.items.createIndex({ company_id: 1, name: 1 }, { unique: true });
db.stock_groups.createIndex({ company_id: 1, name: 1 }, { unique: true });
db.stock_categories.createIndex({ company_id: 1, name: 1 }, { unique: true });

// Single field indexes for queries
db.company_sessions.createIndex({ session_token: 1 });
db.company_sessions.createIndex({ user_id: 1 });
db.vouchers.createIndex({ company_id: 1, voucher_type: 1 });
db.vouchers.createIndex({ company_id: 1, date: 1 });
```
