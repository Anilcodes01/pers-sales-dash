BEGIN;
ALTER TABLE public.recovery_payment_items ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
-- Match the Recovery Overview sheet, including existing/resumable jobs.
WITH ordered AS (
  SELECT i.id, (row_number() OVER (
    PARTITION BY i.job_id ORDER BY l.created_at DESC NULLS LAST, l.id ASC NULLS LAST, i.id ASC
  ) - 1)::integer AS position
  FROM public.recovery_payment_items i
  LEFT JOIN public.recovery_leads l ON l.id = i.lead_id
)
UPDATE public.recovery_payment_items i SET position = ordered.position
FROM ordered WHERE ordered.id = i.id;
CREATE INDEX IF NOT EXISTS recovery_payment_items_job_id_position_idx
  ON public.recovery_payment_items(job_id, position);
COMMIT;
