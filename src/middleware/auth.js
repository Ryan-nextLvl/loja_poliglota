import { supabase } from '../db/supabase.js';
import { config } from '../config.js';

export function emailEhAdmin(email) {
  if (!config.adminEmails.length) return true; // sem lista: qualquer usuário do Supabase Auth
  return config.adminEmails.includes((email || '').toLowerCase());
}

// Valida o token (JWT do Supabase) enviado pelo painel admin.
export async function exigirAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  if (!emailEhAdmin(data.user.email)) return res.status(403).json({ erro: 'Este usuário não é administrador.' });

  req.usuario = data.user;
  req.token = token;
  next();
}
