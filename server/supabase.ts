import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function userScopedClient(userToken: string) {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
}
