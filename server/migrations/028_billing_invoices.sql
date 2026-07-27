-- Server-persisted VAT invoices for Stripe Checkout payments (promote, plans, escrow fees).
CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  stripe_invoice_id TEXT,
  kind TEXT NOT NULL,
  product_id TEXT,
  listing_id TEXT,
  service_title TEXT NOT NULL DEFAULT 'VAUTO paslauga',
  service_description TEXT,
  amount_net NUMERIC(12, 2) NOT NULL,
  vat_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.21,
  vat_amount NUMERIC(12, 2) NOT NULL,
  amount_gross NUMERIC(12, 2) NOT NULL,
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_company_name TEXT,
  buyer_company_code TEXT,
  buyer_vat_code TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_invoices_user_idx ON billing_invoices (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_stripe_session_uidx
  ON billing_invoices (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
