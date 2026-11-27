BEGIN;
ALTER TABLE public.recovery_payment_jobs ADD COLUMN IF NOT EXISTS next_request_at timestamptz;
DROP INDEX IF EXISTS public.recovery_payment_jobs_one_active;
CREATE UNIQUE INDEX recovery_payment_jobs_one_active
  ON public.recovery_payment_jobs(account_key)
  WHERE status IN ('running', 'stopping');
COMMIT;
