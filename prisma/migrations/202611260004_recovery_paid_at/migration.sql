ALTER TABLE public.recovery_leads ADD COLUMN paid_at timestamptz;
CREATE INDEX recovery_leads_paid_at_idx ON public.recovery_leads(paid_at);
