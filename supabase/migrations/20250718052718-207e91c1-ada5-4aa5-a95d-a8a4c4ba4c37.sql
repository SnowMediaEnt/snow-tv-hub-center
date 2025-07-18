-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule automatic knowledge sync every hour
SELECT cron.schedule(
  'auto-knowledge-sync',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://falmwzhvxoefvkfsiylp.supabase.co/functions/v1/auto-knowledge-sync',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhbG13emh2eG9lZnZrZnNpeWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4MjIwNDMsImV4cCI6MjA2NzM5ODA0M30.I-YfvZxAuOvhehrdoZOgrANirZv0-ucGUKbW9gOfQak"}'::jsonb,
        body:='{"automated": true}'::jsonb
    ) as request_id;
  $$
);