-- Create storage bucket for media assets
INSERT INTO storage.buckets (id, name, public) VALUES ('media-assets', 'media-assets', true);

-- Create storage policies for media assets
CREATE POLICY "Media assets are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'media-assets');

CREATE POLICY "Authenticated users can upload media assets" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'media-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update media assets" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'media-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete media assets" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'media-assets' AND auth.role() = 'authenticated');

-- Create enum for asset types
CREATE TYPE public.asset_type AS ENUM ('background', 'icon', 'logo', 'other');

-- Create media assets management table
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  asset_type public.asset_type NOT NULL DEFAULT 'other',
  section TEXT NOT NULL DEFAULT 'home',
  is_active BOOLEAN NOT NULL DEFAULT false,
  rotation_order INTEGER DEFAULT 0,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Create policies for media assets table
CREATE POLICY "Anyone can view active media assets" 
ON public.media_assets 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage all media assets" 
ON public.media_assets 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create function to update timestamps
CREATE TRIGGER update_media_assets_updated_at
BEFORE UPDATE ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();