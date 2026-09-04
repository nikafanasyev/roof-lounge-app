// Supabase-клиент мини-аппа.
//
// Если VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY не заданы (например, локальная
// разработка без своего проекта в Supabase), клиент не создаётся — приложение
// продолжает работать на моковых данных из data/seed.ts (см. data/repo.ts).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
