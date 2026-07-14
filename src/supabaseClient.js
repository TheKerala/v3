import { createClient } from '@supabase/supabase-js';

// Hardcoding for a test build to confirm it's a Cloudflare injection issue
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://jhtbbmjkmxbfxhxxmmyw.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_XLx_EmLBvcVvpbXMWUFF0g_pDo6L7HU";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);