# Loja Poliglota

E-commerce / catálogo de produtos com **banco de dados poliglota**: cada tecnologia faz o que faz de melhor.

| Banco | Papel no sistema |
|---|---|
| **Supabase (PostgreSQL)** | Login do administrador (Supabase Auth) e tabela `pedidos` (histórico dos pedidos enviados ao WhatsApp, com RLS) |
| **MongoDB** | Cadastro dos produtos como documentos flexíveis (cada produto pode ter atributos diferentes) |
| **Redis** | Cache do catálogo (TTL 5 min, invalidado a cada alteração do admin) e lista "Vistos recentemente" por visitante |

Stack: Node.js + Express no servidor; HTML/CSS/JS puro no navegador (interface web responsiva).

## Arquitetura

```
Navegador ──► Express ──► Redis ──(miss)──► MongoDB   (catálogo)
   │             │
   │             ├──► Redis                            (vistos recentemente)
   │             ├──► Supabase Auth                    (login do admin, valida o JWT)
   │             └──► Supabase Postgres                (tabela pedidos)
   └──► botão "Comprar" ──► wa.me/<número>?text=<pedido formatado>
```

- O **total do pedido é recalculado no servidor** com os preços do MongoDB; o navegador não decide valores.
- Se o Redis cair, a loja continua funcionando (lê direto do MongoDB).
- O rodapé da loja mostra de onde veio o catálogo (Redis ou MongoDB), o que ajuda a demonstrar o cache.

## Pré-requisitos

- Node.js 20+
- Conta gratuita no [Supabase](https://supabase.com) e no [MongoDB Atlas](https://www.mongodb.com/atlas) (cluster M0)
- Redis local (Redis, Memurai no Windows ou Docker) ou um Redis na nuvem (Upstash / Redis Cloud)

## Configuração

### 1. Dependências e variáveis

```bash
npm install
cp .env.example .env     # no Windows: copy .env.example .env
```

### 2. Supabase

1. Crie um projeto em supabase.com.
2. Em **SQL Editor**, rode o conteúdo de [`sql/supabase.sql`](sql/supabase.sql) (cria a tabela `pedidos` com RLS).
3. Em **Authentication > Users > Add user**, crie o administrador (e-mail e senha, marque *Auto Confirm*).
4. Em **Authentication > Sign In / Providers**, desative *Allow new users to sign up* para que só o admin exista.
5. Em **Project Settings > API**, copie a *Project URL* e a chave *anon/publishable* para `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
6. Coloque o e-mail do admin em `ADMIN_EMAILS` (camada extra: só esse e-mail acessa o painel).

### 3. MongoDB Atlas

1. Crie um cluster gratuito (M0).
2. **Database Access**: crie um usuário com permissão de leitura/escrita.
3. **Network Access**: libere o seu IP.
4. **Connect > Drivers**: copie a string de conexão para `MONGODB_URI`. O banco `loja` e a coleção `produtos` são criados automaticamente.

### 4. Redis

Local: `REDIS_URL=redis://localhost:6379` (padrão). Na nuvem: use a URL `rediss://…` do provedor.

### 5. WhatsApp

Em `WHATSAPP_NUMBER`, coloque o número que recebe os pedidos, só dígitos com DDI e DDD (ex.: `5511999998888`).

## Executar

```bash
npm run seed    # opcional: insere 8 produtos de exemplo no MongoDB
npm start       # http://localhost:3000
```

- Loja: <http://localhost:3000>
- Admin: <http://localhost:3000/admin.html>
- Diagnóstico dos três bancos: <http://localhost:3000/api/saude>

## Funcionalidades

**Administrador (login Supabase):** entrar, cadastrar/editar/excluir produtos (nome, descrição, preço, categoria, estoque, imagem por upload ou URL, atributos livres `nome: valor`, visibilidade) e consultar os pedidos registrados.

**Cliente:** catálogo com busca e categorias, detalhe do produto, "Vistos recentemente" (Redis), sacola com adicionar/remover/alterar quantidade e total, e botão **Comprar pelo WhatsApp**, que abre a conversa com a mensagem:

> Olá, gostaria de pedir: 1x Produto A, 2x Produto B. Total: R$ XX,XX

## Roteiro do vídeo (5 a 10 min)

1. **(0:30)** Mostre rapidamente os três bancos: tabela `pedidos` no Supabase, coleção `produtos` no Atlas e `/api/saude`.
2. **(1:30)** Abra `/admin.html` e faça o **login** do administrador (mostre também um login errado sendo recusado).
3. **(2:00)** **Cadastre um produto novo** com imagem e atributos. Em outra aba, abra a loja e mostre que ele **já aparece no catálogo** (cache invalidado).
4. **(1:00)** Clique em alguns produtos e mostre **"Vistos recentemente"**; recarregue a página e mostre o rodapé trocando para "Redis (cache)".
5. **(2:00)** **Simule a compra**: adicione itens, altere quantidades, remova um, confira o total e clique em **Comprar pelo WhatsApp**. Mostre o WhatsApp abrindo com a **mensagem formatada**.
6. **(0:30)** Volte ao admin, aba **Pedidos**, e mostre o pedido registrado no Supabase.

## Estrutura

```
src/
  server.js            Express + inicialização
  config.js            variáveis de ambiente
  db/                  conexões: mongo.js, redis.js, supabase.js
  middleware/auth.js   valida o JWT do Supabase
  routes/              publico.js (catálogo, recentes, pedido) e admin.js
  services/catalogo.js leitura com cache Redis + invalidação
public/                interface (index, admin, CSS e JS)
sql/supabase.sql       script da tabela pedidos
scripts/seed.js        produtos de exemplo
```
