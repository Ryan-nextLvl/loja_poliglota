import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { supabase, supabaseDoUsuario } from '../db/supabase.js';
import { produtos, serializar, oid, idValido } from '../db/mongo.js';
import { invalidarCatalogo } from '../services/catalogo.js';
import { exigirAdmin, emailEhAdmin } from '../middleware/auth.js';

export const admin = Router();

const pastaUploads = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: pastaUploads,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(EXT[file.mimetype] ? null : new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.'), !!EXT[file.mimetype]),
});

// Login: valida e-mail/senha no Supabase Auth e devolve o token usado nas demais chamadas.
admin.post('/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if (typeof email !== 'string' || typeof senha !== 'string' || !email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error || !data.session) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  if (!emailEhAdmin(data.user.email)) return res.status(403).json({ erro: 'Este usuário não é administrador.' });
  res.json({ token: data.session.access_token, email: data.user.email });
});

admin.use(exigirAdmin);

admin.get('/me', (req, res) => res.json({ email: req.usuario.email }));

// "chave: valor" por linha -> objeto (campos flexíveis típicos de documento).
function parseAtributos(texto) {
  const obj = {};
  if (typeof texto !== 'string') return obj;
  for (const linha of texto.split('\n').slice(0, 20)) {
    const i = linha.indexOf(':');
    if (i < 1) continue;
    const k = linha.slice(0, i).trim().slice(0, 40);
    const v = linha.slice(i + 1).trim().slice(0, 120);
    if (k && v) obj[k] = v;
  }
  return obj;
}

function validarProduto(b = {}) {
  const nome = String(b.nome || '').trim();
  const preco = Number(String(b.preco).replace(',', '.'));
  const estoque = b.estoque === '' || b.estoque == null ? 0 : Number(b.estoque);
  const imagem = String(b.imagem || '').trim();
  if (!nome || nome.length > 120) return { erro: 'Informe o nome (até 120 caracteres).' };
  if (!Number.isFinite(preco) || preco < 0 || preco > 1_000_000) return { erro: 'Preço inválido.' };
  if (!Number.isInteger(estoque) || estoque < 0) return { erro: 'Estoque deve ser um número inteiro maior ou igual a 0.' };
  if (imagem && !/^(https?:\/\/|\/uploads\/)/i.test(imagem)) return { erro: 'A imagem deve ser uma URL http(s) ou um upload.' };
  return {
    doc: {
      nome,
      descricao: String(b.descricao || '').trim().slice(0, 1000),
      preco: Math.round(preco * 100) / 100,
      categoria: String(b.categoria || '').trim().slice(0, 40) || 'Geral',
      estoque,
      imagem,
      atributos: parseAtributos(b.atributos),
      ativo: b.ativo !== false,
    },
  };
}

admin.get('/produtos', async (_req, res) => {
  const docs = await produtos().find().sort({ criadoEm: -1 }).toArray();
  res.json({ itens: docs.map(serializar) });
});

admin.post('/produtos', async (req, res) => {
  const { doc, erro } = validarProduto(req.body);
  if (erro) return res.status(400).json({ erro });
  const agora = new Date();
  const r = await produtos().insertOne({ ...doc, criadoEm: agora, atualizadoEm: agora });
  await invalidarCatalogo();
  res.status(201).json({ id: String(r.insertedId) });
});

admin.put('/produtos/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
  const { doc, erro } = validarProduto(req.body);
  if (erro) return res.status(400).json({ erro });
  const r = await produtos().updateOne({ _id: oid(req.params.id) }, { $set: { ...doc, atualizadoEm: new Date() } });
  if (!r.matchedCount) return res.status(404).json({ erro: 'Produto não encontrado.' });
  await invalidarCatalogo();
  res.json({ ok: true });
});

admin.delete('/produtos/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
  const r = await produtos().deleteOne({ _id: oid(req.params.id) });
  if (!r.deletedCount) return res.status(404).json({ erro: 'Produto não encontrado.' });
  await invalidarCatalogo();
  res.json({ ok: true });
});

admin.post('/upload', (req, res, next) => {
  upload.single('imagem')(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.code === 'LIMIT_FILE_SIZE' ? 'Imagem acima de 2 MB.' : err.message });
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// Pedidos registrados no Supabase (lidos com o token do próprio admin, sob RLS).
admin.get('/pedidos', async (req, res) => {
  const { data, error } = await supabaseDoUsuario(req.token)
    .from('pedidos')
    .select('id, itens, total, criado_em')
    .order('criado_em', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ erro: 'Não foi possível ler os pedidos.' });
  res.json({ itens: data });
});
