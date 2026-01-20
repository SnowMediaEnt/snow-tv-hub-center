-- =============================================
-- SECURITY FIX: Role-Based Access Control (RBAC)
-- =============================================

-- 1. Create app_role enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

-- 2. Create user_roles table for RBAC
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create policy for user_roles (users can view their own roles)
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 5. Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- =============================================
-- FIX: update_user_credits - Add authorization
-- =============================================

CREATE OR REPLACE FUNCTION public.update_user_credits(
  p_user_id uuid, 
  p_amount numeric, 
  p_transaction_type text, 
  p_description text, 
  p_paypal_transaction_id text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization check: only allow user to modify their own credits, or admin
  IF p_user_id != auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Cannot modify another user''s credits';
  END IF;

  -- Update user credits
  IF p_transaction_type = 'purchase' OR p_transaction_type = 'refund' THEN
    UPDATE public.profiles 
    SET credits = credits + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSIF p_transaction_type = 'deduction' THEN
    UPDATE public.profiles 
    SET credits = credits - p_amount,
        total_spent = total_spent + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id AND credits >= p_amount;
    
    -- Check if user had sufficient credits
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Record transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, description, paypal_transaction_id
  ) VALUES (
    p_user_id, p_amount, p_transaction_type, p_description, p_paypal_transaction_id
  );
  
  RETURN TRUE;
END;
$$;

-- =============================================
-- FIX: apps table RLS - Restrict to admin
-- =============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage apps" ON public.apps;

-- Create admin-only management policy
CREATE POLICY "Admins can manage apps"
ON public.apps FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- FIX: knowledge_documents table RLS - Restrict to admin
-- =============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage knowledge documents" ON public.knowledge_documents;

-- Create admin-only management policy
CREATE POLICY "Admins can manage knowledge documents"
ON public.knowledge_documents FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- FIX: media_assets table RLS - Restrict to admin
-- =============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can manage media assets" ON public.media_assets;

-- Create admin-only management policy
CREATE POLICY "Admins can manage media assets"
ON public.media_assets FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- FIX: media-assets storage bucket - Restrict to admin
-- =============================================

-- Drop existing overly permissive storage policies
DROP POLICY IF EXISTS "Anyone can upload to media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete from media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin uploads to media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin updates to media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin deletes from media-assets" ON storage.objects;

-- Create admin-only upload policy
CREATE POLICY "Admins can upload to media-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media-assets' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Create admin-only update policy
CREATE POLICY "Admins can update media-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media-assets' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Create admin-only delete policy
CREATE POLICY "Admins can delete from media-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media-assets' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Ensure public read access remains (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Public read access for media-assets'
  ) THEN
    CREATE POLICY "Public read access for media-assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'media-assets');
  END IF;
END $$;
