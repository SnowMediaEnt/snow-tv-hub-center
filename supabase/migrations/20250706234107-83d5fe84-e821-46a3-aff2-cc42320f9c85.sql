-- Drop the existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can upload media assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update media assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete media assets" ON storage.objects;

-- Create more permissive policies for media assets uploads
CREATE POLICY "Anyone can upload to media-assets bucket" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'media-assets');

CREATE POLICY "Anyone can update media-assets" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'media-assets');

CREATE POLICY "Anyone can delete from media-assets" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'media-assets');

-- Also update the media_assets table policies to be more permissive
DROP POLICY IF EXISTS "Authenticated users can manage all media assets" ON public.media_assets;

CREATE POLICY "Anyone can manage media assets" 
ON public.media_assets 
FOR ALL 
USING (true);