CREATE TABLE public.sales_imports (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reporting_month date NOT NULL,
  filename varchar(255) NOT NULL,
  row_count integer NOT NULL CHECK (row_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_imports_owner_id_reporting_month_idx ON public.sales_imports(owner_id, reporting_month);
CREATE TABLE public.sales_records (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reporting_month date NOT NULL,
  date_from_csv date NOT NULL,
  name varchar(200) NOT NULL,
  college varchar(500) NOT NULL,
  email_id varchar(254),
  phone varchar(40),
  whatsapp varchar(40),
  program_plan varchar(200) NOT NULL,
  total_amount integer NOT NULL CHECK (total_amount >= 0),
  registration_amount integer NOT NULL CHECK (registration_amount >= 0 AND registration_amount <= total_amount),
  comments varchar(5000),
  row_hash varchar(64) NOT NULL,
  source_row integer NOT NULL,
  import_id uuid NOT NULL REFERENCES public.sales_imports(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, reporting_month, row_hash)
);
CREATE INDEX sales_records_owner_id_reporting_month_date_from_csv_idx ON public.sales_records(owner_id, reporting_month, date_from_csv);
ALTER TABLE public.sales_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_imports, public.sales_records FROM anon, authenticated;
