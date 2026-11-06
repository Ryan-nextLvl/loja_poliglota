import { produtos, serializar, oid, idValido } from '../db/mongo.js';
import { cacheGet, cacheSet, cacheDel } from '../db/redis.js';

const CHAVE = 'catalogo:ativos';
const TTL = 300; // segundos

// Lista os produtos ativos. Tenta o Redis primeiro; se não houver, lê do MongoDB e grava no cache.
export async function listarAtivos() {
  const emCache = await cacheGet(CHAVE);
  if (emCache) return { itens: emCache, origem: 'redis' };

  const docs = await produtos().find({ ativo: { $ne: false } }).sort({ criadoEm: -1 }).toArray();
  const itens = docs.map(serializar);
  await cacheSet(CHAVE, itens, TTL);
  return { itens, origem: 'mongodb' };
}

// Chamado em toda alteração feita pelo admin: o próximo acesso do cliente já vê o dado novo.
export const invalidarCatalogo = () => cacheDel(CHAVE);

export async function buscarPorIds(ids) {
  const validos = ids.filter(idValido);
  if (!validos.length) return [];
  const docs = await produtos()
    .find({ _id: { $in: validos.map(oid) }, ativo: { $ne: false } })
    .toArray();
  return docs.map(serializar);
}
