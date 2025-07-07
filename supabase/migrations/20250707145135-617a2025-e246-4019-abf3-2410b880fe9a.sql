-- Create QR login sessions table for secure authentication
CREATE TABLE public.qr_login_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id uuid,
  is_used boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.qr_login_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for QR login sessions
CREATE POLICY "Anyone can insert QR sessions" 
ON public.qr_login_sessions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update QR sessions by token" 
ON public.qr_login_sessions 
FOR UPDATE 
USING (expires_at > now() AND NOT is_used);

CREATE POLICY "Anyone can select non-expired sessions" 
ON public.qr_login_sessions 
FOR SELECT 
USING (expires_at > now());

-- Create index for better performance
CREATE INDEX idx_qr_login_token ON public.qr_login_sessions(token);
CREATE INDEX idx_qr_login_expires ON public.qr_login_sessions(expires_at);