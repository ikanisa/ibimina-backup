/**
 * Supabase client for desktop app - simplified for Vite
 */

import { createClient } from "@supabase/supabase-js";

import {
  getSecureCredentials,
  setSecureCredentials,
  deleteSecureCredentials,
} from "@/lib/tauri/commands";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: {
      getItem: async (key) => {
        try {
          const session = await getSecureCredentials();
          return session;
        } catch (error) {
          console.error("Error getting secure credentials:", error);
          return null;
        }
      },
      setItem: async (key, value) => {
        try {
          await setSecureCredentials(value);
        } catch (error) {
          console.error("Error setting secure credentials:", error);
        }
      },
      removeItem: async (key) => {
        try {
          await deleteSecureCredentials();
        } catch (error) {
          console.error("Error removing secure credentials:", error);
        }
      },
    },
  },
});

export { createClient };
