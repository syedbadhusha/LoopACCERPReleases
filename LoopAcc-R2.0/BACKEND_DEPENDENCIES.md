# API Dependencies and Data Flow

## Overview

This document maps the dependencies between API endpoints and shows how data flows through the system.

---

## 1. Dependency Hierarchy

```
Companies (Root)
├── Company Users (Depends on: Companies)
├── Company Sessions (Depends on: Companies, Company Users)
├── Groups (Depends on: Companies)
│   └── Ledgers (Depends on: Companies, Groups)
│       └── Voucher Ledger Entries (Depends on: Vouchers, Ledgers)
├── UOM (Depends on: Companies)
├── Stock Groups (Depends on: Companies)
├── Stock Categories (Depends on: Companies)
├── Items (Depends on: Companies, UOM, Stock Groups, Stock Categories)
│   └── Voucher Items (Depends on: Vouchers, Items)
├── Vouchers (Depends on: Companies, Ledgers, Items)
└── Settings (Depends on: Companies)
```

---

## 2. Critical Dependencies

### A. Company Creation Chain

**Required before**: Any other entity can be created

**Sequence**:

1. **POST /api/companies** → Creates company record
2. **POST /api/companies/:companyId/login** → Create session
3. → Default groups automatically created by backend
4. → Now ready to create users, ledgers, items, etc.

**Dependencies**:

- Company creation **MUST** happen first
- Company ID is required parameter for all subsequent operations

### B. Ledger Creation Chain

**Must have**: Company, Groups

**Sequence**:

1. **GET /api/groups?companyId=:companyId** → Get available groups
2. **POST /api/ledgers** → Create ledger with specific group_id
3. → Now ready to create vouchers with this ledger

**Critical**: Cannot create ledger without valid `group_id`

### C. Item Creation Chain

**Must have**: Company, UOM, Stock Groups, Stock Categories

**Sequence**:

1. **GET /api/uom?companyId=:companyId** → Get available units
2. **GET /api/stock-groups?companyId=:companyId** → Get stock groups
3. **GET /api/stock-categories?companyId=:companyId** → Get stock categories
4. **POST /api/items** → Create item using above IDs

**Critical**: Cannot create item without:

- Valid `unit_of_measure_id`
- Valid `stock_group_id`
- Valid `stock_category_id`

### D. Voucher Creation Chain

**Must have**: Company, Ledgers, Items

**Sequence**:

1. **GET /api/ledgers?companyId=:companyId** → Get available ledgers
2. **GET /api/items?companyId=:companyId** → Get available items
3. **POST /api/vouchers** → Create voucher with:
   - `item_id` references from items
   - `ledger_id` references from ledgers for entries
4. → Voucher automatically creates corresponding ledger entries

**Critical**: Cannot create voucher without:

- Valid `item_id` for each item line
- Valid `ledger_id` for each ledger entry
- Matching debit/credit amounts in ledger entries

---

## 3. Endpoint Dependency Matrix

| Endpoint                  | Requires                                              | Optional         | Creates                           |
| ------------------------- | ----------------------------------------------------- | ---------------- | --------------------------------- |
| POST /companies           | -                                                     | -                | Company, Default Groups, Settings |
| POST /companies/:id/login | Company ID                                            | -                | Session Token                     |
| GET /groups               | Company ID                                            | -                | -                                 |
| POST /groups              | Company ID, Group Data                                | -                | Group                             |
| GET /ledgers              | Company ID                                            | -                | -                                 |
| POST /ledgers             | Company ID, Group ID                                  | -                | Ledger                            |
| GET /items                | Company ID                                            | -                | -                                 |
| POST /items               | Company ID, UOM ID, Stock Group ID, Stock Category ID | -                | Item                              |
| GET /uom                  | Company ID                                            | -                | -                                 |
| POST /uom                 | Company ID, UOM Data                                  | -                | UOM                               |
| GET /stock-groups         | Company ID                                            | -                | -                                 |
| POST /stock-groups        | Company ID, Stock Group Data                          | -                | Stock Group                       |
| GET /stock-categories     | Company ID                                            | -                | -                                 |
| POST /stock-categories    | Company ID, Stock Category Data                       | -                | Stock Category                    |
| GET /vouchers             | Company ID                                            | Type, Date Range | -                                 |
| POST /vouchers            | Company ID, Ledger IDs, Item IDs                      | -                | Voucher, Ledger Entries           |
| POST /settings            | Company ID, User ID                                   | -                | Settings Record                   |

---

## 4. Data Flow Examples

### Flow 1: Creating a Sales Invoice (Voucher)

```
1. Company Created
   ↓
2. Default Groups Auto-Created
   ↓
3. Create Ledgers (for parties)
   - GET /api/groups (get "Income" group)
   - POST /api/ledgers (create "Sales Account" under Income)
   - POST /api/ledgers (create "Receivables" account)
   ↓
4. Setup Inventory
   - POST /api/uom (create "Unit", "Dozen")
   - POST /api/stock-groups (create "Products")
   - POST /api/stock-categories (create "Saleable")
   - POST /api/items (create product items)
   ↓
5. Create Sales Voucher
   - GET /api/ledgers (list all ledgers)
   - GET /api/items (list all items)
   - POST /api/vouchers (create invoice with items and entries)
   ↓
6. Automatic Effects
   - Ledger balances updated
   - Stock quantities reduced
   - Journal entries created
```

### Flow 2: Creating a Payment Voucher

```
1. Have Company with Ledgers
   ↓
2. Create Payment Voucher
   - POST /api/vouchers (type: "payment")
   - References ledgers (from account, to account)
   - No items needed for payment
   ↓
3. Automatic Effects
   - Bank balance increased
   - Payable/Receivable reduced
   - Journal entries created
```

### Flow 3: Stock Management Flow

```
1. Setup Stock Infrastructure
   - POST /api/uom (Units of measure)
   - POST /api/stock-groups (Categories)
   - POST /api/stock-categories (Sub-categories)
   ↓
2. Create Items
   - POST /api/items (with UOM, group, category refs)
   ↓
3. Track Stock Through Vouchers
   - POST /api/vouchers (add items)
   - GET /api/items (check stock levels)
   - Reports/stock-summary (get full inventory)
```

---

## 5. Cascading Operations

### When Creating Company:

```
POST /api/companies
  ↓ (automatic)
  ├── Create company_users (admin user)
  ├── Create company_sessions (session token)
  ├── Create 4 default groups:
  │   ├── Assets
  │   ├── Liability
  │   ├── Income
  │   └── Expense
  ├── Create default ledgers for each group
  ├── Create settings record
  └── Create default UOMs (kg, m, l, etc.)
```

### When Creating Voucher:

```
POST /api/vouchers
  ↓
  ├── Validate all item_ids exist
  ├── Validate all ledger_ids exist
  ├── Create voucher record
  ├── Create item_lines (nested)
  ├── Create ledger_entries (nested)
  ├── Update ledger balances
  └── Update item stock quantities
```

### When Deleting Ledger:

```
DELETE /api/ledgers/:id
  ↓
  ├── Check for voucher references
  └── If referenced: Prevent deletion (return error)
      Else: Delete and update ledger balances
```

---

## 6. Transaction Flow Rules

### Voucher Must Balance

```
Sum of Debits = Sum of Credits

Example:
{
  "ledger_entries": [
    { "ledger_id": "cash", "debit_amount": 100, "credit_amount": 0 },
    { "ledger_id": "sales", "debit_amount": 0, "credit_amount": 100 }
  ]
}
```

### Items Must Be From Company

```
If posting item in voucher:
- item.company_id MUST equal voucher.company_id
- item.is_active MUST be true
```

### Ledgers Must Be From Correct Group

```
Income/Expense groups cannot have Debit opening balances
Assets must have Debit opening balances
Liability/Equity must have Credit opening balances
```

---

## 7. Validation Rules

### Company Creation

- ✓ Company name required
- ✓ Admin username unique within company
- ✓ Admin password must be minimum 6 characters
- ✓ Financial year dates valid (start before end)

### Group Creation

- ✓ Name unique within company
- ✓ Nature must be one of: assets, liability, income, expense
- ✓ Cannot delete system groups
- ✓ Cannot delete group if ledgers exist

### Ledger Creation

- ✓ Name unique within company
- ✓ Balance type must be Debit or Credit
- ✓ Group ID must exist
- ✓ Opening balance must match balance type rules

### Item Creation

- ✓ Name unique within company
- ✓ HSN code format valid (6-8 digits)
- ✓ UOM ID must exist
- ✓ Stock Group ID must exist
- ✓ Stock Category ID must exist

### Voucher Creation

- ✓ All item IDs must exist
- ✓ All ledger IDs must exist
- ✓ Debits must equal credits
- ✓ Voucher type must be valid (sales/purchase/payment/receipt)
- ✓ Date must be within financial year

---

## 8. Frontend Implementation Pattern

### Optimal Sequence for New Company Setup

```typescript
// Step 1: Create Company
const companyRes = await fetch('http://localhost:5000/api/companies', {
  method: 'POST',
  body: JSON.stringify({ companyData: {...}, userId: user.id })
});
const company = await companyRes.json();

// Step 2: Login and Get Session
const loginRes = await fetch(
  `http://localhost:5000/api/companies/${company.data.id}/login`,
  { method: 'POST', body: JSON.stringify({...}) }
);
const session = await loginRes.json();

// Step 3: Load Groups (already created by server)
const groupsRes = await fetch(
  `http://localhost:5000/api/groups?companyId=${company.data.id}`
);
const groups = await groupsRes.json();

// Step 4: Create/Get Ledgers
// Step 5: Create/Get Items with UOM, Stock Groups, Categories
// Step 6: Create Vouchers
```

### Preventing Invalid States

```typescript
// Always verify dependencies exist before posting

// Before creating ledger, verify group exists
const groups = await getGroups(companyId);
const groupExists = groups.find((g) => g.id === groupId);
if (!groupExists) {
  throw new Error("Invalid group ID");
}

// Before creating voucher, verify all items and ledgers exist
const items = await getItems(companyId);
const ledgers = await getLedgers(companyId);
const itemIds = new Set(items.map((i) => i.id));
const ledgerIds = new Set(ledgers.map((l) => l.id));

voucherData.items.forEach((item) => {
  if (!itemIds.has(item.item_id)) {
    throw new Error(`Item ${item.item_id} not found`);
  }
});

voucherData.ledger_entries.forEach((entry) => {
  if (!ledgerIds.has(entry.ledger_id)) {
    throw new Error(`Ledger ${entry.ledger_id} not found`);
  }
});

// Verify debit/credit balance
const debits = ledgerData.reduce((s, e) => s + (e.debit_amount || 0), 0);
const credits = ledgerData.reduce((s, e) => s + (e.credit_amount || 0), 0);
if (debits !== credits) {
  throw new Error("Voucher must balance");
}
```

---

## 9. API Load Recommendations

### Recommended Caching Strategy

```typescript
// Cache lists that rarely change
const groupsCache = {}; // Cache per company, 1 hour expiry
const ledgersCache = {}; // Cache per company, 30 min expiry
const itemsCache = {}; // Cache per company, 30 min expiry

// Always fetch fresh for selection dropdowns
const getGroups = async (companyId) => {
  const cacheKey = `groups_${companyId}`;
  if (groupsCache[cacheKey] && !isExpired(groupsCache[cacheKey])) {
    return groupsCache[cacheKey].data;
  }

  const res = await fetch(`/api/groups?companyId=${companyId}`);
  const data = await res.json();
  groupsCache[cacheKey] = { data: data.data, timestamp: Date.now() };
  return data.data;
};
```

### Batch Loading

```typescript
// Load all prerequisites in parallel for master pages
const [groups, ledgers, items, uom, stockGroups, stockCategories] =
  await Promise.all([
    fetch(`/api/groups?companyId=${companyId}`),
    fetch(`/api/ledgers?companyId=${companyId}`),
    fetch(`/api/items?companyId=${companyId}`),
    fetch(`/api/uom?companyId=${companyId}`),
    fetch(`/api/stock-groups?companyId=${companyId}`),
    fetch(`/api/stock-categories?companyId=${companyId}`),
  ]);
```

---

## 10. Error Handling Patterns

### Dependency Errors

```typescript
// When dependency is missing
if (ledgersRes.status === 404) {
  // Ledger not found - may need to create one first
  showMessage("Please create a ledger first");
  navigateToCreateLedger();
}

// When dependency is invalid
if (ledgersRes.status === 400) {
  // Invalid ledger ID format
  clearForm();
  showError("Invalid ledger reference");
}

// When dependency was deleted
if (voucherRes.status === 400 && voucherRes.data.includes("not found")) {
  // Reference was deleted after being selected
  reloadReferences();
}
```

---

## Summary

**Critical Rule**: Always create in this order:

1. Company (creates default groups)
2. Groups/Categories (UOM, Stock Groups, Stock Categories)
3. Ledgers (dependent on groups)
4. Items (dependent on UOM, Stock Groups, Stock Categories)
5. Vouchers (dependent on ledgers and items)

**Always verify**: Before creating any entity, verify all its dependencies exist.

**Always validate**: Vouchers must balance, items must reference valid entities, ledgers must exist before use.
