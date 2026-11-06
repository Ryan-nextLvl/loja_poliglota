'use strict';

const $ = (s) => document.querySelector(s);
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function guardado(chave, padrao) {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
}
function guardar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

let sessao = guardado('sessao', null);
if (!sessao) { sessao = crypto.randomUUID(); guardar('sessao', sessao); }

const estado = {
  produtos: [],
  categoria: 'Todas',
  busca: '',
  carrinho: guardado('carrinho', {}), // { [id]: { id, nome, preco, imagem, estoque, qtd } }
};

function imagemHtml(p) {
  return p.imagem
    ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy">`
    : `<div class="sem-foto" aria-hidden="true">${esc(p.nome.charAt(0).toUpperCase())}</div>`;
}

/* ---------- Catálogo ---------- */
async function carregarCatalogo() {
  try {
    const r = await fetch('/api/produtos');
    const dados = await r.json();
    estado.produtos = dados.itens;
    $('#fonte').textContent = `Catálogo servido pelo ${dados.origem === 'redis' ? 'Redis (cache)' : 'MongoDB'}`;
    // Remove da sacola produtos que saíram do catálogo.
    for (const id of Object.keys(estado.carrinho)) if (!estado.produtos.some((p) => p.id === id)) delete estado.carrinho[id];
    guardar('carrinho', estado.carrinho);
  } catch {
    $('#fonte').textContent = 'Não foi possível carregar o catálogo.';
  }
  renderFiltros();
  renderLista();
  renderCarrinho();
}

function cardHtml(p) {
  const botao = p.estoque > 0
    ? `<button class="btn btn-primario" data-add="${esc(p.id)}">Adicionar</button>`
    : `<button class="btn" disabled>Esgotado</button>`;
  return `<li class="card">
    <button class="card-img" data-ver="${esc(p.id)}" aria-label="Ver detalhes de ${esc(p.nome)}">${imagemHtml(p)}</button>
    <div class="card-corpo">
      <button class="card-nome" data-ver="${esc(p.id)}">${esc(p.nome)}</button>
      <span class="card-cat">${esc(p.categoria)}</span>
      <span class="preco">${brl(p.preco)}</span>
      ${botao}
    </div>
  </li>`;
}

function renderFiltros() {
  const cats = ['Todas', ...new Set(estado.produtos.map((p) => p.categoria))];
  $('#filtros').innerHTML = cats
    .map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === estado.categoria}">${esc(c)}</button>`)
    .join('');
}

function renderLista() {
  const q = estado.busca.trim().toLowerCase();
  const lista = estado.produtos.filter(
    (p) => (estado.categoria === 'Todas' || p.categoria === estado.categoria) && (!q || `${p.nome} ${p.descricao}`.toLowerCase().includes(q)),
  );
  $('#lista').innerHTML = lista.map(cardHtml).join('');
  $('#vazio').hidden = lista.length > 0;
}

async function carregarRecentes() {
  try {
    const r = await fetch(`/api/recentes?sessao=${encodeURIComponent(sessao)}`);
    const { itens } = await r.json();
    $('#recentes').innerHTML = itens.map(cardHtml).join('');
    $('#recentes-secao').hidden = itens.length === 0;
  } catch {}
}

/* ---------- Detalhe ---------- */
function abrirDetalhe(id) {
  const p = estado.produtos.find((x) => x.id === id);
  if (!p) return;
  const attrs = Object.entries(p.atributos || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('#detalhe').innerHTML = `
    <div class="det-img">${imagemHtml(p)}</div>
    <div class="det-corpo">
      <h2>${esc(p.nome)}</h2>
      <span class="card-cat">${esc(p.categoria)}</span>
      ${p.descricao ? `<p>${esc(p.descricao)}</p>` : ''}
      ${attrs ? `<dl class="attrs">${attrs}</dl>` : ''}
      <span class="preco">${brl(p.preco)}</span>
      <div class="det-acoes">
        <button class="btn" data-fechar-detalhe>Fechar</button>
        ${p.estoque > 0 ? `<button class="btn btn-primario" data-add="${esc(p.id)}" data-fechar-detalhe>Adicionar à sacola</button>` : '<button class="btn" disabled>Esgotado</button>'}
      </div>
    </div>`;
  $('#detalhe').showModal();
  // Registra no Redis e atualiza a faixa "Vistos recentemente".
  fetch('/api/recentes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessao, produtoId: id }) })
    .then(carregarRecentes)
    .catch(() => {});
}

/* ---------- Carrinho ---------- */
const itensCarrinho = () => Object.values(estado.carrinho);
const totalCarrinho = () => itensCarrinho().reduce((s, i) => s + i.preco * i.qtd, 0);

function adicionar(id) {
  const p = estado.produtos.find((x) => x.id === id) || null;
  if (!p || p.estoque <= 0) return;
  const atual = estado.carrinho[id];
  if (atual && atual.qtd >= p.estoque) { mostrarAviso(`Só há ${p.estoque} unidade(s) de "${p.nome}".`); abrirCarrinho(); return; }
  estado.carrinho[id] = atual ? { ...atual, qtd: atual.qtd + 1, estoque: p.estoque } : { id, nome: p.nome, preco: p.preco, imagem: p.imagem, estoque: p.estoque, qtd: 1 };
  persistirCarrinho();
  pulsar();
}

function alterarQtd(id, delta) {
  const it = estado.carrinho[id];
  if (!it) return;
  const nova = it.qtd + delta;
  if (nova <= 0) delete estado.carrinho[id];
  else if (nova > it.estoque) return mostrarAviso(`Só há ${it.estoque} unidade(s) de "${it.nome}".`);
  else it.qtd = nova;
  persistirCarrinho();
}

function persistirCarrinho() {
  guardar('carrinho', estado.carrinho);
  mostrarAviso('');
  renderCarrinho();
}

function renderCarrinho() {
  const itens = itensCarrinho();
  $('#contador').textContent = itens.reduce((s, i) => s + i.qtd, 0);
  $('#total').textContent = brl(totalCarrinho());
  $('#comprar').disabled = itens.length === 0;
  $('#itens-carrinho').innerHTML = itens.length
    ? itens.map((i) => `<li class="linha">
        <div class="mini">${imagemHtml(i)}</div>
        <div>
          <div class="linha-nome">${esc(i.nome)}</div>
          <div class="linha-sub">${brl(i.preco)} cada · ${brl(i.preco * i.qtd)}</div>
          <div class="qtd">
            <button data-menos="${esc(i.id)}" aria-label="Diminuir quantidade de ${esc(i.nome)}">−</button>
            <span>${i.qtd}</span>
            <button data-mais="${esc(i.id)}" aria-label="Aumentar quantidade de ${esc(i.nome)}">+</button>
          </div>
        </div>
        <button class="remover" data-remover="${esc(i.id)}">Remover</button>
      </li>`).join('')
    : '<li class="vazio">Sua sacola está vazia.</li>';
}

function mostrarAviso(t) { $('#aviso').textContent = t; }
function pulsar() { const c = $('#contador'); c.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220 }); }

function abrirCarrinho() { $('#fundo').hidden = false; $('#gaveta').hidden = false; $('#fechar-carrinho').focus(); }
function fecharCarrinho() { $('#fundo').hidden = true; $('#gaveta').hidden = true; $('#abrir-carrinho').focus(); }

async function comprar() {
  const btn = $('#comprar');
  btn.disabled = true;
  btn.textContent = 'Gerando pedido…';
  mostrarAviso('');
  try {
    const r = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: itensCarrinho().map((i) => ({ id: i.id, qtd: i.qtd })) }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'Não foi possível gerar o pedido.');
    estado.carrinho = {};
    guardar('carrinho', estado.carrinho);
    window.location.href = dados.whatsappUrl;
  } catch (e) {
    mostrarAviso(e.message);
    btn.textContent = 'Comprar pelo WhatsApp';
    btn.disabled = itensCarrinho().length === 0;
    carregarCatalogo();
  }
}

/* ---------- Eventos ---------- */
document.addEventListener('click', (e) => {
  const alvo = e.target.closest('button');
  if (!alvo) return;
  const d = alvo.dataset;
  if (d.add) adicionar(d.add);
  if (d.ver) abrirDetalhe(d.ver);
  if (d.cat) { estado.categoria = d.cat; renderFiltros(); renderLista(); }
  if (d.mais) alterarQtd(d.mais, 1);
  if (d.menos) alterarQtd(d.menos, -1);
  if (d.remover) { delete estado.carrinho[d.remover]; persistirCarrinho(); }
  if ('fecharDetalhe' in d) $('#detalhe').close();
});
$('#busca').addEventListener('input', (e) => { estado.busca = e.target.value; renderLista(); });
$('#abrir-carrinho').addEventListener('click', abrirCarrinho);
$('#fechar-carrinho').addEventListener('click', fecharCarrinho);
$('#fundo').addEventListener('click', fecharCarrinho);
$('#comprar').addEventListener('click', comprar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#gaveta').hidden) fecharCarrinho(); });
$('#detalhe').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

fetch('/api/config').then((r) => r.json()).then((c) => {
  $('#marca').textContent = c.nomeLoja;
  document.title = c.nomeLoja;
}).catch(() => {});
carregarCatalogo();
carregarRecentes();
