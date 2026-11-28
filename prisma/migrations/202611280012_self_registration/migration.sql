CREATE TABLE public.registration_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL
);
CREATE INDEX registration_rate_limits_expiry_idx ON public.registration_rate_limits(expires_at);
ALTER TABLE public.registration_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_rate_limits FROM anon, authenticated;
