CREATE SEQUENCE public.employee_id_sequence MAXVALUE 999999;
CREATE FUNCTION public.format_employee_number(value bigint) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lpad(value::text, greatest(3, length(value::text)), '0');
$$;
CREATE TABLE public.employee_identifiers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id text NOT NULL UNIQUE DEFAULT ('PX' || public.format_employee_number(nextval('public.employee_id_sequence'))),
  CONSTRAINT employee_id_format CHECK (employee_id ~ '^PX[0-9]{3,6}$')
);
ALTER TABLE public.employee_identifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_identifiers FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.employee_id_sequence FROM anon, authenticated;
CREATE FUNCTION public.assign_employee_identifier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.employee_identifiers(user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_employee_identifier() FROM PUBLIC;
CREATE TRIGGER assign_employee_identifier AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_identifier();
INSERT INTO public.employee_identifiers(user_id)
SELECT id FROM auth.users ORDER BY created_at, id;
