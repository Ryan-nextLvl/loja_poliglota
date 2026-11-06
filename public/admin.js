'use strict';

const $ = (s) => document.querySelector(s);
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let token = sessionStorage.getItem('adminToken');
let produtos = [];

async function api(caminho, opcoes = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(opcoes.headers || {}) };
  if (opcoes.body && !(opcoes.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api/admin${caminho}`, { ...opcoes, headers });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401) { sair(); throw new Error(dados.erro || 'Sessão expirada.'); }
  if (!r.ok) throw new Error(dados.erro || 'Erro inesperado.');
  return dados;
}

function mostrar(logado, email = '') {
  $('#tela-login').hidden = logado;
  $('#tela-painel').hidden = !logado;
  $('#sair').hidden = !logado;
  $('#usuario').hidden = !logado;
  $('#usuario').textContent = email;
}

function sair() {
  token = null;
  sessionStorage.removeItem('adminToken');
  mostrar(false);
}

/* ---------- Login ---------- */
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('#erro-login');
  erro.hidden = true;
  $('#entrar').disabled = true;
  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('#email').value, senha: $('#senha').value }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro);
    token = dados.token;
    sessionStorage.setItem('adminToken', token);
    $('#senha').value = '';
    await iniciarPainel(dados.email);
  } catch (err) {
    erro.textContent = err.message || 'Não foi possível entrar.';
    erro.hidden = false;
  } finally {
    $('#entrar').disabled = false;
  }
});
$('#sair').addEventListener('click', sair);

async function iniciarPainel(email) {
  mostrar(true, email);
  await carregarProdutos();
}

/* ---------- Abas ---------- */
document.querySelectorAll('[data-aba]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-aba]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#aba-produtos').hidden = b.dataset.aba !== 'produtos';
    $('#aba-pedidos').hidden = b.dataset.aba !== 'pedidos';
    if (b.dataset.aba === 'pedidos') carregarPedidos();
  }),
);

/* ---------- Produtos ---------- */
async function carregarProdutos() {
  try {
    produtos = (await api('/produtos')).itens;
  } catch { return; }
  $('#sem-produtos').hidden = produtos.length > 0;
  $('#tabela-produtos').innerHTML = produtos.map((p) => `<tr>
      <td><div class="miniatura">${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : ''}</div></td>
      <td>${esc(p.nome)}<br><span class="card-cat">${esc(p.categoria)}${p.ativo === false ? ' · oculto' : ''}</span></td>
      <td>${brl(p.preco)}</td>
      <td>${p.estoque}</td>
      <td><div class="acoes">
        <button class="btn" data-editar="${esc(p.id)}">Editar</button>
        <button class="btn btn-perigo" data-excluir="${esc(p.id)}">Excluir</button>
      </div></td></tr>`).join('');
  $('#categorias').innerHTML = [...new Set(produtos.map((p) => p.categoria))].map((c) => `<option value="${esc(c)}">`).join('');
}

function aviso(texto, erro = false) {
  const m = $('#msg-produto');
  m.textContent = texto;
  m.className = erro ? 'msg erro' : 'msg';
  m.hidden = !texto;
}

function limparForm() {
  $('#form-produto').reset();
  $('#p-id').value = '';
  $('#p-ativo').checked = true;
  $('#titulo-form').textContent = 'Novo produto';
  $('#cancelar').hidden = true;
}

function editar(id) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  $('#p-id').value = p.id;
  $('#p-nome').value = p.nome;
  $('#p-descricao').value = p.descricao || '';
  $('#p-preco').value = String(p.preco).replace('.', ',');
  $('#p-estoque').value = p.estoque;
  $('#p-categoria').value = p.categoria;
  $('#p-imagem').value = p.imagem || '';
  $('#p-atributos').value = Object.entries(p.atributos || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  $('#p-ativo').checked = p.ativo !== false;
  $('#titulo-form').textContent = 'Editar produto';
  $('#cancelar').hidden = false;
  aviso('');
  $('#p-nome').focus();
  $('#form-produto').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#cancelar').addEventListener('click', () => { limparForm(); aviso(''); });

$('#tabela-produtos').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.editar) editar(b.dataset.editar);
  if (b.dataset.excluir) {
    const p = produtos.find((x) => x.id === b.dataset.excluir);
    if (!confirm(`Excluir "${p?.nome}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await api(`/produtos/${b.dataset.excluir}`, { method: 'DELETE' });
      aviso('Produto excluído.');
      await carregarProdutos();
    } catch (err) { aviso(err.message, true); }
  }
});

// Envio de imagem: sobe o arquivo e preenche o campo com a URL devolvida.
$('#p-arquivo').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  const fd = new FormData();
  fd.append('imagem', arquivo);
  aviso('Enviando imagem…');
  try {
    const { url } = await api('/upload', { method: 'POST', body: fd });
    $('#p-imagem').value = url;
    aviso('Imagem enviada.');
  } catch (err) { aviso(err.message, true); }
});

$('#form-produto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#p-id').value;
  const corpo = {
    nome: $('#p-nome').value,
    descricao: $('#p-descricao').value,
    preco: $('#p-preco').value,
    estoque: $('#p-estoque').value,
    categoria: $('#p-categoria').value,
    imagem: $('#p-imagem').value,
    atributos: $('#p-atributos').value,
    ativo: $('#p-ativo').checked,
  };
  $('#salvar').disabled = true;
  try {
    await api(id ? `/produtos/${id}` : '/produtos', { method: id ? 'PUT' : 'POST', body: JSON.stringify(corpo) });
    limparForm();
    aviso(id ? 'Produto atualizado. O catálogo já mostra a alteração.' : 'Produto cadastrado. Já aparece no catálogo do cliente.');
    await carregarProdutos();
  } catch (err) { aviso(err.message, true); }
  finally { $('#salvar').disabled = false; }
});

/* ---------- Pedidos ---------- */
async function carregarPedidos() {
  try {
    const { itens } = await api('/pedidos');
    $('#sem-pedidos').hidden = itens.length > 0;
    $('#tabela-pedidos').innerHTML = itens.map((p) => `<tr>
        <td>${p.id}</td>
        <td>${new Date(p.criado_em).toLocaleString('pt-BR')}</td>
        <td>${p.itens.map((i) => `${i.qtd}x ${esc(i.nome)}`).join(', ')}</td>
        <td>${brl(p.total)}</td></tr>`).join('');
  } catch {}
}

/* ---------- Início ---------- */
(async () => {
  if (!token) return mostrar(false);
  try {
    const { email } = await api('/me');
    await iniciarPainel(email);
  } catch { mostrar(false); }
})();
