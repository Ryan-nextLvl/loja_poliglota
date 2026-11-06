-- Rode no SQL Editor do Supabase.
-- O login do administrador usa o Supabase Auth (Authentication > Users).
-- Esta tabela registra cada pedido gerado pelo botão "Comprar".

create table if not exists public.pedidos (
  id        bigint generated always as identity primary key,
  itens     jsonb not null,
  total     numeric(10,2) not null check (total >= 0),
  criado_em timestamptz not null default now()
);

alter table public.pedidos enable row level security;

drop policy if exists "clientes registram pedidos" on public.pedidos;
create policy "clientes registram pedidos"
  on public.pedidos for insert
  to anon, authenticated
  with check (true);

drop policy if exists "admin le pedidos" on public.pedidos;
create policy "admin le pedidos"
  on public.pedidos for select
  to authenticated
  using (true);
