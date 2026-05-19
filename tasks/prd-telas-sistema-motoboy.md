# PRD: Telas do Sistema de Gerenciamento de Motoboy

## 1. Introduction/Overview

Este PRD define todas as telas necessárias para transformar o Motoboy Manager em um MVP completo com três perfis autenticados: cliente, admin e motoboy.

O cliente cria pedidos e acompanha somente os próprios pedidos. O admin gerencia pedidos, clientes, motoboys, lojas/pontos de retirada, despacho e histórico operacional. O motoboy recebe entregas atribuídas, atualiza status e envia localização em tempo real durante a entrega.

Não haverá rastreamento público por link nesta versão. Todo acompanhamento deve exigir login.

## 2. Goals

- Criar uma experiência completa para cliente fazer pedido e acompanhar status autenticado.
- Permitir que o admin gerencie a operação de ponta a ponta.
- Permitir que o motoboy execute entregas pelo celular com GPS real e status claros.
- Garantir que cada perfil só veja os dados permitidos por RLS no Supabase.
- Criar uma UI simples, elegante, responsiva e validável no navegador.
- Manter pagamento fora do sistema nesta versão, registrando apenas valor/status operacional do pedido.

## 3. User Stories

### US-001: Tela inicial com seleção de perfil
**Description:** As a visitante, I want escolher entre cliente, admin e motoboy so that eu acesse rapidamente a área correta do sistema.

**Acceptance Criteria:**
- [ ] A rota `/` mostra proposta do sistema, métricas resumidas e três CTAs: Cliente, Admin, Motoboy.
- [ ] Cada CTA leva para a área correta ou tela de login correspondente.
- [ ] Não existe CTA para rastreamento público.
- [ ] Layout desktop usa hero + painel lateral; layout mobile empilha as seções.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-002: Login autenticado por perfil
**Description:** As a usuário, I want fazer login com email/senha so that eu acesse apenas minha área autorizada.

**Acceptance Criteria:**
- [ ] Existe tela/estado de login para Cliente, Admin e Motoboy.
- [ ] Login usa Supabase Auth.
- [ ] Usuário admin vai para `/admin`.
- [ ] Usuário cliente vai para `/cliente`.
- [ ] Usuário motoboy vai para `/motoboy`.
- [ ] Se o perfil não corresponde à rota acessada, o sistema bloqueia a tela e pede login correto.
- [ ] Mensagens de erro aparecem para credenciais inválidas.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-003: Dashboard do cliente
**Description:** As a cliente, I want ver meus pedidos e status so that eu acompanhe a evolução das entregas sem depender de link público.

**Acceptance Criteria:**
- [ ] Rota `/cliente` lista somente pedidos cujo `client_profile_id` pertence ao cliente logado.
- [ ] Cada card mostra número do pedido, loja, endereço de entrega, status e motoboy atribuído quando existir.
- [ ] O cliente vê status: Na fila, Atribuído, Na retirada, A caminho, Entregue, Atrasado, Cancelado.
- [ ] O cliente não consegue ver pedidos de outros clientes.
- [ ] Estado vazio orienta o cliente a criar o primeiro pedido.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Criar pedido pelo cliente
**Description:** As a cliente, I want criar um pedido informando loja, destino e itens so that o admin possa despachar a entrega.

**Acceptance Criteria:**
- [ ] Tela/formulário permite escolher loja/ponto de retirada.
- [ ] Tela/formulário permite informar destino, telefone e itens.
- [ ] Ao criar, pedido nasce com status `queued` e sem motoboy atribuído.
- [ ] Pedido criado aparece imediatamente na lista do cliente.
- [ ] Pedido criado aparece para o admin em tempo real ou após atualização automática.
- [ ] Não há checkout nem cobrança dentro do sistema.
- [ ] Campos obrigatórios mostram erro antes do envio.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: Detalhe autenticado do pedido do cliente
**Description:** As a cliente, I want abrir um pedido específico so that eu veja detalhes, status, ETA e mapa quando houver entrega em andamento.

**Acceptance Criteria:**
- [ ] Detalhe mostra loja, itens, valor, endereço de retirada, endereço de entrega e histórico de status.
- [ ] Antes da atribuição, mostra “Aguardando admin despachar”.
- [ ] Após atribuição, mostra nome do motoboy, veículo e status atual.
- [ ] Durante entrega, mostra mapa com retirada, destino e localização do motoboy.
- [ ] ETA aparece apenas quando houver rota/localização suficiente.
- [ ] Cliente não vê telefone completo do motoboy se isso não for necessário para o MVP.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Dashboard operacional do admin
**Description:** As an admin, I want ver visão geral da operação so that eu saiba quais pedidos precisam de ação.

**Acceptance Criteria:**
- [ ] Rota `/admin` mostra cards de métricas: pedidos ativos, pendentes, motoboys online, entregues hoje e atrasados.
- [ ] Lista principal mostra pedidos ordenados por prioridade operacional: atrasados, pendentes, em andamento, concluídos.
- [ ] Mapa mostra pedido selecionado, motoboy e rota quando aplicável.
- [ ] Admin consegue selecionar um pedido para ver detalhes.
- [ ] Admin vê todos os pedidos autorizados pela role admin.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-007: Gerenciar e despachar pedidos no admin
**Description:** As an admin, I want atribuir pedidos a motoboys so that entregas sejam executadas.

**Acceptance Criteria:**
- [ ] Pedido com status `queued` mostra ação “Atribuir motoboy”.
- [ ] Admin escolhe um motoboy disponível/online em uma lista ou modal.
- [ ] Ao atribuir, pedido muda para `assigned`.
- [ ] Motoboy atribuído passa a ver a entrega em `/motoboy`.
- [ ] Evento de atribuição entra no histórico do pedido.
- [ ] Admin pode cancelar pedido com confirmação.
- [ ] Admin pode marcar pedido como atrasado com motivo obrigatório.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Tela de detalhe do pedido para admin
**Description:** As an admin, I want ver todos os detalhes de um pedido so that eu possa resolver problemas operacionais.

**Acceptance Criteria:**
- [ ] Detalhe mostra cliente, telefone, loja, itens, valor, endereços, horários, status e motoboy.
- [ ] Mostra timeline de eventos: criado, atribuído, retirada, a caminho, entregue, atraso, cancelamento.
- [ ] Mostra mapa com retirada, destino e última localização do motoboy.
- [ ] Mostra ações contextuais conforme status.
- [ ] Mostra estado de erro se rota/ETA não carregar.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-009: Gerenciar motoboys
**Description:** As an admin, I want cadastrar e editar motoboys so that a operação mantenha uma frota organizada.

**Acceptance Criteria:**
- [ ] Tela `/admin/motoboys` lista motoboys com nome, telefone, veículo, placa, status e avaliação.
- [ ] Admin pode criar motoboy vinculado a um perfil de usuário courier.
- [ ] Admin pode editar telefone, veículo, placa e status operacional.
- [ ] Admin pode desativar motoboy sem apagar histórico.
- [ ] Tela mostra entregas ativas e histórico resumido por motoboy.
- [ ] Busca por nome/telefone/placa funciona.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-010: Gerenciar clientes
**Description:** As an admin, I want consultar clientes so that eu possa apoiar atendimento e operação.

**Acceptance Criteria:**
- [ ] Tela `/admin/clientes` lista clientes com nome, email, telefone e total de pedidos.
- [ ] Admin pode abrir detalhe do cliente.
- [ ] Detalhe mostra pedidos recentes, status e endereços usados.
- [ ] Admin não edita senha do cliente nesta versão.
- [ ] Busca por nome/email/telefone funciona.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-011: Gerenciar lojas/pontos de retirada
**Description:** As an admin, I want gerenciar lojas/pontos de retirada so that clientes possam selecionar origens válidas.

**Acceptance Criteria:**
- [ ] Tela `/admin/lojas` lista lojas com nome, endereço, coordenadas, status e contato.
- [ ] Admin pode criar, editar e desativar loja.
- [ ] Loja desativada não aparece para o cliente ao criar pedido.
- [ ] Coordenadas são obrigatórias para cálculo de rota.
- [ ] Formulário valida campos obrigatórios.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-012: Histórico operacional
**Description:** As an admin, I want consultar histórico de entregas so that eu audite a operação.

**Acceptance Criteria:**
- [ ] Tela `/admin/historico` lista entregas concluídas, canceladas e atrasadas.
- [ ] Filtros por status, motoboy, cliente, loja e período funcionam.
- [ ] Cada item abre timeline do pedido.
- [ ] Histórico usa dados de `delivery_events`.
- [ ] Exportação CSV fica fora do MVP, mas a UI pode reservar espaço futuro.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-013: Tela do motoboy com entrega ativa
**Description:** As a motoboy, I want ver minha entrega ativa so that eu execute a entrega sem confusão no celular.

**Acceptance Criteria:**
- [ ] Rota `/motoboy` mostra apenas entregas atribuídas ao motoboy logado.
- [ ] Tela mobile-first mostra número do pedido, cliente, destino, loja e ETA.
- [ ] Mostra mapa com rota, retirada e destino.
- [ ] Mostra ação principal contextual: chegar na retirada, sair para entrega, finalizar entrega.
- [ ] Botões são grandes e fáceis de tocar no celular.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-014: GPS real e simulação do motoboy
**Description:** As a motoboy, I want enviar minha localização so that admin e cliente acompanhem a entrega autenticada.

**Acceptance Criteria:**
- [ ] Botão “Ativar GPS real” solicita permissão do navegador.
- [ ] Quando permitido, `watchPosition` envia localização para `courier_locations`.
- [ ] Quando negado, mensagem clara explica como habilitar localização.
- [ ] Botão “Simular rota demo” move o motoboy pela rota sem GPS real.
- [ ] Admin e cliente veem a última localização autorizada conforme suas permissões.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-015: Histórico do motoboy
**Description:** As a motoboy, I want ver entregas anteriores so that eu acompanhe meu trabalho.

**Acceptance Criteria:**
- [ ] Tela `/motoboy/historico` lista entregas atribuídas ao motoboy logado.
- [ ] Mostra status final, data, cliente e distância estimada.
- [ ] Motoboy não vê entregas de outros motoboys.
- [ ] Estado vazio aparece se não houver histórico.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-016: Estados globais de carregamento, erro e vazio
**Description:** As a user, I want estados claros de loading, erro e vazio so that eu entenda o que está acontecendo.

**Acceptance Criteria:**
- [ ] Todas as listas têm loading state.
- [ ] Todas as listas têm empty state específico por perfil.
- [ ] Erros de Supabase aparecem em toast ou bloco contextual.
- [ ] Erros de mapa/rota mostram fallback sem quebrar a tela.
- [ ] A sessão expirada redireciona para login.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-017: Responsividade e acessibilidade
**Description:** As a user, I want usar o sistema em desktop e celular so that cada perfil funcione no dispositivo adequado.

**Acceptance Criteria:**
- [ ] Admin funciona bem em desktop e tablet.
- [ ] Cliente funciona bem em desktop e mobile.
- [ ] Motoboy é otimizado para mobile.
- [ ] Elementos interativos têm foco visível.
- [ ] Botões e inputs têm labels acessíveis.
- [ ] Contraste mínimo WCAG AA para texto essencial.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## 4. Functional Requirements

- FR-1: O sistema deve ter rotas autenticadas para `/admin`, `/cliente` e `/motoboy`.
- FR-2: O sistema não deve ter rota pública de rastreamento, como `/r/:code`.
- FR-3: O cliente deve conseguir criar pedidos com loja, destino, telefone e itens.
- FR-4: Todo pedido criado por cliente deve salvar `client_profile_id` do usuário logado.
- FR-5: O cliente deve visualizar apenas pedidos vinculados ao próprio `client_profile_id`.
- FR-6: O admin deve visualizar todos os pedidos.
- FR-7: O admin deve atribuir pedido pendente a um motoboy.
- FR-8: Ao atribuir pedido, o status deve mudar para `assigned`.
- FR-9: O motoboy deve visualizar apenas pedidos atribuídos a ele.
- FR-10: O motoboy deve atualizar status seguindo fluxo permitido: `assigned` -> `pickup` -> `in_transit` -> `delivered`.
- FR-11: O motoboy deve poder enviar localização real usando geolocalização do navegador.
- FR-12: O sistema deve manter modo de simulação de rota para demo.
- FR-13: Admin e cliente autenticado devem ver localização do motoboy somente quando houver pedido vinculado.
- FR-14: Admin deve gerenciar motoboys: listar, criar, editar, desativar e consultar histórico.
- FR-15: Admin deve gerenciar clientes: listar, buscar e abrir detalhe operacional.
- FR-16: Admin deve gerenciar lojas/pontos de retirada: listar, criar, editar e desativar.
- FR-17: Admin deve consultar histórico operacional por status, período, cliente, loja e motoboy.
- FR-18: O sistema deve usar Supabase Auth para autenticação.
- FR-19: O sistema deve usar RLS para restringir dados por perfil.
- FR-20: O sistema deve usar Supabase Realtime para atualizar pedidos/localizações quando possível.
- FR-21: Mapas devem usar Leaflet/OpenStreetMap.
- FR-22: Rotas/ETA devem usar OSRM com fallback local quando a API externa falhar.
- FR-23: O sistema deve mostrar estados de loading, erro e vazio para todas as telas principais.
- FR-24: O sistema deve ser responsivo para desktop, tablet e celular.

## 5. Non-Goals (Out of Scope)

- Não haverá pagamento online no MVP.
- Não haverá checkout Pix/cartão no MVP.
- Não haverá rastreamento público sem login.
- Não haverá aplicativo nativo iOS/Android.
- Não haverá chat em tempo real entre cliente, admin e motoboy.
- Não haverá roteirização multi-parada avançada.
- Não haverá cálculo financeiro completo de comissão, repasse ou taxa por km.
- Não haverá prova de entrega por foto/assinatura no MVP.
- Não haverá multi-tenant para várias empresas no MVP.

## 6. Design Considerations

### Direção visual

- Visual simples, elegante e operacional.
- Tema claro com base em tons creme, verde escuro, verde de status e âmbar para ações.
- Evitar aparência genérica; priorizar sensação de central logística confiável.

### Layout por perfil

- Cliente: layout orientado a ação, com formulário claro de pedido e cards de acompanhamento.
- Admin: layout de central de controle, com lista lateral, métricas e mapa grande.
- Motoboy: layout mobile-first, com ação principal sempre evidente.

### Componentes reutilizáveis

- Header/topbar com navegação por perfil.
- Card de pedido.
- Badge de status.
- MapCanvas.
- StatCard.
- Toast/alerta.
- Empty state.
- Form field.
- Modal/drawer de detalhe.

### Estados de status

- `queued`: pedido criado, aguardando admin.
- `assigned`: admin atribuiu motoboy.
- `pickup`: motoboy chegou na retirada.
- `in_transit`: pedido a caminho.
- `delivered`: pedido entregue.
- `delayed`: entrega atrasada.
- `cancelled`: pedido cancelado.

### Responsividade

- Admin desktop: sidebar + mapa + painel de detalhe.
- Admin tablet/mobile: lista e mapa empilhados.
- Cliente desktop: formulário + pedidos + mapa.
- Cliente mobile: formulário primeiro, depois pedidos e mapa.
- Motoboy mobile: card de entrega, mapa compacto e botões grandes.

### Acessibilidade

- Todos os botões devem ter texto visível ou `aria-label`.
- Inputs devem ter labels persistentes.
- Estados de erro devem ser textuais, não apenas por cor.
- Foco visível em navegação por teclado.
- Contraste AA em textos principais.

## 7. Technical Considerations

- Projeto atual usa React + Vite + TypeScript.
- Supabase deve manter tabelas principais: `profiles`, `couriers`, `orders`, `delivery_events`, `courier_locations`.
- O papel do usuário deve vir de `profiles.role`: `admin`, `client`, `courier`.
- `orders.client_profile_id` é obrigatório para pedidos criados por cliente.
- RLS deve impedir cliente de ver pedido de outro cliente.
- RLS deve impedir motoboy de ver entrega de outro motoboy.
- Admin pode ler e gerenciar dados operacionais.
- Não criar RPC pública para rastreamento.
- Para mapas, manter Leaflet/OpenStreetMap.
- Para rota/ETA, manter OSRM e fallback local.
- Para deploy, manter Vercel com variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Nunca versionar `SUPABASE_DB_URL` ou service role key.

## 8. Success Metrics

- Cliente consegue criar um pedido em menos de 60 segundos.
- Admin consegue atribuir pedido em até 3 cliques após abrir `/admin`.
- Motoboy consegue iniciar o fluxo de entrega em até 2 cliques.
- 100% das rotas principais retornam HTTP 200 no deploy.
- 0 erros de lint/typecheck/build.
- RLS bloqueia acesso cruzado entre clientes e motoboys.
- Não existe endpoint ou tela pública para rastreamento.

## 9. Open Questions

- O cliente deve poder cancelar pedido antes do admin atribuir motoboy?
- O admin deve poder editar pedidos criados por cliente?
- O sistema deve ter cadastro aberto ou apenas usuários criados pelo admin?
- Deve existir comprovante de entrega em uma próxima versão?
- Deve existir tabela de lojas real no banco ou a seleção de lojas pode continuar mockada no MVP inicial?
- O motoboy deve poder recusar uma entrega atribuída?
