import { createClient } from '@supabase/supabase-js'

import { demoCredentials } from './demo-data'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null
  if (supabaseUrl.includes('YOUR_') || supabaseAnonKey.includes('YOUR_')) return null
  return createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = createSupabaseClient()
export const hasSupabaseConfig = supabase !== null

export const appCredentials = {
  admin: {
    email: import.meta.env.VITE_DEMO_ADMIN_EMAIL?.trim() || demoCredentials.admin.email,
    password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD?.trim() || demoCredentials.admin.password,
  },
  courier: {
    email: import.meta.env.VITE_DEMO_COURIER_EMAIL?.trim() || demoCredentials.courier.email,
    password: import.meta.env.VITE_DEMO_COURIER_PASSWORD?.trim() || demoCredentials.courier.password,
  },
}
