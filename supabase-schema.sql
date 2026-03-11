-- ============================================================
-- KAIFA WMS — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- (Dashboard > SQL Editor > New Query > paste > Run)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS / PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('admin', 'standard', 'limited')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), COALESCE(NEW.raw_user_meta_data->>'role', 'standard'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  billing TEXT NOT NULL DEFAULT 'uk' CHECK (billing IN ('china', 'uk')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DELIVERY ADDRESSES
-- ============================================================
CREATE TABLE delivery_addresses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  max_delivery_cap NUMERIC(10,2) NOT NULL DEFAULT 180.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE branches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HAWB NUMBER POOL
-- ============================================================
CREATE TABLE hawb_numbers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hawb_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used')),
  assigned_to_invoice UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STOCK / INVENTORY
-- ============================================================
CREATE TABLE stock (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_number TEXT NOT NULL UNIQUE,          -- e.g. JOB-0147
  jade_reference TEXT NOT NULL,             -- Customer invoice / packing number
  customer_po TEXT,
  product TEXT NOT NULL,
  stock_amount INTEGER DEFAULT 0,
  carton_amount INTEGER DEFAULT 0,
  pallet_amount INTEGER DEFAULT 0,
  weight_kg NUMERIC(10,2),
  dimensions_mm TEXT,                       -- e.g. 1200x800x900
  receive_date DATE NOT NULL,
  warehouse_location TEXT,
  pallet_numbers TEXT,                      -- comma-separated
  carton_numbers TEXT,                      -- comma-separated
  billing TEXT NOT NULL DEFAULT 'uk' CHECK (billing IN ('china', 'uk')),
  status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'part_despatched', 'despatched', 'invoiced')),
  -- Delivery info (populated when despatch is scheduled)
  delivery_date DATE,
  delivery_address_id UUID REFERENCES delivery_addresses(id),
  customer_id UUID REFERENCES customers(id),
  branch_id UUID REFERENCES branches(id),
  booking_reference TEXT,
  hawb_number TEXT,
  delivery_instructions TEXT,
  internal_notes TEXT,                      -- Never shown on invoices / customer docs
  -- Split tracking
  parent_stock_id UUID REFERENCES stock(id),
  is_split BOOLEAN DEFAULT FALSE,
  split_type TEXT CHECK (split_type IN ('carton', 'pallet')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job number auto-increment sequence
CREATE SEQUENCE job_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'JOB-' || LPAD(nextval('job_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_job_number
  BEFORE INSERT ON stock
  FOR EACH ROW EXECUTE FUNCTION generate_job_number();

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,      -- e.g. INV-2024-0124
  hawb_number TEXT,
  billing TEXT NOT NULL DEFAULT 'uk' CHECK (billing IN ('china', 'uk')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Totals (calculated and stored for reporting)
  total_storage NUMERIC(10,2) DEFAULT 0,
  total_handling_in NUMERIC(10,2) DEFAULT 0,
  total_handling_out NUMERIC(10,2) DEFAULT 0,
  total_delivery NUMERIC(10,2) DEFAULT 0,
  total_packing NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  -- Override
  override_total NUMERIC(10,2),
  override_reason TEXT,
  email_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-increment invoice number
CREATE SEQUENCE invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ============================================================
-- INVOICE LINE ITEMS (links invoice to stock lines)
-- ============================================================
CREATE TABLE invoice_lines (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES stock(id),
  -- Charge breakdown per line
  days_stored INTEGER DEFAULT 0,
  chargeable_days INTEGER DEFAULT 0,
  storage_charge NUMERIC(10,2) DEFAULT 0,
  handling_in_charge NUMERIC(10,2) DEFAULT 0,
  handling_out_charge NUMERIC(10,2) DEFAULT 0,
  delivery_charge NUMERIC(10,2) DEFAULT 0,
  packing_charge NUMERIC(10,2) DEFAULT 0,
  line_total NUMERIC(10,2) DEFAULT 0,
  -- DHL China approval checkbox (limited users only)
  china_approved BOOLEAN DEFAULT FALSE,
  china_approved_by UUID REFERENCES profiles(id),
  china_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,                     -- e.g. STOCK_ADDED, INVOICE_SENT, STOCK_SPLIT
  reference TEXT,                           -- e.g. JADE-2024-0891 or INV-2024-0124
  detail TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log is append-only — prevent updates and deletes
CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ============================================================
-- CHARGE RATES (editable in Settings)
-- ============================================================
CREATE TABLE charge_rates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  rate_key TEXT NOT NULL UNIQUE,
  rate_value NUMERIC(10,4) NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default charge rates
INSERT INTO charge_rates (rate_key, rate_value, description) VALUES
  ('storage_per_pallet_per_day', 0.69, 'Storage charge per pallet per day'),
  ('storage_free_days', 14, 'Number of free days before storage is charged'),
  ('handling_in_per_pallet', 5.48, 'Handling in charge per pallet'),
  ('handling_out_per_pallet', 2.50, 'Handling out charge per pallet'),
  ('handling_out_per_carton_split', 0.50, 'Handling out per carton for split lines'),
  ('packing_per_carton', 0.50, 'Packing charge per carton'),
  ('delivery_per_pallet', 60.00, 'Delivery charge per pallet (before address cap)');

-- ============================================================
-- SEED DATA — Products (reference only, stored as TEXT on stock)
-- ============================================================
CREATE TABLE products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT TRUE
);

INSERT INTO products (name) VALUES
  ('UK Charger'),
  ('CN Charger'),
  ('Power Bank'),
  ('EV Module'),
  ('Solar Unit'),
  ('Battery Pack'),
  ('Inverter');

-- ============================================================
-- SEED DATA — Branches
-- ============================================================
INSERT INTO branches (name, location) VALUES
  ('Branch 1', 'London'),
  ('Branch 2', 'Birmingham'),
  ('Branch 3', 'Manchester');

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hawb_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Profiles: users can read all, update only own
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_select" ON profiles FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "profiles_admin_insert" ON profiles FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "profiles_admin_delete" ON profiles FOR DELETE USING (get_my_role() = 'admin');

-- Stock: all authenticated can read; limited users read-only
CREATE POLICY "stock_read" ON stock FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "stock_write" ON stock FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "stock_update" ON stock FOR UPDATE USING (get_my_role() IN ('admin', 'standard'));

-- Invoices: all authenticated can read; limited read-only
CREATE POLICY "invoices_read" ON invoices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "invoices_write" ON invoices FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "invoices_update" ON invoices FOR UPDATE USING (get_my_role() IN ('admin', 'standard'));

-- Invoice lines
CREATE POLICY "invoice_lines_read" ON invoice_lines FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "invoice_lines_write" ON invoice_lines FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "invoice_lines_update" ON invoice_lines FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Audit log: all authenticated can read; only system can insert via functions
CREATE POLICY "audit_read" ON audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "audit_insert" ON audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Lookup tables: all authenticated can read
CREATE POLICY "customers_read" ON customers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "customers_delete" ON customers FOR DELETE USING (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "addresses_read" ON delivery_addresses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "addresses_insert" ON delivery_addresses FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "addresses_update" ON delivery_addresses FOR UPDATE USING (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "addresses_delete" ON delivery_addresses FOR DELETE USING (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "branches_read" ON branches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "hawb_read" ON hawb_numbers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "hawb_insert" ON hawb_numbers FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "hawb_update" ON hawb_numbers FOR UPDATE USING (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "hawb_delete" ON hawb_numbers FOR DELETE USING (get_my_role() IN ('admin', 'standard'));
CREATE POLICY "rates_read" ON charge_rates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rates_insert" ON charge_rates FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "rates_update" ON charge_rates FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "rates_delete" ON charge_rates FOR DELETE USING (get_my_role() = 'admin');
CREATE POLICY "products_read" ON products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "products_update" ON products FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "products_delete" ON products FOR DELETE USING (get_my_role() = 'admin');
