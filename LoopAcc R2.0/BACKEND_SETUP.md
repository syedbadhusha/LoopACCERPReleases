# Backend Setup - Step by Step

## Error: npm run dev failed

If you're getting an error, follow these steps:

### Step 1: Clear node_modules and reinstall

```powershell
cd backend
rm -r node_modules -Force
npm cache clean --force
npm install
```

### Step 2: Check .env file

Make sure `backend/.env` exists and has:

```
VITE_SUPABASE_URL="https://haxmvqupuaziesckyers.supabase.co"
VITE_SUPABASE_PROJECT_ID="haxmvqupuaziesckyers"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhheG12cXVwdWF6aWVzY2t5ZXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzQxOTcsImV4cCI6MjA4MDMxMDE5N30.d7ze7B34Y9-19crzTYr2KeTLUfPlujanXLo9RMtmFOA"

PORT=5000
NODE_ENV=development

SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

**Important:** Replace `SUPABASE_SERVICE_ROLE_KEY` with your actual service role key from Supabase.

### Step 3: Get Service Role Key from Supabase

1. Go to https://app.supabase.com
2. Click on your project (haxmvqupuaziesckyers)
3. Go to **Settings** → **API** (on the left sidebar)
4. Under "Project API Keys", find and copy the **Service Role Key** (not the anon key!)
5. Paste it in the `.env` file as `SUPABASE_SERVICE_ROLE_KEY`

### Step 4: Create Database Tables

You need to create the tables in Supabase first (the backend checks for them but doesn't auto-create yet).

Run this SQL in Supabase SQL Editor:

1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Copy and paste this SQL:

```sql
-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    pan TEXT,
    country TEXT,
    state TEXT,
    city TEXT,
    postal_code TEXT,
    currency TEXT DEFAULT 'INR',
    tax_type TEXT,
    tax_registration_number TEXT,
    books_beginning DATE,
    financial_year_start DATE DEFAULT '2024-04-01',
    financial_year_end DATE DEFAULT '2025-03-31',
    admin_password_hash TEXT,
    admin_username TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.company_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.groups(id),
    name TEXT NOT NULL,
    nature TEXT NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, name)
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ledgers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.groups(id),
    name TEXT NOT NULL,
    opening_balance DECIMAL(15,2) DEFAULT 0,
    balance_type TEXT DEFAULT 'debit' CHECK (balance_type IN ('debit', 'credit')),
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    postal_code TEXT,
    phone TEXT,
    email TEXT,
    tax_registration_number TEXT,
    tax_type TEXT,
    credit_days INTEGER,
    credit_limit DECIMAL(15,2),
    is_active BOOLEAN DEFAULT true,
    alias TEXT,
    gstin TEXT,
    pan TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, name)
);

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
```

4. Click "Run"

### Step 5: Start Backend

```powershell
cd backend
npm run dev
```

You should see:

```
✓ Backend server running at http://localhost:5000
✓ CORS enabled for local frontend
```

### Common Errors

**Error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"**

- Check that `.env` file exists in `backend/` folder
- Check that both `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

**Error: "EADDRINUSE: address already in use :::5000"**

- Another process is using port 5000
- Either kill it or change PORT in `.env` to a different number (e.g., 5001)

**Error: "Tables do not exist"**

- You need to run the SQL migration shown above in Supabase SQL Editor first

## Running Frontend & Backend Together

### Terminal 1 - Backend

```powershell
cd backend
npm run dev
```

### Terminal 2 - Frontend

```powershell
# From root directory
npm run dev
```

Then open http://localhost:5173 in your browser.

## Need Help?

1. Check the error message in the terminal
2. Make sure `.env` has correct values
3. Make sure all dependencies installed: `npm install` in backend folder
4. Make sure database tables exist (run SQL migration above)
5. Make sure backend is running on port 5000
