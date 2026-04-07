# Tally Clone Backend Server

A Node.js/Express backend server for the Tally Clone accounting application. This server handles company creation, database initialization, and other backend operations.

## Features

- ✅ Automatic database schema initialization
- ✅ Company creation with default ledger groups
- ✅ User management and authentication
- ✅ Secure password hashing with bcrypt
- ✅ RESTful API endpoints
- ✅ CORS support for frontend integration

## Prerequisites

- Node.js v16+
- npm or yarn
- Supabase project with API credentials

## Installation

### 1. Install Dependencies

```powershell
cd backend
npm install
```

### 2. Get Supabase Service Role Key

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **Project Settings** → **API**
4. Copy the **Service Role Key** (NOT the anon key)

### 3. Configure Environment Variables

Create a `.env` file in the `backend` folder:

```
VITE_SUPABASE_URL="https://haxmvqupuaziesckyers.supabase.co"
VITE_SUPABASE_PROJECT_ID="haxmvqupuaziesckyers"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheG12cXVwdWF6aWVzY2t5ZXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzQxOTcsImV4cCI6MjA4MDMxMDE5N30.d7ze7B34Y9-19crzTYr2KeTLUfPlujanXLo9RMtmFOA"

PORT=5000
NODE_ENV=development

SUPABASE_SERVICE_ROLE_KEY="paste-your-service-role-key-here"
```

Replace `SUPABASE_SERVICE_ROLE_KEY` with the actual service role key from Supabase.

## Running the Server

### Development Mode (with auto-reload)

```powershell
npm run dev
```

### Production Mode

```powershell
npm start
```

The server will start at `http://localhost:5000`

## API Endpoints

### Health Check

```
GET /health
```

### Create Company

```
POST /api/companies
Content-Type: application/json

{
  "companyData": {
    "name": "My Company",
    "country": "India",
    "state": "Maharashtra",
    "city": "Mumbai",
    "address": "123 Main Street",
    "postal_code": "400001",
    "currency": "INR",
    "tax_type": "GST",
    "tax_registration_number": "27AABXX1234X1Z0",
    "financial_year_start": "2024-04-01",
    "financial_year_end": "2025-03-31",
    "books_beginning": "2024-04-01",
    "admin_username": "admin",
    "admin_password": "password123"
  },
  "userId": "user-uuid-here"
}
```

Response:

```json
{
  "success": true,
  "company": {
    "id": "company-uuid",
    "name": "My Company",
    ...
  },
  "message": "Company created successfully with default ledger groups"
}
```

### Get User Companies

```
GET /api/companies/:userId
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "company-uuid",
      "name": "My Company",
      ...
    }
  ]
}
```

### Update Company

```
PUT /api/companies/:companyId
Content-Type: application/json

{
  "updateData": {
    "name": "Updated Company Name",
    "address": "456 New Street"
  },
  "userId": "user-uuid-here"
}
```

## Database Schema

The server automatically initializes the following tables:

- `companies` - Company master data
- `company_users` - Company admin users
- `groups` - Ledger groups (assets, liabilities, income, expenses)
- `ledgers` - Individual ledger accounts

### Default Ledger Groups Created

When a company is created, the following default ledger groups are automatically created:

**Assets:**

- Fixed Assets
- Current Assets
- Bank Accounts
- Cash
- Sundry Debtors

**Liabilities:**

- Capital Account
- Current Liabilities
- Loans & Borrowings
- Sundry Creditors

**Income:**

- Income
- Sales
- Service Income

**Expenses:**

- Expenses
- Cost of Goods Sold
- Operating Expenses

**Other:**

- Duties & Taxes

## Troubleshooting

### Error: "SUPABASE_SERVICE_ROLE_KEY not found"

Make sure you've created the `.env` file and added your Supabase service role key.

### Error: "Could not find table public.companies"

The backend server will automatically create all required tables on first run. Make sure the service role key has sufficient permissions.

### CORS Errors

The server is configured to accept requests from:

- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000`
- `http://127.0.0.1:5173`
- `http://127.0.0.1:3000`

If you're running the frontend on a different port, add it to the CORS configuration in `server.js`.

## Development

To run both frontend and backend simultaneously:

### Terminal 1 - Backend

```powershell
cd backend
npm run dev
```

### Terminal 2 - Frontend

```powershell
npm run dev
```

Then visit `http://localhost:5173` in your browser.

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Use a process manager like PM2:

```powershell
npm install -g pm2
pm2 start backend/server.js --name "tally-backend"
```

3. Or deploy to cloud platforms like:
   - Vercel
   - Railway
   - Render
   - Heroku

## Project Structure

```
backend/
├── server.js              # Main Express server
├── db.js                  # Database initialization
├── package.json
├── .env                   # Environment variables
├── .env.example           # Example env file
├── routes/
│   └── companies.js       # Company API routes
└── services/
    └── companyService.js  # Business logic
```

## License

ISC

## Support

For issues or questions, please check:

1. The `.env` file is properly configured
2. The Supabase service role key is correct
3. The backend server is running on port 5000
4. Network connectivity to Supabase
