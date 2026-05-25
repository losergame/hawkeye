create extension if not exists pgcrypto;

create type recommendation_action as enum ('BUY', 'HOLD', 'SELL');
create type alert_channel as enum ('EMAIL', 'DISCORD', 'TELEGRAM', 'IN_APP');
create type alert_status as enum ('ACTIVE', 'PAUSED', 'TRIGGERED');
create type transaction_side as enum ('BUY', 'SELL');

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  risk_profile text not null default 'balanced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  symbol text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists watchlists_symbol_idx on watchlists(symbol);

create table if not exists portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  symbol text not null,
  shares numeric(18, 6) not null,
  average_cost numeric(18, 4) not null,
  target_weight numeric(6, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists portfolios_symbol_idx on portfolios(symbol);

create table if not exists stock_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  symbol text not null,
  channel alert_channel not null default 'IN_APP',
  status alert_status not null default 'ACTIVE',
  condition text not null,
  threshold numeric(18, 4),
  message text,
  triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_alerts_symbol_status_idx on stock_alerts(symbol, status);

create table if not exists ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  symbol text not null,
  action recommendation_action not null,
  risk_score integer not null check (risk_score between 1 and 10),
  bullish_confidence integer not null check (bullish_confidence between 0 and 100),
  bearish_confidence integer not null check (bearish_confidence between 0 and 100),
  short_term_trend text not null,
  reasoning jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_recommendations_symbol_created_at_idx
  on ai_recommendations(symbol, created_at desc);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  symbol text not null,
  side transaction_side not null,
  shares numeric(18, 6) not null,
  price numeric(18, 4) not null,
  fees numeric(18, 4) not null default 0,
  traded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_traded_at_idx on transactions(user_id, traded_at desc);
create index if not exists transactions_symbol_idx on transactions(symbol);

create table if not exists market_news (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  headline text not null,
  source text not null,
  url text,
  sentiment_score numeric(5, 2),
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists market_news_symbol_published_at_idx
  on market_news(symbol, published_at desc);
