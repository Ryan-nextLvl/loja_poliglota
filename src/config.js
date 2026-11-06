import 'dotenv/config';

const lista = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  porta: Number(process.env.PORT || 3000),
  nomeLoja: process.env.NOME_LOJA || 'Loja Poliglota',
  whatsapp: (process.env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  adminEmails: lista(process.env.ADMIN_EMAILS),
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || 'loja',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};

export function validarConfig() {
  const faltando = [];
  if (!config.supabaseUrl) faltando.push('SUPABASE_URL');
  if (!config.supabaseAnonKey) faltando.push('SUPABASE_ANON_KEY');
  if (!config.mongoUri) faltando.push('MONGODB_URI');
  if (faltando.length) {
    console.error(`Variáveis ausentes no .env: ${faltando.join(', ')}`);
    console.error('Copie .env.example para .env e preencha.');
    process.exit(1);
  }
}
