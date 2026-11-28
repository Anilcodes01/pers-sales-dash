ALTER TABLE public.recovery_sheet_changes ADD COLUMN old_executive_id text, ADD COLUMN new_executive_id text;
CREATE INDEX recovery_sheet_sales_old ON public.recovery_sheet_changes(old_executive_id,id);
CREATE INDEX recovery_sheet_sales_new ON public.recovery_sheet_changes(new_executive_id,id);
CREATE OR REPLACE FUNCTION public.recovery_sheet_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE fresh jsonb; prior jsonb; delta jsonb;
BEGIN
 IF TG_OP <> 'DELETE' THEN fresh := jsonb_build_object('id', NEW.id,
'assignedTo', NEW.assigned_to,
'assignedAt', NEW.assigned_at,
'createdAt', NEW.created_at,
'paidAt', NEW.paid_at,
'timestamp', NEW.timestamp,
'studentName', NEW.student_name,
'studentPhone', NEW.student_phone,
'studentEmail', NEW.student_email,
'studentCollegeEmail', NEW.student_college_email,
'executiveName', NEW.executive_name,
'executiveId', NEW.executive_id,
'salesAssignedTo', NEW.sales_assigned_to,
'amountMentioned', NEW.amount_mentioned,
'programPlan', NEW.program_plan,
'domain', NEW.domain,
'selectedMonth', NEW.selected_month,
'referrals', NEW.referrals,
'amountPaid', NEW.amount_paid,
'paymentStatus', NEW.payment_status,
'leadStatus', NEW.lead_status,
'comments', NEW.comments,
'remainingAmount', NEW.remaining_amount,
'paymentLinks', NEW.payment_links); END IF;
 IF TG_OP <> 'INSERT' THEN prior := jsonb_build_object('id', OLD.id,
'assignedTo', OLD.assigned_to,
'assignedAt', OLD.assigned_at,
'createdAt', OLD.created_at,
'paidAt', OLD.paid_at,
'timestamp', OLD.timestamp,
'studentName', OLD.student_name,
'studentPhone', OLD.student_phone,
'studentEmail', OLD.student_email,
'studentCollegeEmail', OLD.student_college_email,
'executiveName', OLD.executive_name,
'executiveId', OLD.executive_id,
'salesAssignedTo', OLD.sales_assigned_to,
'amountMentioned', OLD.amount_mentioned,
'programPlan', OLD.program_plan,
'domain', OLD.domain,
'selectedMonth', OLD.selected_month,
'referrals', OLD.referrals,
'amountPaid', OLD.amount_paid,
'paymentStatus', OLD.payment_status,
'leadStatus', OLD.lead_status,
'comments', OLD.comments,
'remainingAmount', OLD.remaining_amount,
'paymentLinks', OLD.payment_links); END IF;
 IF TG_OP='UPDATE' AND fresh=prior THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
    AND NEW.selected_month IS NOT DISTINCT FROM OLD.selected_month
    AND NEW.executive_id IS NOT DISTINCT FROM OLD.executive_id
    AND NEW.sales_assigned_to IS NOT DISTINCT FROM OLD.sales_assigned_to THEN
   SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO delta FROM jsonb_each(fresh)
    WHERE prior->key IS DISTINCT FROM value;
   delta := delta || jsonb_build_object('id',NEW.id);
 ELSE delta := fresh; END IF;
 INSERT INTO public.recovery_sheet_changes(lead_id,old_month,new_month,old_assigned_to,new_assigned_to,old_executive_id,new_executive_id,patch)
 VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.selected_month END,
 CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.selected_month END,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.assigned_to END,
 CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.assigned_to END,
 CASE WHEN TG_OP='INSERT' THEN NULL WHEN OLD.sales_assigned_to='Unassigned' THEN NULL ELSE nullif(OLD.executive_id,'') END,
 CASE WHEN TG_OP='DELETE' THEN NULL WHEN NEW.sales_assigned_to='Unassigned' THEN NULL ELSE nullif(NEW.executive_id,'') END,delta);
 RETURN NULL;
END; $$;


INSERT INTO public.recovery_sheet_changes(lead_id) VALUES ('00000000-0000-0000-0000-000000000000');
UPDATE public.recovery_sync_epoch SET floor_id=(SELECT max(id) FROM public.recovery_sheet_changes) WHERE singleton=true;
