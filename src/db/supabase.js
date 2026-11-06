import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };

// Cliente anônimo: login (Auth) e registro de pedidos.
export const supabase = createClient(config.supabaseUrl || 'http://localhost', config.supabaseAnonKey || 'x', opcoes);

// Cliente que age como o usuário logado (respeita as políticas RLS de "authenticated").
export function supabaseDoUsuario(token) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    ...opcoes,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
