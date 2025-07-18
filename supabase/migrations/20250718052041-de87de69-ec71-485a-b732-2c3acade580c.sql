-- Create storage bucket for knowledge documents
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-base', 'knowledge-base', true);

-- Create knowledge_documents table to track uploaded files
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_preview TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  category TEXT DEFAULT 'general',
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for knowledge documents (admin can manage, users can view active ones)
CREATE POLICY "Knowledge documents are viewable by everyone" 
ON public.knowledge_documents 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage knowledge documents" 
ON public.knowledge_documents 
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Create storage policies for knowledge base
CREATE POLICY "Knowledge files are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'knowledge-base');

CREATE POLICY "Authenticated users can upload knowledge files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update knowledge files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete knowledge files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_knowledge_documents_updated_at
BEFORE UPDATE ON public.knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();