-- Create a table for community messages/chat
CREATE TABLE public.community_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  username TEXT,
  message TEXT NOT NULL,
  reply_to UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_pinned BOOLEAN DEFAULT false,
  room_id TEXT DEFAULT 'general'
);

-- Enable Row Level Security
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for community access
CREATE POLICY "Anyone can view community messages" 
ON public.community_messages 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can post messages" 
ON public.community_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages" 
ON public.community_messages 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages" 
ON public.community_messages 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_community_messages_updated_at
BEFORE UPDATE ON public.community_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add credit packages table for purchasing credits
CREATE TABLE public.credit_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for credit packages
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view active credit packages
CREATE POLICY "Anyone can view active credit packages" 
ON public.credit_packages 
FOR SELECT 
USING (is_active = true);

-- Insert default credit packages
INSERT INTO public.credit_packages (name, credits, price, description) VALUES
('Starter Pack', 50, 5.00, '50 credits for AI image generation'),
('Value Pack', 120, 10.00, '120 credits for AI image generation (20% bonus)'),
('Pro Pack', 250, 20.00, '250 credits for AI image generation (25% bonus)'),
('Ultimate Pack', 600, 45.00, '600 credits for AI image generation (33% bonus)');