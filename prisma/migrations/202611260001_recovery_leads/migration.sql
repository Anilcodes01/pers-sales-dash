CREATE TABLE public.recovery_leads (
  id uuid PRIMARY KEY,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL,
  filename varchar(255) NOT NULL,
  source_row integer NOT NULL,
  timestamp text NOT NULL,
  student_name text NOT NULL,
  student_phone text NOT NULL,
  student_email text NOT NULL,
  student_college_email text NOT NULL,
  executive_name text NOT NULL,
  amount_mentioned text NOT NULL,
  registration_amount text NOT NULL,
  program_plan text NOT NULL,
  domain text NOT NULL,
  selected_month text NOT NULL,
  referrals text NOT NULL,
  payment_status text NOT NULL,
  lead_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_leads_created_at_id_idx ON public.recovery_leads(created_at, id);
CREATE INDEX recovery_leads_upload_id_idx ON public.recovery_leads(upload_id);
ALTER TABLE public.recovery_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recovery_leads FROM anon, authenticated;
