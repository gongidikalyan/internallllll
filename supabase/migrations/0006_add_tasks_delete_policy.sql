-- ============================================================================
-- Migration 0006: Add DELETE RLS policies for tasks & storage objects
-- ============================================================================

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    company_id = public.current_company_id()
    AND public.has_permission('tasks.manage')
  );

DROP POLICY IF EXISTS "storage_company_docs_delete" ON storage.objects;
CREATE POLICY "storage_company_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('company-documents', 'task-attachments')
    AND (storage.foldername(name))[1] = public.current_company_id()::text
    AND (public.has_permission('documents.manage') OR public.has_permission('tasks.manage'))
  );
