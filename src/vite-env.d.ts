/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_DEMO_ADMIN_EMAIL?: string
  readonly VITE_DEMO_ADMIN_PASSWORD?: string
  readonly VITE_DEMO_COURIER_EMAIL?: string
  readonly VITE_DEMO_COURIER_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
