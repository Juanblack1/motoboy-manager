# Motoboy Manager

Sistema demo para gerenciamento de entregas com motoboy, painel admin, link mobile do entregador, rastreamento publico e mapa com ETA.

## Recursos

- Painel `/admin` com pedidos ativos, motoboys online, mapa e link publico de rastreio.
- Link `/motoboy` para o entregador atualizar status, ativar GPS real do celular ou simular rota para demo.
- Link `/r/:code` para cliente acompanhar pedido, motoboy, status, mapa e previsao.
- Supabase Auth, Postgres, RLS e Realtime.
- Leaflet + OpenStreetMap para mapa sem chave paga no frontend.
- OSRM publico para rota/ETA com fallback local se a API falhar.
- Modo demo local quando Supabase nao esta configurado.

## Usuarios de teste

| Perfil | Email | Senha |
| --- | --- | --- |
| Admin | `admin@motoboy.demo` | `Admin@123456` |
| Motoboy | `motoboy@motoboy.demo` | `Motoboy@123456` |

Essas credenciais sao somente para demo. Nao use em producao.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Sem Supabase configurado, o app usa dados locais de demonstracao.

## Configurar Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e rode `supabase/schema.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_DB_URL`.
5. Aplique o schema e crie os dados demo:

```bash
npm run setup:supabase
```

Se preferir usar a API Admin do Supabase, preencha `SUPABASE_SERVICE_ROLE_KEY` e rode o seed legado:

```bash
npm run seed
```

`SUPABASE_DB_URL` e `SUPABASE_SERVICE_ROLE_KEY` sao usados apenas localmente. Nunca publique esses valores no GitHub ou como variaveis `VITE_`.

## Variaveis de ambiente da Vercel

Configure somente as variaveis publicas necessarias para o frontend:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_DEMO_ADMIN_EMAIL=admin@motoboy.demo
VITE_DEMO_ADMIN_PASSWORD=Admin@123456
VITE_DEMO_COURIER_EMAIL=motoboy@motoboy.demo
VITE_DEMO_COURIER_PASSWORD=Motoboy@123456
```

Nao configure `SUPABASE_SERVICE_ROLE_KEY` como variavel publica da Vercel para este app.

## Deploy na Vercel

```bash
npm run build
vercel
vercel --prod
```

O arquivo `vercel.json` redireciona rotas SPA como `/admin`, `/motoboy` e `/r/SP-8K2M` para `index.html`.

## Publicar no GitHub

```bash
git init
git add .
git commit -m "feat: create motoboy manager demo"
gh repo create motoboy-manager --public --source=. --remote=origin --push
```

Antes do push, confirme que `.env.local` nao foi adicionado. O `.gitignore` ja ignora `*.local`.

## Rotas principais

- `/` apresenta o projeto e atalhos de teste.
- `/admin` entra como admin de demo e mostra a operacao.
- `/motoboy` entra como motoboy de demo e permite GPS real/simulacao.
- `/r/SP-8K2M` mostra o rastreamento publico do pedido demo.

## Observacoes de producao

- Para uso comercial, troque o OSRM publico por Google Directions, Mapbox Directions ou OSRM proprio.
- Restrinja a chave anon do Supabase com RLS forte e dominios confiaveis.
- Use politicas mais granulares para impedir que motoboys alterem campos que nao sejam status/localizacao.
- Crie uma tela real de login se as credenciais de demo nao devem ficar visiveis.
