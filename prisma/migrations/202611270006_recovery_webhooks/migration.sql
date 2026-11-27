CREATE TABLE IF NOT EXISTS public.recovery_webhook_events (
 event_id varchar(255) PRIMARY KEY,
 payload_hash char(64) NOT NULL,
 provider_link_id text NOT NULL,
 event_type text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recovery_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recovery_webhook_events FROM anon, authenticated;
