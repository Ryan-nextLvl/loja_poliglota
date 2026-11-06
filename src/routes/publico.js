import { Router } from 'express';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { pingMongo } from '../db/mongo.js';
import { pingRedis, registrarRecente, listarRecentes } from '../db/redis.js';
import { listarAtivos, buscarPorIds } from '../services/catalogo.js';

export const publico = Router();

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sessaoValida = (s) => typeof s === 'string' && /^[\w-]{8,64}$/.test(s);

publico.get('/config', (_req, res) => res.json({ nomeLoja: config.nomeLoja }));

publico.get('/produtos', async (_req, res) => {
  const { itens, origem } = await listarAtivos();
  res.set('X-Cache', origem === 'redis' ? 'HIT' : 'MISS');
  res.json({ origem, itens });
});

// "Vistos recentemente" por visitante, guardado no Redis.
publico.post('/recentes', async (req, res) => {
  const { sessao, produtoId } = req.body || {};
  if (!sessaoValida(sessao) || typeof produtoId !== 'string') return res.status(400).json({ erro: 'Dados inválidos.' });
  res.json({ ok: await registrarRecente(sessao, produtoId) });
});

publico.get('/recentes', async (req, res) => {
  if (!sessaoValida(req.query.sessao)) return res.json({ itens: [] });
  const ids = await listarRecentes(req.query.sessao);
  const docs = await buscarPorIds(ids);
  const porId = new Map(docs.map((d) => [d.id, d]));
  res.json({ itens: ids.map((id) => porId.get(id)).filter(Boolean) });
});

// Finalização: o servidor recalcula o total com os preços do MongoDB (não confia no navegador),
// registra o pedido no Supabase e devolve o link do WhatsApp com a mensagem formatada.
publico.post('/pedidos', async (req, res) => {
  const entrada = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 50) : [];
  const qtdPorId = new Map();
  for (const it of entrada) {
    const qtd = Math.floor(Number(it?.qtd));
    if (typeof it?.id === 'string' && qtd > 0 && qtd <= 99) qtdPorId.set(it.id, (qtdPorId.get(it.id) || 0) + qtd);
  }
  if (!qtdPorId.size) return res.status(400).json({ erro: 'O carrinho está vazio.' });

  const docs = await buscarPorIds([...qtdPorId.keys()]);
  if (docs.length !== qtdPorId.size) {
    return res.status(409).json({ erro: 'Algum produto do carrinho não está mais disponível. Atualize a página.' });
  }

  const itens = docs.map((p) => ({ id: p.id, nome: p.nome, preco: p.preco, qtd: qtdPorId.get(p.id) }));
  const total = Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100;

  const texto = `Olá, gostaria de pedir: ${itens.map((i) => `${i.qtd}x ${i.nome}`).join(', ')}. Total: ${brl(total)}`;
  const whatsappUrl = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(texto)}`;

  const { error } = await supabase.from('pedidos').insert({ itens, total });
  if (error) console.error('[supabase] falha ao registrar pedido:', error.message);

  res.json({ texto, total, whatsappUrl, registrado: !error });
});

publico.get('/saude', async (_req, res) => {
  const checar = async (fn) => {
    try {
      await fn();
      return 'ok';
    } catch (e) {
      return `erro: ${e.message}`;
    }
  };
  res.json({
    mongodb: await checar(pingMongo),
    redis: await checar(pingRedis),
    supabase: await checar(async () => {
      const { error } = await supabase.from('pedidos').select('id', { head: true, count: 'exact' });
      if (error) throw new Error(error.message);
    }),
  });
});
