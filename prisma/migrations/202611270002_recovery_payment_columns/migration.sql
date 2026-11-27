-- Retain legacy registration values; new uploads no longer supply this field.
ALTER TABLE public.recovery_leads
  ALTER COLUMN registration_amount SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount_paid text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS remaining_amount text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_links text NOT NULL DEFAULT '';
