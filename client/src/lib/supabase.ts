import { createClient } from '@supabase/supabase-js';

// TEMP: fully hardcoded to bypass any Vite/Vercel env var injection issue.
export const supabase = createClient(
  'https://kmmikopimwqgumqaphfo.supabase.co',
  'sb_publishable_3rrVW2LoUBDov5lNhMiPMg_t6VV5Il2'
);
