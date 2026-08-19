import { createClient } from "@supabase/supabase-js";
import { isElectron } from "../utils/platform";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Desktop is local-only: never create the client there. supabase-js starts
// session recovery + token auto-refresh on construction, so a client built on
// desktop can contact the backend at module load even though the sign-in/sync
// UI is unmounted — "local-only" must mean zero cloud traffic. Every consumer
// (useAuth, useSync, services/sync) already null-guards.
export const supabase =
  !isElectron && supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
