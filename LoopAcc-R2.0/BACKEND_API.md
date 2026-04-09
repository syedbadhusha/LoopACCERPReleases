# API Endpoints Documentation

## Base URL

```
http://localhost:5000/api
```

## Authentication

All endpoints require:

- User must be authenticated (via Supabase Auth on frontend)
- Session must be valid (verified via `company_sessions` table)
- `companyId` query parameter for most endpoints

---

## 1. Companies Endpoints

### Create Company

```
POST /api/companies
```

**Request Body:**

```json
{
  "companyData": {
    "name": "My Company",
    "country": "US",
    "state": "California",
    "city": "San Francisco",
    "postal_code": "94105",
    "address": "123 Main St",
    "financial_year_start": "2025-01-01",
    "financial_year_end": "2025-12-31",
    "currency": "USD",
    "tax_registration_number": "12-3456789",
    "tax_type": "VAT",
    "admin_username": "admin",
    "admin_password": "secure_password",
    "books_beginning": "2025-01-01"
  },
  "userId": "user_uuid_here"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "company_uuid",
    "name": "My Company",
    "country": "US",
    "currency": "USD",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Get User's Companies

```
GET /api/companies/:userId
```

**Parameters:**

- `userId` (path): User's UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "company_uuid_1",
      "name": "My Company",
      "country": "US",
      "currency": "USD",
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Login to Company

```
POST /api/companies/:companyId/login
```

**Parameters:**

- `companyId` (path): Company UUID

**Request Body:**

```json
{
  "username": "admin",
  "password": "secure_password",
  "userId": "user_uuid_here"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session_token": "token_uuid",
    "expires_at": "2025-12-12T10:00:00Z",
    "user": {
      "id": "company_user_uuid",
      "username": "admin",
      "company_id": "company_uuid",
      "is_active": true
    }
  }
}
```

### Update Company

```
PUT /api/companies/:companyId
```

**Parameters:**

- `companyId` (path): Company UUID

**Request Body:**

```json
{
  "updateData": {
    "name": "Updated Company Name",
    "address": "456 Oak Ave",
    "phone": "555-0123"
  },
  "userId": "user_uuid_here"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "company_uuid",
    "name": "Updated Company Name",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Validate Session

```
POST /api/companies/session/validate
```

**Request Body:**

```json
{
  "sessionToken": "token_uuid",
  "userId": "user_uuid_here"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session_uuid",
      "session_token": "token_uuid",
      "expires_at": "2025-12-12T10:00:00Z"
    },
    "company": {
      "id": "company_uuid",
      "name": "My Company",
      "currency": "USD"
    },
    "user": {
      "id": "company_user_uuid",
      "username": "admin",
      "is_active": true
    }
  }
}
```

### Logout from Company

```
POST /api/companies/session/logout
```

**Request Body:**

```json
{
  "sessionId": "session_uuid"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 2. Groups (Ledger Groups) Endpoints

### Get Groups

```
GET /api/groups?companyId=:companyId
```

**Query Parameters:**

- `companyId` (required): Company UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "group_uuid",
      "company_id": "company_uuid",
      "name": "Assets",
      "nature": "assets",
      "is_system": true,
      "parent_id": null,
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create Group

```
POST /api/groups
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "name": "Custom Asset Group",
  "nature": "assets",
  "parent_id": null,
  "is_system": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "group_uuid",
    "company_id": "company_uuid",
    "name": "Custom Asset Group",
    "nature": "assets",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update Group

```
PUT /api/groups/:id
```

**Parameters:**

- `id` (path): Group UUID

**Request Body:**

```json
{
  "name": "Updated Group Name",
  "nature": "liability"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "group_uuid",
    "name": "Updated Group Name",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete Group

```
DELETE /api/groups/:id
```

**Parameters:**

- `id` (path): Group UUID

**Response:**

```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

---

## 3. Ledgers Endpoints

### Get Ledgers

```
GET /api/ledgers?companyId=:companyId
```

**Query Parameters:**

- `companyId` (required): Company UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "ledger_uuid",
      "company_id": "company_uuid",
      "group_id": "group_uuid",
      "name": "Bank Account",
      "balance_type": "Debit",
      "opening_balance": 10000,
      "opening_balance_type": "Debit",
      "description": "Main bank account",
      "is_active": true,
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create Ledger

```
POST /api/ledgers
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "group_id": "group_uuid",
  "name": "New Bank Account",
  "balance_type": "Debit",
  "opening_balance": 5000,
  "opening_balance_type": "Debit",
  "description": "Secondary bank account",
  "is_active": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "ledger_uuid",
    "company_id": "company_uuid",
    "name": "New Bank Account",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update Ledger

```
PUT /api/ledgers/:id
```

**Parameters:**

- `id` (path): Ledger UUID

**Request Body:**

```json
{
  "name": "Updated Bank Account",
  "opening_balance": 7500
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "ledger_uuid",
    "name": "Updated Bank Account",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete Ledger

```
DELETE /api/ledgers/:id
```

**Parameters:**

- `id` (path): Ledger UUID

**Response:**

```json
{
  "success": true
}
```

---

## 4. Items Endpoints

### Get Items

```
GET /api/items?companyId=:companyId
```

**Query Parameters:**

- `companyId` (required): Company UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "item_uuid",
      "company_id": "company_uuid",
      "name": "Product A",
      "description": "High quality product",
      "hsn_code": "123456",
      "sku": "SKU-001",
      "unit_of_measure_id": "uom_uuid",
      "stock_group_id": "stock_group_uuid",
      "stock_category_id": "stock_category_uuid",
      "opening_quantity": 100,
      "opening_rate": 50,
      "reorder_level": 20,
      "is_active": true,
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create Item

```
POST /api/items
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "name": "New Product",
  "description": "Product description",
  "hsn_code": "654321",
  "sku": "SKU-002",
  "unit_of_measure_id": "uom_uuid",
  "stock_group_id": "stock_group_uuid",
  "stock_category_id": "stock_category_uuid",
  "opening_quantity": 50,
  "opening_rate": 75,
  "reorder_level": 10,
  "is_active": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "item_uuid",
    "name": "New Product",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update Item

```
PUT /api/items/:id
```

**Parameters:**

- `id` (path): Item UUID

**Request Body:**

```json
{
  "name": "Updated Product Name",
  "opening_quantity": 75
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "item_uuid",
    "name": "Updated Product Name",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete Item

```
DELETE /api/items/:id
```

**Parameters:**

- `id` (path): Item UUID

**Response:**

```json
{
  "success": true
}
```

---

## 5. Units of Measure (UOM) Endpoints

### Get UOMs

```
GET /api/uom?companyId=:companyId
```

**Query Parameters:**

- `companyId` (required): Company UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uom_uuid",
      "company_id": "company_uuid",
      "symbol": "kg",
      "description": "Kilogram",
      "is_active": true,
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create UOM

```
POST /api/uom
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "symbol": "m",
  "description": "Meter",
  "is_active": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uom_uuid",
    "symbol": "m",
    "description": "Meter",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update UOM

```
PUT /api/uom/:id
```

**Parameters:**

- `id` (path): UOM UUID

**Request Body:**

```json
{
  "description": "Updated Description",
  "is_active": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uom_uuid",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete UOM

```
DELETE /api/uom/:id
```

**Parameters:**

- `id` (path): UOM UUID

**Response:**

```json
{
  "success": true
}
```

---

## 6. Stock Groups Endpoints

### Get Stock Groups

```
GET /api/stock-groups?companyId=:companyId
```

**Query Parameters:**

- `companyId` (required): Company UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "stock_group_uuid",
      "company_id": "company_uuid",
      "name": "Electronics",
      "description": "Electronic items",
      "is_system": false,
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create Stock Group

```
POST /api/stock-groups
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "name": "Furniture",
  "description": "Furniture items",
  "is_system": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "stock_group_uuid",
    "name": "Furniture",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update Stock Group

```
PUT /api/stock-groups/:id
```

**Parameters:**

- `id` (path): Stock Group UUID

**Request Body:**

```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "stock_group_uuid",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete Stock Group

```
DELETE /api/stock-groups/:id
```

**Parameters:**

- `id` (path): Stock Group UUID

**Response:**

```json
{
  "success": true
}
```

---

## 7. Stock Categories Endpoints

### Get Stock Categories

```
GET /api/stock-categories?companyId=:companyId
```

**Query Parameters:**

- `companyId` (required): Company UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "stock_category_uuid",
      "company_id": "company_uuid",
      "name": "Raw Materials",
      "description": "Raw material items",
      "is_system": false,
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create Stock Category

```
POST /api/stock-categories
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "name": "Finished Goods",
  "description": "Finished goods inventory",
  "is_system": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "stock_category_uuid",
    "name": "Finished Goods",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update Stock Category

```
PUT /api/stock-categories/:id
```

**Parameters:**

- `id` (path): Stock Category UUID

**Request Body:**

```json
{
  "name": "Updated Category",
  "description": "Updated description"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "stock_category_uuid",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete Stock Category

```
DELETE /api/stock-categories/:id
```

**Parameters:**

- `id` (path): Stock Category UUID

**Response:**

```json
{
  "success": true
}
```

---

## 8. Vouchers Endpoints

### Get Vouchers

```
GET /api/vouchers?companyId=:companyId&type=:type&startDate=:startDate&endDate=:endDate
```

**Query Parameters:**

- `companyId` (required): Company UUID
- `type` (optional): "sales", "purchase", "payment", "receipt"
- `startDate` (optional): ISO 8601 date string
- `endDate` (optional): ISO 8601 date string

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "voucher_uuid",
      "company_id": "company_uuid",
      "voucher_type": "sales",
      "reference_no": "INV-001",
      "date": "2025-12-11T10:00:00Z",
      "party_name": "Customer A",
      "items": [
        {
          "id": "item_line_uuid",
          "item_id": "item_uuid",
          "description": "Product A",
          "quantity": 5,
          "rate": 100,
          "amount": 500,
          "tax_rate": 18,
          "tax_amount": 90
        }
      ],
      "ledger_entries": [
        {
          "id": "entry_uuid",
          "ledger_id": "ledger_uuid",
          "debit_amount": 590,
          "credit_amount": 0,
          "narration": "Sales of Product A"
        }
      ],
      "subtotal": 500,
      "tax_total": 90,
      "net_amount": 590,
      "notes": "Delivery by 12/15",
      "is_draft": false,
      "approval_status": "approved",
      "created_by": "user_uuid",
      "created_at": "2025-12-11T10:00:00Z"
    }
  ]
}
```

### Create Voucher

```
POST /api/vouchers
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "voucher_type": "sales",
  "reference_no": "INV-001",
  "date": "2025-12-11T10:00:00Z",
  "party_name": "Customer A",
  "party_gstin": "18AABCT1234K1Z0",
  "items": [
    {
      "item_id": "item_uuid",
      "description": "Product A",
      "quantity": 5,
      "rate": 100,
      "hsn_code": "123456",
      "tax_type": "IGST",
      "tax_rate": 18
    }
  ],
  "ledger_entries": [
    {
      "ledger_id": "ledger_uuid",
      "debit_amount": 590,
      "credit_amount": 0,
      "narration": "Sales of Product A"
    }
  ],
  "subtotal": 500,
  "tax_total": 90,
  "net_amount": 590,
  "notes": "Delivery by 12/15",
  "is_draft": false,
  "approval_status": "approved",
  "created_by": "user_uuid"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "voucher_uuid",
    "reference_no": "INV-001",
    "net_amount": 590,
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

### Update Voucher

```
PUT /api/vouchers/:id
```

**Parameters:**

- `id` (path): Voucher UUID

**Request Body:**

```json
{
  "reference_no": "INV-001-UPDATED",
  "party_name": "Updated Customer Name",
  "notes": "Updated notes"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "voucher_uuid",
    "reference_no": "INV-001-UPDATED",
    "updated_at": "2025-12-11T11:00:00Z"
  }
}
```

### Delete Voucher

```
DELETE /api/vouchers/:id
```

**Parameters:**

- `id` (path): Voucher UUID

**Response:**

```json
{
  "success": true
}
```

---

## 9. Report Endpoints

### Trial Balance Report

```
GET /api/ledgers/report/trial-balance?companyId=:companyId
```

### Balance Sheet Report

```
GET /api/ledgers/report/balance-sheet?companyId=:companyId
```

### Profit & Loss Report

```
GET /api/vouchers/report/profit-loss?companyId=:companyId&startDate=:startDate&endDate=:endDate
```

### Sales Register Report

```
GET /api/vouchers/report/sales-register?companyId=:companyId&startDate=:startDate&endDate=:endDate
```

### Purchase Register Report

```
GET /api/vouchers/report/purchase-register?companyId=:companyId&startDate=:startDate&endDate=:endDate
```

### Outstanding Receivables Report

```
GET /api/vouchers/report/outstanding-receivables?companyId=:companyId
```

### Outstanding Payables Report

```
GET /api/vouchers/report/outstanding-payables?companyId=:companyId
```

### Stock Summary Report

```
GET /api/vouchers/report/stock-summary?companyId=:companyId
```

### Voucher History Report

```
GET /api/vouchers/report/history?companyId=:companyId&startDate=:startDate&endDate=:endDate
```

---

## 10. Settings Endpoints

### Save Settings

```
POST /api/settings
```

**Request Body:**

```json
{
  "company_id": "company_uuid",
  "user_id": "user_uuid",
  "financial_year_start": "2025-01-01",
  "financial_year_end": "2025-12-31",
  "default_gst_rate": 18,
  "enable_tax": true,
  "enable_stock": true,
  "enable_budget": false,
  "number_format": "1,000.00",
  "date_format": "MM/DD/YYYY"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "settings_uuid",
    "company_id": "company_uuid",
    "created_at": "2025-12-11T10:00:00Z"
  }
}
```

---

## Error Responses

All endpoints return error responses in this format:

```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes:

- **200**: Success
- **201**: Created
- **400**: Bad Request (missing or invalid parameters)
- **401**: Unauthorized (invalid session)
- **404**: Not Found
- **500**: Server Error

---

## Example Usage in Frontend

```typescript
// Create a company
const response = await fetch("http://localhost:5000/api/companies", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    companyData: {
      name: "My Company",
      country: "US",
      admin_username: "admin",
      admin_password: "password123",
    },
    userId: userUUID,
  }),
});

const result = await response.json();
if (result.success) {
  console.log("Company created:", result.data.id);
}

// Get groups for creating ledger
const groupsRes = await fetch(
  `http://localhost:5000/api/groups?companyId=${companyId}`
);
const groupsData = await groupsRes.json();
```
