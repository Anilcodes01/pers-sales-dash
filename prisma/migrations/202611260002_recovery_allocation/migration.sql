ALTER TABLE public.recovery_leads
  ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN assigned_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN assigned_at timestamptz;
CREATE INDEX recovery_leads_assigned_to_selected_month_idx ON public.recovery_leads(assigned_to, selected_month);
CREATE INDEX recovery_leads_selected_month_idx ON public.recovery_leads(selected_month);
