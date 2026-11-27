CREATE TABLE IF NOT EXISTS public.recovery_payment_jobs (
 id uuid PRIMARY KEY, account_key text NOT NULL, selected_month text, created_by uuid NOT NULL,
 status text NOT NULL DEFAULT 'running', lock_token uuid, locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_payment_jobs_account_key_created_at_idx ON public.recovery_payment_jobs(account_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_payment_jobs_one_active ON public.recovery_payment_jobs(account_key) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS public.recovery_payment_items (
 id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES public.recovery_payment_jobs(id) ON DELETE RESTRICT,
 lead_id uuid NOT NULL, student_name text NOT NULL, remaining_amount text NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 reason text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '', retry_at timestamptz,
 UNIQUE(job_id, lead_id)
);
CREATE INDEX IF NOT EXISTS recovery_payment_items_job_id_status_idx ON public.recovery_payment_items(job_id, status);
CREATE TABLE IF NOT EXISTS public.recovery_payment_links (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL, account_key text NOT NULL, amount_paise bigint NOT NULL,
 reference varchar(40) NOT NULL UNIQUE, provider_id text UNIQUE, url text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(lead_id, account_key)
);
ALTER TABLE public.recovery_payment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_payment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recovery_payment_jobs, public.recovery_payment_items, public.recovery_payment_links FROM anon, authenticated;
