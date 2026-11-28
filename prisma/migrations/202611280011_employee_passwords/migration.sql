ALTER TABLE public.employee_identifiers ADD COLUMN decrypted_password text;
-- Never retain an old password when Auth changes it outside this dashboard.
CREATE FUNCTION public.clear_employee_password() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    UPDATE public.employee_identifiers SET decrypted_password = NULL WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_employee_password() FROM PUBLIC;
CREATE TRIGGER clear_employee_password AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.clear_employee_password();
