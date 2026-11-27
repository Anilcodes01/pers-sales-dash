CREATE TABLE IF NOT EXISTS public.recovery_periods (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  started_by uuid NOT NULL,
  ended_by uuid,
  CONSTRAINT recovery_period_dates CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_periods_one_active ON public.recovery_periods ((true)) WHERE ended_at IS NULL;
ALTER TABLE public.recovery_periods ENABLE ROW LEVEL SECURITY;
