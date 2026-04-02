import { createClient } from '@supabase/supabase-js';

// TEMP: fully hardcoded to bypass any Vite/Vercel env var injection issue.
export const supabase = createClient(
  'https://kmmikopimwqgumqaphfo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbWlrb3BpbXdxZ3VtcWFwaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTQ4MjksImV4cCI6MjA4Mzk5MDgyOX0.6npKAGtWBg18hnWVUY0x9Kvq0gi8W2WVA0DIoJS-ASs'
);
