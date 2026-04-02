import { createClient } from '@supabase/supabase-js';

// TEMP: hardcoded to confirm Vercel env var injection issue.
// TODO: restore import.meta.env once VITE_ vars are confirmed working.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kmmikopimwqgumqaphfo.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbWlrb3BpbXdxZ3VtcWFwaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTQ4MjksImV4cCI6MjA4Mzk5MDgyOX0.6npKAGtWBg18hnWVUY0x9Kvq0gi8W2WVA0DIoJS-ASs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
