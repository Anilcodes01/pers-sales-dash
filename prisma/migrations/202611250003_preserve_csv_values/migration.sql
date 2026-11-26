ALTER TABLE public.sales_records
  ADD COLUMN raw_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ALTER COLUMN date_from_csv DROP NOT NULL,
  ALTER COLUMN total_amount DROP NOT NULL,
  ALTER COLUMN registration_amount DROP NOT NULL,
  ALTER COLUMN name TYPE text,
  ALTER COLUMN college TYPE text,
  ALTER COLUMN email_id TYPE text,
  ALTER COLUMN phone TYPE text,
  ALTER COLUMN whatsapp TYPE text,
  ALTER COLUMN program_plan TYPE text,
  ALTER COLUMN comments TYPE text;
ALTER TABLE public.sales_records DROP CONSTRAINT IF EXISTS sales_records_total_amount_check;
ALTER TABLE public.sales_records DROP CONSTRAINT IF EXISTS sales_records_registration_amount_check;
