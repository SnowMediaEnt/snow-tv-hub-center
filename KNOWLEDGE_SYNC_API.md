# External Knowledge Sync API

This API allows you to externally manage the Snow Media AI knowledge base from outside the app. This ensures everyone gets new information immediately.

## Setup

1. **Get Your API Key**: Contact your administrator to get the `EXTERNAL_KNOWLEDGE_API_KEY`
2. **Endpoint**: `https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync`

## Authentication

Include your API key in all requests:
```json
{
  "apiKey": "your-secret-api-key",
  "action": "create",
  ...
}
```

## Available Actions

### 1. Create New Document
```bash
curl -X POST https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your-secret-api-key",
    "action": "create",
    "title": "New Streaming Guide",
    "description": "How to set up streaming apps",
    "category": "streaming-apps",
    "content": "Step 1: Download the app...",
    "file_type": "text"
  }'
```

### 2. Update Existing Document
```bash
curl -X POST https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your-secret-api-key",
    "action": "update",
    "id": "document-uuid-here",
    "title": "Updated Title",
    "content": "Updated content..."
  }'
```

### 3. Delete Document
```bash
curl -X POST https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your-secret-api-key",
    "action": "delete",
    "id": "document-uuid-here"
  }'
```

### 4. List All Documents
```bash
curl -X POST https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your-secret-api-key",
    "action": "list"
  }'
```

### 5. Bulk Sync Multiple Documents
```bash
curl -X POST https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your-secret-api-key",
    "action": "bulk_sync",
    "documents": [
      {
        "title": "Document 1",
        "description": "Description 1",
        "category": "general",
        "content": "Content 1..."
      },
      {
        "title": "Document 2", 
        "description": "Description 2",
        "category": "troubleshooting",
        "content": "Content 2..."
      }
    ]
  }'
```

## Categories

Available categories:
- `general`
- `streaming-apps`
- `android-tv` 
- `tutorials`
- `troubleshooting`
- `installation-guides`

## Response Format

Success response:
```json
{
  "success": true,
  "action": "create",
  "data": {
    "id": "uuid",
    "title": "Document Title",
    "created_at": "2024-01-01T00:00:00Z",
    ...
  }
}
```

Error response:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Python Example

```python
import requests

def create_knowledge_doc(api_key, title, content, category="general"):
    url = "https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync"
    
    payload = {
        "apiKey": api_key,
        "action": "create",
        "title": title,
        "content": content,
        "category": category
    }
    
    response = requests.post(url, json=payload)
    return response.json()

# Usage
result = create_knowledge_doc(
    api_key="your-secret-api-key",
    title="New Streaming Guide",
    content="Step-by-step instructions...",
    category="streaming-apps"
)
print(result)
```

## JavaScript Example

```javascript
async function createKnowledgeDoc(apiKey, title, content, category = "general") {
    const response = await fetch("https://falmwzhvxoefvkfsiylp.functions.supabase.co/external-knowledge-sync", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            apiKey,
            action: "create",
            title,
            content,
            category
        })
    });
    
    return await response.json();
}

// Usage
const result = await createKnowledgeDoc(
    "your-secret-api-key",
    "New Tutorial",
    "Tutorial content here...",
    "tutorials"
);
console.log(result);
```

## Notes

- All updates are immediate and will be available to the Snow Media AI instantly
- The AI uses up to 10 most relevant active documents for context
- Documents are searchable by title, description, and content
- Use descriptive titles and categories for better AI performance
- Content can be plain text, markdown, or structured data