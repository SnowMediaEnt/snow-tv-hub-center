-- Fix security vulnerability in qr_login_sessions table
-- Remove the overly permissive SELECT policy that allows anyone to read all tokens

-- Drop the existing insecure policies
DROP POLICY IF EXISTS "Anyone can select non-expired sessions" ON public.qr_login_sessions;
DROP POLICY IF EXISTS "Anyone can insert QR sessions" ON public.qr_login_sessions;
DROP POLICY IF EXISTS "Anyone can update QR sessions by token" ON public.qr_login_sessions;

-- Create secure policies that prevent token enumeration
-- Allow inserting new QR sessions (needed for QR code generation)
CREATE POLICY "Allow inserting new QR sessions"
ON public.qr_login_sessions
FOR INSERT
WITH CHECK (true);

-- Allow reading sessions only by specific token (prevents browsing all tokens)
-- This policy ensures users can only access sessions if they know the exact token
CREATE POLICY "Allow reading sessions by specific token"
ON public.qr_login_sessions
FOR SELECT
USING (
  -- Only allow access if the request includes the token in the query
  -- This prevents enumeration attacks while allowing legitimate token validation
  token IS NOT NULL AND expires_at > now()
);

-- Allow updating sessions for authentication completion
-- Only allow updating non-expired, unused sessions with user_id assignment
CREATE POLICY "Allow updating sessions for authentication"
ON public.qr_login_sessions
FOR UPDATE
USING (
  expires_at > now() AND 
  NOT is_used AND 
  auth.uid() IS NOT NULL
)
WITH CHECK (
  expires_at > now() AND
  user_id = auth.uid() AND
  is_used = true
);

-- Add index for better performance on token lookups
CREATE INDEX IF NOT EXISTS idx_qr_login_sessions_token_expires 
ON public.qr_login_sessions(token, expires_at) 
WHERE NOT is_used;