# Sales & Purchase Accounts - Visual Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Company Creation Flow                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  Create New Company           │
            │  - Company Name               │
            │  - Admin User                 │
            │  - Tax Type (GST/VAT)         │
            └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  Backend: createCompanyService│
            │  1. Create company record     │
            │  2. Create admin user         │
            │  3. Call createDefaultGroups()│
            └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  Create Default Groups (20)   │
            │                               │
            │  Assets (4)                   │
            │  Liabilities (3)              │
            │  Income (4)                   │
            │  Expenses (4)                 │
            │  Special (3)                  │
            └───────────────────────────────┘
                            │
                ┌───────────┴────────────┐
                │                        │
                ▼                        ▼
    ┌─────────────────────┐  ┌──────────────────────┐
    │  Income Groups      │  │  Expense Groups      │
    ├─────────────────────┤  ├──────────────────────┤
    │ • Income            │  │ • Expenses           │
    │ • Sales             │  │ • Cost of Goods Sold │
    │ • Sales Accounts ✨ │  │ • Purchase Accounts✨│
    │ • Service Income    │  │ • Operating Expenses │
    └─────────────────────┘  └──────────────────────┘
            │                        │
            ▼                        ▼
  ┌──────────────────────┐  ┌──────────────────────┐
  │ Create Sales Ledgers │  │ Create Purchase      │
  │ Examples:            │  │ Ledgers              │
  │ • Sales - Goods      │  │ Examples:            │
  │ • Sales - Services   │  │ • Purchase - Goods   │
  │ • Sales - Exports    │  │ • Purchase - Materials
  │ • Sales - Consulting │  │ • Purchase - Services│
  └──────────────────────┘  └──────────────────────┘
```

## Sales Voucher Processing Flow

```
┌──────────────────────────────────────────────────────────────┐
│           User Creates Sales Voucher                          │
└──────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┴──────────────────┐
          │                                    │
          ▼                                    ▼
  ┌──────────────────┐             ┌──────────────────┐
  │  Select Customer │             │ Select Sales     │
  │  (Sundry Debtors)│             │ Ledger           │
  │                  │             │ (Sales Accounts) │
  │ • ABC Corp       │             │                  │
  │ • XYZ Ltd        │             │ • Sales-Goods    │
  │ • New Customer   │             │ • Sales-Services │
  └────────┬─────────┘             └────────┬─────────┘
           │                               │
           └───────────────┬───────────────┘
                           │
                           ▼
            ┌──────────────────────────┐
            │  Add Items to Voucher    │
            │  - Item 1: 10 units @50  │
            │  - Item 2: 5 units @100  │
            │                          │
            │  Subtotal:      ₹1000    │
            │  Tax (18% GST):  ₹180    │
            │  Total:         ₹1180    │
            └──────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────┐
            │  Save Sales Voucher      │
            │  (Backend Processing)    │
            └──────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
    ┌─────────────────────┐  ┌──────────────────┐
    │ Create Ledger Entry │  │ Update Inventory │
    │ (Debit Customer)    │  │ (Reduce Stock)   │
    │                     │  │                  │
    │ Customer: ₹1180 Dr  │  │ Item 1: -10 units│
    │                     │  │ Item 2: -5 units │
    └────────┬────────────┘  └──────────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Create Ledger Entry  │
    │ (Credit Sales Acct)  │
    │                      │
    │Sales-Goods: ₹1000 Cr │
    │                      │
    │ (Tax ledger: ₹180 Cr)│
    └──────────────────────┘
```

## Purchase Voucher Processing Flow

```
┌──────────────────────────────────────────────────────────────┐
│          User Creates Purchase Voucher                        │
└──────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┴──────────────────┐
          │                                    │
          ▼                                    ▼
  ┌──────────────────┐             ┌──────────────────┐
  │  Select Supplier │             │ Select Purchase  │
  │ (Sundry Creditors)│            │ Ledger           │
  │                  │             │ (Purchase Accts) │
  │ • ABC Traders    │             │                  │
  │ • XYZ Exports    │             │ • Purchase-Goods │
  │ • New Supplier   │             │ • Purchase-Matl  │
  └────────┬─────────┘             └────────┬─────────┘
           │                               │
           └───────────────┬───────────────┘
                           │
                           ▼
            ┌──────────────────────────┐
            │  Add Items to Bill       │
            │  - Item 1: 10 units @40  │
            │  - Item 2: 5 units @80   │
            │                          │
            │  Subtotal:      ₹800     │
            │  Tax (18% GST):  ₹144    │
            │  Total:         ₹944     │
            └──────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────┐
            │  Save Purchase Voucher   │
            │  (Backend Processing)    │
            └──────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
    ┌─────────────────────┐  ┌──────────────────┐
    │ Create Ledger Entry │  │ Update Inventory │
    │ (Debit Purchase)    │  │ (Add Stock)      │
    │                     │  │                  │
    │Purchase-Goods: ₹800 │  │ Item 1: +10 units│
    │ Debit              │  │ Item 2: +5 units │
    └────────┬────────────┘  └──────────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Create Ledger Entry  │
    │ (Credit Supplier)    │
    │                      │
    │Supplier: ₹944 Credit │
    │                      │
    │ (Tax ledger: ₹144 Cr)│
    └──────────────────────┘
```

## Database Schema Relationships

```
┌──────────────────────────────────────────────────────────────┐
│                    Database Collections                       │
└──────────────────────────────────────────────────────────────┘

┌─────────────────┐
│    companies    │
├─────────────────┤
│ id              │
│ name            │──┐
│ tax_type        │  │
│ created_at      │  │
└─────────────────┘  │
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                      groups (20)                              │
├──────────────────────────────────────────────────────────────┤
│ id                                                             │
│ company_id (FK)                                               │
│ name    ◄───────── "Sales Accounts" ✨ NEW                   │
│         ◄───────── "Purchase Accounts" ✨ NEW                │
│ nature: "income" OR "expense" OR "assets" OR "liability"    │
│ parent_id (null for master groups)                           │
│ is_system: true (marks as automatic/system)                  │
│ created_at                                                    │
│ updated_at                                                    │
└──────────────────────────────────────────────────────────────┘
                     │
                     │ 1:N
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                      ledgers                                  │
├──────────────────────────────────────────────────────────────┤
│ id                                                             │
│ company_id (FK)                                               │
│ group_id (FK) ──────┐  Points to:                            │
│                     ├─ "Sales Accounts" group                │
│                     └─ "Purchase Accounts" group              │
│ name                                                           │
│ balance_type: "debit" OR "credit"                            │
│ opening_balance                                               │
│ created_at                                                    │
└──────────────────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────────────┐  ┌──────────────────────┐
│     vouchers         │  │  ledger_entries      │
├──────────────────────┤  ├──────────────────────┤
│ id                   │  │ id                   │
│ company_id (FK)      │  │ company_id (FK)      │
│ ledger_id (FK)       │  │ voucher_id (FK)      │
│ voucher_type: sales/ │  │ ledger_id (FK)       │
│             purchase │  │ amount               │
│ voucher_number       │  │ isDeemedPositive     │
│ voucher_date         │  │ created_at           │
│ total_amount         │  └──────────────────────┘
│ tax_amount           │
│ net_amount           │
└──────────────────────┘
```

## Data Flow: Sales Voucher Saving

```
Frontend (SalesForm)
     │
     │ POST /api/vouchers
     │ {
     │   company_id: "...",
     │   ledger_id: "ABC123" (Customer),
     │   voucher_type: "sales",
     │   voucher_number: "INV0001",
     │   total_amount: 1180,
     │   tax_amount: 180,
     │   details: [
     │     { item_id: "...", quantity: 10, rate: 50, ... },
     │     { ledger_id: "SALES001", amount: 1000 },
     │     { ledger_id: "TAX001", amount: 180 }
     │   ]
     │ }
     │
     ▼
Backend (voucherService.js)
     │
     ├─ Validate voucher data
     ├─ Create voucher record
     ├─ Create ledger entries:
     │  ├─ Debit: Customer (₹1180)
     │  ├─ Credit: Sales-Goods (₹1000)
     │  └─ Credit: Tax Ledger (₹180)
     ├─ Update inventory (reduce stock)
     └─ Return success response
     │
     ▼
Database (MongoDB)
     │
     ├─ Insert voucher in "vouchers" collection
     ├─ Insert 3 entries in "ledger_entries"
     ├─ Update stock in "batch_allocation"
     └─ Commit transaction
     │
     ▼
Frontend receives success response
     │
     └─ Update UI, show confirmation,
        redirect to next action
```

## Group Assignment in Vouchers

```
┌─────────────────────────────────────────────────────────┐
│  Sales Voucher - Ledger Selection                       │
└─────────────────────────────────────────────────────────┘

Fetch all ledgers ──┐
                   │
                   ├─ Filter: group.name = "Sales Accounts" OR
                   │                        "Income"
                   │
                   ▼
                 [
                   { name: "Sales-Goods", group: "Sales Accounts" },
                   { name: "Sales-Services", group: "Sales Accounts" },
                   { name: "Service Income", group: "Income" },
                   ✗ Exclude: "Expenses", "Assets", etc.
                 ]
                   │
                   ▼
             Display in Dropdown
             (User selects one)

┌─────────────────────────────────────────────────────────┐
│  Purchase Voucher - Ledger Selection                    │
└─────────────────────────────────────────────────────────┘

Fetch all ledgers ──┐
                   │
                   ├─ Filter: group.name = "Purchase Accounts" OR
                   │                        "Expenses"
                   │
                   ▼
                 [
                   { name: "Purchase-Goods", group: "Purchase Accounts" },
                   { name: "Purchase-Materials", group: "Purchase Accounts" },
                   { name: "Operating Expenses", group: "Expenses" },
                   ✗ Exclude: "Income", "Assets", etc.
                 ]
                   │
                   ▼
             Display in Dropdown
             (User selects one)
```

## File Structure Overview

```
Project Root
│
├── backend/
│   └── services/
│       └── companyService.js ✨ MODIFIED
│           └── createDefaultGroups() [20 groups created]
│               ├── Sales Accounts (NEW)
│               └── Purchase Accounts (NEW)
│
├── src/
│   └── pages/
│       └── forms/
│           ├── SalesForm.tsx ✅ READY
│           │   └── Sales Ledger Dropdown
│           │       └── Filters: Sales Accounts | Income
│           │
│           └── PurchaseForm.tsx ✅ READY
│               └── Purchase Ledger Dropdown
│                   └── Filters: Purchase Accounts | Expenses
│
└── Documentation/
    ├── SALES_PURCHASE_ACCOUNTS_IMPLEMENTATION.md
    ├── SALES_PURCHASE_ACCOUNTS_QUICK_REFERENCE.md
    └── IMPLEMENTATION_SUMMARY_SALES_PURCHASE.md
```

## Summary Table

| Component               | Status     | Details                                     |
| ----------------------- | ---------- | ------------------------------------------- |
| Sales Accounts Group    | ✅ Created | Nature: Income, Auto-created with company   |
| Purchase Accounts Group | ✅ Created | Nature: Expense, Auto-created with company  |
| Sales Form Filtering    | ✅ Ready   | Filters for Sales Accounts & Income groups  |
| Purchase Form Filtering | ✅ Ready   | Filters for Purchase Accounts & Expenses    |
| Ledger Creation         | ✅ Ready   | Users can create ledgers under these groups |
| Voucher Processing      | ✅ Ready   | Automatic journal entries created           |
| Inventory Update        | ✅ Ready   | Stock updated with each transaction         |
| Financial Reporting     | ✅ Ready   | Ledger reports show these accounts          |

---

**Visual Architecture Complete** ✅
**All Components Integrated** ✅
**Ready for Testing** ✅
