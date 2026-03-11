# Kaifa WMS — Warehouse Management System

A full warehouse & logistics management system built with **React**, **Supabase** (free tier), and **Netlify** (free tier). No software installs required on your computer.

---

## 🚀 Deploy in 5 Steps (all free, no installs needed)

### STEP 1 — Put the code on GitHub

1. Go to **https://github.com** and sign up / log in (free)
2. Click the **+** icon → **New repository**
3. Name it `kaifa-wms`, set it to **Private**, click **Create repository**
4. On the next screen, click **uploading an existing file**
5. Drag and drop the entire `kaifa-wms` folder contents into the upload area
6. Click **Commit changes**

---

### STEP 2 — Create your Supabase project

1. Go to **https://supabase.com** and sign up / log in (free)
2. Click **New project**
3. Name it `kaifa-wms`, choose a strong database password (save it!), pick your nearest region
4. Wait ~2 minutes for the project to spin up
5. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://abcxyz.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

### STEP 3 — Run the database schema

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase-schema.sql` from this project
4. Copy the entire contents and paste into the SQL editor
5. Click **Run** (green button)
6. You should see "Success. No rows returned" — your database is ready

---

### STEP 4 — Create your first Admin user

1. In Supabase, go to **Authentication → Users**
2. Click **Add user → Create new user**
3. Enter your email and a password → click **Create user**
4. Now go to **Table Editor → profiles** and find your user
5. Click the row, change the `role` field from `standard` to `admin`
6. Click **Save**

---

### STEP 5 — Deploy to Netlify

1. Go to **https://netlify.com** and sign up / log in with your GitHub account (free)
2. Click **Add new site → Import an existing project**
3. Choose **GitHub** and select your `kaifa-wms` repository
4. Build settings will be detected automatically (React app)
   - Build command: `npm run build`
   - Publish directory: `build`
5. Click **Show advanced** → **New variable** and add:
   - Key: `REACT_APP_SUPABASE_URL` → Value: your Supabase Project URL
   - Key: `REACT_APP_SUPABASE_ANON_KEY` → Value: your Supabase anon key
6. Click **Deploy site**
7. In ~2 minutes your site will be live at a `.netlify.app` URL

---

## 🔐 User Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — create users, manage settings, HAWB numbers, all operations |
| **Standard** | Full operational access — stock, invoices, deliveries, price overrides |
| **Limited** | Read-only — view all stock & invoices, tick DHL China approval checkboxes |

To create new users: log in as Admin → **Users** → **Add User** (welcome email sent automatically via Supabase Auth)

---

## 📁 Project Structure

```
kaifa-wms/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   └── Layout.js          ← Sidebar, topbar, navigation
│   ├── hooks/
│   │   └── useAuth.js         ← Authentication context
│   ├── lib/
│   │   ├── supabase.js        ← Supabase client
│   │   ├── audit.js           ← Audit log helper
│   │   └── charges.js         ← All billing/charge calculations
│   ├── pages/
│   │   ├── LoginPage.js       ← Login + forgot password
│   │   ├── Dashboard.js       ← Live KPIs + activity feed
│   │   ├── StockPage.js       ← Stock inventory + add/split
│   │   ├── InvoicesPage.js    ← Invoice creation + management
│   │   ├── DeliveriesPage.js  ← Delivery scheduling
│   │   ├── SearchPage.js      ← Search by JADE/HAWB/Job No.
│   │   ├── KaifaStockList.js  ← Kaifa stock report
│   │   ├── ChinaReport.js     ← Monthly DHL China Excel report
│   │   ├── AuditLog.js        ← Immutable audit trail
│   │   ├── UsersPage.js       ← User management (admin only)
│   │   ├── SettingsPage.js    ← Charge rates, addresses, archiving
│   │   └── HawbPage.js        ← HAWB number pool
│   ├── styles/
│   │   └── global.css         ← Dark DHL-themed design system
│   └── App.js                 ← Routes + auth guards
├── supabase-schema.sql        ← Complete database schema + RLS
├── netlify.toml               ← Netlify build config
├── .env.example               ← Environment variable template
└── package.json
```

---

## 💰 Charge Rates (configurable in Settings)

| Charge | Rate |
|--------|------|
| Storage per pallet/day | £0.69 (first 14 days free) |
| Handling in per pallet | £5.48 |
| Handling out per pallet | £2.50 |
| Handling out per carton (split) | £0.50 |
| Packing per carton | £0.50 |
| Delivery per pallet | £60.00 (capped per address) |

Pallet splits carry full charges. Carton-only splits have no storage or handling-in charge.

---

## 🛠 Local Development (optional)

If you ever get Node.js installed:

```bash
cp .env.example .env.local
# Fill in your Supabase credentials in .env.local
npm install
npm start
```

---

## 📧 Email Features (via Supabase)

- **Forgot password** — Supabase handles this automatically
- **New user welcome** — configure email templates in Supabase Auth → Email Templates
- **Invoice emails** — implement via Supabase Edge Functions (next phase)
- **Monthly China report** — implement via Supabase scheduled Edge Functions (next phase)
