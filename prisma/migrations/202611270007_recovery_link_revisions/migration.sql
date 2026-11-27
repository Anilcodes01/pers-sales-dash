BEGIN;
ALTER TABLE public.recovery_leads
  ADD COLUMN IF NOT EXISTS link_change_token uuid,
  ADD COLUMN IF NOT EXISTS link_change_until timestamptz;
CREATE TABLE IF NOT EXISTS public.recovery_payment_revisions (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL, account_key text NOT NULL, executive_id uuid NOT NULL,
 old_remaining text NOT NULL, old_url text NOT NULL, old_reference varchar(40) UNIQUE,
 old_provider_id text, old_amount_paise bigint, old_status text NOT NULL DEFAULT '',
 desired_amount text NOT NULL, amount_paise bigint NOT NULL, new_reference varchar(40) NOT NULL UNIQUE,
 new_provider_id text, new_url text NOT NULL DEFAULT '', new_status text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending', error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_payment_revisions_lead_id_account_key_idx
 ON public.recovery_payment_revisions(lead_id, account_key);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_payment_revisions_one_pending
 ON public.recovery_payment_revisions(lead_id, account_key) WHERE status = 'pending';
ALTER TABLE public.recovery_payment_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recovery_payment_revisions FROM anon, authenticated;
COMMIT;
