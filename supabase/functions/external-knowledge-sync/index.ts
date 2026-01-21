import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.7.1');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { action, apiKey, ...data } = await req.json();
    
    // API key authentication - requires proper secret configuration
    const expectedApiKey = Deno.env.get('EXTERNAL_KNOWLEDGE_API_KEY');
    if (!expectedApiKey) {
      console.error('EXTERNAL_KNOWLEDGE_API_KEY is not configured');
      return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!apiKey || apiKey !== expectedApiKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;

    switch (action) {
      case 'create':
        // Create new knowledge document
        const { title, description, category, content, file_type = 'text' } = data;
        
        if (!title || !content) {
          throw new Error('Title and content are required');
        }

        // For external sync, we'll store the content directly in content_preview
        // In a real implementation, you might want to upload to storage
        result = await supabase
          .from('knowledge_documents')
          .insert({
            title,
            description,
            category: category || 'general',
            content_preview: content,
            file_type,
            file_path: `external-sync/${Date.now()}-${title.replace(/[^a-zA-Z0-9]/g, '-')}.txt`,
            is_active: true,
            uploaded_by: null // External sync
          })
          .select()
          .single();

        break;

      case 'update':
        // Update existing knowledge document
        const { id, ...updateData } = data;
        
        if (!id) {
          throw new Error('Document ID is required for updates');
        }

        result = await supabase
          .from('knowledge_documents')
          .update({
            ...updateData,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();

        break;

      case 'delete':
        // Delete knowledge document
        const { id: deleteId } = data;
        
        if (!deleteId) {
          throw new Error('Document ID is required for deletion');
        }

        result = await supabase
          .from('knowledge_documents')
          .delete()
          .eq('id', deleteId);

        break;

      case 'list':
        // List all knowledge documents
        result = await supabase
          .from('knowledge_documents')
          .select('*')
          .order('created_at', { ascending: false });

        break;

      case 'bulk_sync':
        // Bulk sync multiple documents
        const { documents } = data;
        
        if (!Array.isArray(documents)) {
          throw new Error('Documents must be an array');
        }

        const processedDocs = documents.map(doc => ({
          title: doc.title,
          description: doc.description,
          category: doc.category || 'general',
          content_preview: doc.content,
          file_type: doc.file_type || 'text',
          file_path: `external-sync/${Date.now()}-${doc.title.replace(/[^a-zA-Z0-9]/g, '-')}.txt`,
          is_active: true,
          uploaded_by: null
        }));

        result = await supabase
          .from('knowledge_documents')
          .insert(processedDocs)
          .select();

        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    if (result.error) {
      throw result.error;
    }

    console.log(`External knowledge sync - ${action}:`, result.data);

    return new Response(JSON.stringify({ 
      success: true, 
      action,
      data: result.data 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in external-knowledge-sync:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});