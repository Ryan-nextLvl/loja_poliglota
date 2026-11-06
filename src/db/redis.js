import { createClient } from 'redis';
import { config } from '../config.js';

let client;
let avisou = false;

// O Redis é um cache: se estiver fora do ar, a loja continua funcionando (só sem cache).
export async function conectarRedis() {
  client = createClient({
    url: config.redisUrl,
    socket: { reconnectStrategy: (tentativas) => (tentativas > 5 ? 15000 : 1000), connectTimeout: 4000 },
  });
  client.on('error', (e) => {
    if (!avisou) {
      console.warn(`[redis] indisponível (${e.code || e.message}). Seguindo sem cache.`);
      avisou = true;
    }
  });
  client.on('ready', () => {
    avisou = false;
    console.log('[redis] conectado');
  });
  try {
    await Promise.race([client.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
  } catch (e) {
    console.warn(`[redis] não conectou (${e.message}). Seguindo sem cache.`);
  }
}

const pronto = () => client?.isReady;

export async function cacheGet(chave) {
  if (!pronto()) return null;
  try {
    const v = await client.get(chave);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(chave, valor, segundos) {
  if (!pronto()) return;
  try {
    await client.set(chave, JSON.stringify(valor), { EX: segundos });
  } catch {}
}

export async function cacheDel(...chaves) {
  if (!pronto()) return;
  try {
    await client.del(chaves);
  } catch {}
}

// Lista "vistos recentemente" por visitante: mais recente primeiro, sem repetir, máx. 8, expira em 7 dias.
export async function registrarRecente(sessao, produtoId) {
  if (!pronto()) return false;
  const chave = `recentes:${sessao}`;
  try {
    await client.multi().lRem(chave, 0, produtoId).lPush(chave, produtoId).lTrim(chave, 0, 7).expire(chave, 7 * 86400).exec();
    return true;
  } catch {
    return false;
  }
}

export async function listarRecentes(sessao) {
  if (!pronto()) return [];
  try {
    return await client.lRange(`recentes:${sessao}`, 0, 7);
  } catch {
    return [];
  }
}

export async function pingRedis() {
  if (!pronto()) throw new Error('desconectado');
  return client.ping();
}
