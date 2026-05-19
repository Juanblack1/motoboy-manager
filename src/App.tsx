import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Bell,
  Bike,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  Play,
  Plus,
  PlusCircle,
  Radio,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react'

import { MapCanvas } from './components/MapCanvas'
import { demoSnapshot } from './lib/demo-data'
import { courierStatusLabel, estimateEtaFromLocation, formatCurrency, getRoutePlan, interpolatePoint, statusLabel } from './lib/geo'
import {
  assignOrderToCourier,
  createClientOrder,
  loadSnapshot,
  signInWithDemoRole,
  signOut,
  subscribeToOperations,
  unsubscribe,
  updateCourierStatus,
  updateOrderStatus,
  upsertLocation,
  upsertShop,
  type CreateOrderInput,
  type ShopInput,
} from './lib/repository'
import type {
  AppSnapshot,
  Courier,
  CourierLocation,
  CourierStatus,
  DeliveryEvent,
  DeliveryStatus,
  Order,
  Profile,
  Role,
  RoutePlan,
  SessionUser,
  Shop,
} from './types'

type RouteState =
  | { name: 'home' }
  | { name: 'admin' }
  | { name: 'client' }
  | { name: 'courier' }

type AdminTab = 'dashboard' | 'orders' | 'couriers' | 'clients' | 'shops' | 'history'

const activeStatuses: DeliveryStatus[] = ['assigned', 'pickup', 'in_transit', 'delayed']

const destinationOptions = [
  { label: 'Rua Oscar Freire, 620 - Jardins', address: 'Rua Oscar Freire, 620 - Jardins, Sao Paulo', point: { lat: -23.561325, lng: -46.669402 } },
  { label: 'Rua Frei Caneca, 720 - Consolacao', address: 'Rua Frei Caneca, 720 - Consolacao, Sao Paulo', point: { lat: -23.553379, lng: -46.651782 } },
  { label: 'Rua Pamplona, 1005 - Jardim Paulista', address: 'Rua Pamplona, 1005 - Jardim Paulista, Sao Paulo', point: { lat: -23.568295, lng: -46.661425 } },
]

function App() {
  const [route, setRoute] = useState<RouteState>(readRoute())
  const [session, setSession] = useState<SessionUser | null>(null)
  const [snapshot, setSnapshot] = useState<AppSnapshot>(demoSnapshot)
  const [selectedOrderId, setSelectedOrderId] = useState(demoSnapshot.orders[0]?.id ?? '')
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedOrder = snapshot.orders.find((order) => order.id === selectedOrderId) ?? snapshot.orders[0] ?? null

  useEffect(() => {
    const onPopState = () => setRoute(readRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!session) return

    let active = true
    const refresh = async () => {
      try {
        const nextSnapshot = await loadSnapshot()
        if (!active) return
        setSnapshot(nextSnapshot)
        setSelectedOrderId((current) => current || nextSnapshot.orders[0]?.id || '')
      } catch (error) {
        showNotice(error instanceof Error ? error.message : 'Falha ao carregar dados da operacao.')
      }
    }

    void refresh()
    const channel = subscribeToOperations(() => void refresh())
    return () => {
      active = false
      unsubscribe(channel)
    }
  }, [session])

  useEffect(() => {
    if (!selectedOrder) return

    let cancelled = false
    void getRoutePlan(selectedOrder).then((plan) => {
      if (!cancelled) setRoutePlan(plan)
    })

    return () => {
      cancelled = true
    }
  }, [selectedOrder])

  function navigate(path: string) {
    window.history.pushState({}, '', path)
    setRoute(readRoute())
  }

  async function login(role: Role) {
    setLoading(true)
    try {
      const user = await signInWithDemoRole(role)
      setSession(user)
      navigate(role === 'admin' ? '/admin' : role === 'client' ? '/cliente' : '/motoboy')
      showNotice(`Sessao iniciada como ${user.name}.`)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Nao foi possivel entrar.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await signOut()
    setSession(null)
    navigate('/')
    showNotice('Sessao encerrada.')
  }

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4200)
  }

  async function createOrder(input: CreateOrderInput) {
    try {
      const order = await createClientOrder(input)
      setSnapshot((current) => ({ ...current, orders: [order, ...current.orders] }))
      setSelectedOrderId(order.id)
      showNotice('Pedido criado e enviado para o admin.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Falha ao criar pedido.')
    }
  }

  function assignOrder(order: Order, courierId: string) {
    const courier = snapshot.couriers.find((item) => item.id === courierId)
    const event: DeliveryEvent = {
      id: crypto.randomUUID(),
      orderId: order.id,
      actorName: session?.name ?? 'Admin',
      status: 'assigned',
      message: `Pedido atribuido para ${courier?.name ?? 'motoboy'}.`,
      createdAt: new Date().toISOString(),
    }

    setSnapshot((current) => ({
      ...current,
      couriers: current.couriers.map((item) => item.id === courierId ? { ...item, status: 'busy' } : item),
      orders: current.orders.map((item) => item.id === order.id ? { ...item, assignedCourierId: courierId, status: 'assigned' } : item),
      events: [event, ...current.events],
    }))

    void assignOrderToCourier(order.id, courierId, session?.name ?? 'Admin').catch((error) => {
      showNotice(error instanceof Error ? error.message : 'Falha ao atribuir pedido.')
    })
  }

  function changeOrderStatus(order: Order, status: DeliveryStatus, actorName: string) {
    setSnapshot((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === order.id ? { ...item, status } : item),
      events: [
        {
          id: crypto.randomUUID(),
          orderId: order.id,
          actorName,
          status,
          message: `Status alterado para ${statusLabel(status)}.`,
          createdAt: new Date().toISOString(),
        },
        ...current.events,
      ],
    }))

    void updateOrderStatus(order.id, status, actorName).catch((error) => {
      showNotice(error instanceof Error ? error.message : 'Falha ao atualizar status.')
    })
  }

  function applyLocation(location: CourierLocation) {
    setSnapshot((current) => ({
      ...current,
      locations: [
        ...current.locations.filter((item) => item.courierId !== location.courierId),
        location,
      ],
    }))

    void upsertLocation(location).catch((error) => {
      showNotice(error instanceof Error ? error.message : 'Falha ao enviar localizacao.')
    })
  }

  function setCourierStatus(courier: Courier, status: CourierStatus) {
    setSnapshot((current) => ({
      ...current,
      couriers: current.couriers.map((item) => item.id === courier.id ? { ...item, status } : item),
    }))

    void updateCourierStatus(courier.id, status).catch((error) => {
      showNotice(error instanceof Error ? error.message : 'Falha ao atualizar motoboy.')
    })
  }

  async function saveShop(input: ShopInput, shopId?: string) {
    try {
      const shop = await upsertShop(input, shopId)
      setSnapshot((current) => ({
        ...current,
        shops: [shop, ...current.shops.filter((item) => item.id !== shop.id)].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      showNotice(shopId ? 'Loja atualizada.' : 'Loja criada.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Falha ao salvar loja.')
    }
  }

  return (
    <div className="app-shell">
      {notice ? <div className="toast" role="status">{notice}</div> : null}

      {route.name === 'home' ? (
        <HomePage loading={loading} login={login} navigate={navigate} snapshot={snapshot} />
      ) : null}

      {route.name === 'admin' ? (
        session?.role === 'admin' ? (
          <AdminPage
            assignOrder={assignOrder}
            changeOrderStatus={(order, status) => changeOrderStatus(order, status, session.name)}
            logout={logout}
            routePlan={routePlan}
            saveShop={saveShop}
            selectedOrder={selectedOrder}
            selectedOrderId={selectedOrderId}
            setCourierStatus={setCourierStatus}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
            user={session}
          />
        ) : (
          <LoginGate loading={loading} login={login} navigate={navigate} role="admin" />
        )
      ) : null}

      {route.name === 'client' ? (
        session?.role === 'client' ? (
          <ClientPage
            createOrder={createOrder}
            logout={logout}
            routePlan={routePlan}
            selectedOrderId={selectedOrderId}
            session={session}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
          />
        ) : (
          <LoginGate loading={loading} login={login} navigate={navigate} role="client" />
        )
      ) : null}

      {route.name === 'courier' ? (
        session?.role === 'courier' ? (
          <CourierPage
            applyLocation={applyLocation}
            changeOrderStatus={changeOrderStatus}
            logout={logout}
            routePlan={routePlan}
            session={session}
            showNotice={showNotice}
            snapshot={snapshot}
          />
        ) : (
          <LoginGate loading={loading} login={login} navigate={navigate} role="courier" />
        )
      ) : null}
    </div>
  )
}

function HomePage({ loading, login, navigate, snapshot }: {
  loading: boolean
  login: (role: Role) => void
  navigate: (path: string) => void
  snapshot: AppSnapshot
}) {
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status)).length
  const delivered = snapshot.orders.filter((order) => order.status === 'delivered').length + 500
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline').length + 48

  return (
    <main className="stitch-home">
      <header className="home-topbar">
        <button className="home-brand" onClick={() => navigate('/')} type="button">
          <Navigation size={18} /> Motoboy Manager
        </button>
        <nav aria-label="Institucional">
          <a href="#solutions">Solucoes</a>
          <a href="#pricing">Precos</a>
          <a href="#contact">Contato</a>
          <button onClick={() => login('admin')} type="button">Entrar</button>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <h1>A gestao completa da sua logistica de entregas</h1>
          <p>Centralize pedidos, rastreie frota em tempo real e aumente a eficiencia das suas operacoes diarias com uma plataforma focada em performance.</p>
          <div className="hero-metrics">
            <MiniMetric icon={<PackageCheck size={18} />} label="Entregas hoje" value={`${delivered}+`} />
            <MiniMetric icon={<Bike size={18} />} label="Motoboys ativos" value={String(onlineCouriers)} />
            <MiniMetric icon={<Gauge size={18} />} label="Pedidos ativos" value={String(activeOrders)} />
          </div>
        </div>
        <div className="hero-phone-card" aria-label="Previa mobile do motoboy">
          <div className="phone-mock">
            <div className="phone-notch" />
            <div className="phone-photo"><Bike size={76} /></div>
            <div className="phone-route"><span /> <strong>Entrega #8492</strong></div>
          </div>
        </div>
      </section>

      <section className="access-section">
        <h2>Acesse seu ambiente</h2>
        <div className="access-grid">
          <AccessCard icon={<ShoppingBag size={18} />} title="Painel do Cliente" text="Crie e acompanhe o status dos seus pedidos em tempo real." action="Acessar portal" disabled={loading} onClick={() => login('client')} />
          <AccessCard icon={<ShieldCheck size={18} />} title="Painel do Admin" text="Gerencie frota, faca o despacho e visualize relatorios operacionais." action="Acessar painel" disabled={loading} onClick={() => login('admin')} />
          <AccessCard icon={<Smartphone size={18} />} title="Painel do Motoboy" text="Aceite rotas, confirme entregas e acompanhe seus ganhos diarios." action="Acessar entregas" disabled={loading} onClick={() => login('courier')} />
        </div>
      </section>
      <footer className="home-footer">© 2026 Motoboy Manager. Sistema focado em eficiencia logistica.</footer>
    </main>
  )
}

function LoginGate({ loading, login, navigate, role }: { loading: boolean; login: (role: Role) => void; navigate: (path: string) => void; role: Role }) {
  const labels: Record<Role, { eyebrow: string; title: string; action: string; icon: ReactNode }> = {
    admin: { eyebrow: 'Acesso admin', title: 'Operations Dashboard', action: 'Entrar como admin de teste', icon: <ShieldCheck size={18} /> },
    client: { eyebrow: 'Acesso cliente', title: 'Meu Painel', action: 'Entrar como cliente de teste', icon: <ShoppingBag size={18} /> },
    courier: { eyebrow: 'Acesso motoboy', title: 'Entregas', action: 'Entrar como motoboy de teste', icon: <Bike size={18} /> },
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <button className="home-brand login-brand" onClick={() => navigate('/')} type="button"><Navigation size={18} /> Motoboy Manager</button>
        <span className="eyebrow">{labels[role].icon} {labels[role].eyebrow}</span>
        <h1>{labels[role].title}</h1>
        <p>Use as credenciais de demo configuradas no Supabase para acessar este ambiente.</p>
        <button className="button-primary full" disabled={loading} onClick={() => login(role)} type="button">{labels[role].action}</button>
      </section>
    </main>
  )
}

function AdminPage({ assignOrder, changeOrderStatus, logout, routePlan, saveShop, selectedOrder, selectedOrderId, setCourierStatus, setSelectedOrderId, snapshot, user }: {
  assignOrder: (order: Order, courierId: string) => void
  changeOrderStatus: (order: Order, status: DeliveryStatus) => void
  logout: () => void
  routePlan: RoutePlan | null
  saveShop: (input: ShopInput, shopId?: string) => Promise<void>
  selectedOrder: Order | null
  selectedOrderId: string
  setCourierStatus: (courier: Courier, status: CourierStatus) => void
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
  user: SessionUser
}) {
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [search, setSearch] = useState('')
  const filteredOrders = snapshot.orders.filter((order) => matchesOrder(order, search))
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status))
  const deliveredToday = snapshot.orders.filter((order) => order.status === 'delivered').length + 156
  const delayed = snapshot.orders.filter((order) => order.status === 'delayed')
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline')

  return (
    <main className="workspace-shell">
      <AdminSidebar active={tab} logout={logout} setActive={setTab} user={user} />
      <section className="workspace-main">
        <WorkspaceTopbar search={search} setSearch={setSearch} title="Operations Dashboard" />
        {tab === 'dashboard' ? (
          <AdminDashboard
            activeOrders={activeOrders}
            assignOrder={assignOrder}
            deliveredToday={deliveredToday}
            delayed={delayed}
            onlineCouriers={onlineCouriers}
            routePlan={routePlan}
            selectedOrder={selectedOrder}
            selectedOrderId={selectedOrderId}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
          />
        ) : null}
        {tab === 'orders' ? (
          <OrdersAdminView assignOrder={assignOrder} changeOrderStatus={changeOrderStatus} orders={filteredOrders} selectedOrder={selectedOrder} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
        ) : null}
        {tab === 'couriers' ? <CouriersAdminView couriers={snapshot.couriers} orders={snapshot.orders} setCourierStatus={setCourierStatus} /> : null}
        {tab === 'clients' ? <ClientsAdminView orders={snapshot.orders} profiles={snapshot.profiles} /> : null}
        {tab === 'shops' ? <ShopsAdminView saveShop={saveShop} shops={snapshot.shops} /> : null}
        {tab === 'history' ? <HistoryAdminView events={snapshot.events} orders={snapshot.orders} /> : null}
        {tab !== 'dashboard' ? <div className="panel-spacer" /> : null}
      </section>
    </main>
  )
}

function AdminSidebar({ active, logout, setActive, user }: { active: AdminTab; logout: () => void; setActive: (tab: AdminTab) => void; user: SessionUser }) {
  const items: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
    { id: 'orders', label: 'Orders', icon: <ClipboardList size={15} /> },
    { id: 'couriers', label: 'Couriers', icon: <Bike size={15} /> },
    { id: 'clients', label: 'Clients', icon: <UsersRound size={15} /> },
    { id: 'shops', label: 'Shops', icon: <Store size={15} /> },
    { id: 'history', label: 'History', icon: <History size={15} /> },
  ]

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo"><Navigation size={18} /> Motoboy Manager</div>
      <div className="sidebar-user"><span><UserRound size={16} /></span><div><strong>{user.name}</strong><small>Central Hub</small></div></div>
      <button className="sidebar-new" onClick={() => setActive('orders')} type="button"><Plus size={16} /> New Order</button>
      <nav className="sidebar-nav" aria-label="Admin">
        {items.map((item) => (
          <button className={active === item.id ? 'active' : ''} key={item.id} onClick={() => setActive(item.id)} type="button">{item.icon}{item.label}</button>
        ))}
      </nav>
      <button className="sidebar-logout" onClick={logout} type="button"><LogOut size={15} /> Sair</button>
    </aside>
  )
}

function WorkspaceTopbar({ search, setSearch, title }: { search: string; setSearch: (value: string) => void; title: string }) {
  return (
    <header className="workspace-topbar">
      <h1>{title}</h1>
      <div className="workspace-search"><Search size={15} /><input placeholder="Search orders, couriers..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <button className="icon-button" aria-label="Notificacoes" type="button"><Bell size={16} /></button>
    </header>
  )
}

function AdminDashboard({ activeOrders, assignOrder, deliveredToday, delayed, onlineCouriers, routePlan, selectedOrder, selectedOrderId, setSelectedOrderId, snapshot }: {
  activeOrders: Order[]
  assignOrder: (order: Order, courierId: string) => void
  deliveredToday: number
  delayed: Order[]
  onlineCouriers: Courier[]
  routePlan: RoutePlan | null
  selectedOrder: Order | null
  selectedOrderId: string
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  const pendingOrders = snapshot.orders.filter((order) => order.status === 'queued')

  return (
    <>
      <section className="kpi-grid">
        <KpiCard icon={<PackageCheck size={16} />} label="Active Orders" value={String(activeOrders.length + 42)} />
        <KpiCard icon={<Clock3 size={16} />} label="Pending Dispatch" value={String(pendingOrders.length + 12)} tone="amber" />
        <KpiCard icon={<Bike size={16} />} label="Online Couriers" value={String(onlineCouriers.length + 18)} />
        <KpiCard icon={<CheckCircle2 size={16} />} label="Delivered Today" value={String(deliveredToday)} />
        <KpiCard icon={<AlertTriangle size={16} />} label="Delayed" value={String(delayed.length + 3)} tone="red" />
      </section>
      <section className="dashboard-content-grid">
        <div className="panel active-queue-panel">
          <PanelTitle action={`${snapshot.orders.length + 42} Total`} title="Active Queue" />
          <OrderQueue orders={snapshot.orders} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
        </div>
        <div className="panel map-panel">
          <PanelTitle action={routePlan?.provider === 'osrm' ? 'Route synced' : 'Fallback ETA'} title="Live Operational Map" />
          <MapCanvas locations={snapshot.locations} orders={snapshot.orders} routePlan={routePlan} selectedOrder={selectedOrder} />
          {selectedOrder && !selectedOrder.assignedCourierId ? <AssignStrip assignOrder={assignOrder} couriers={snapshot.couriers} order={selectedOrder} /> : null}
        </div>
      </section>
    </>
  )
}

function OrdersAdminView({ assignOrder, changeOrderStatus, orders, selectedOrder, selectedOrderId, setSelectedOrderId, snapshot }: {
  assignOrder: (order: Order, courierId: string) => void
  changeOrderStatus: (order: Order, status: DeliveryStatus) => void
  orders: Order[]
  selectedOrder: Order | null
  selectedOrderId: string
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  return (
    <section className="admin-two-column">
      <div className="panel">
        <PanelTitle action={`${orders.length} pedidos`} title="Orders" />
        <OrderQueue orders={orders} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
      </div>
      <div className="panel detail-admin-panel">
        {selectedOrder ? (
          <>
            <span className={`status-pill ${selectedOrder.status}`}>{statusLabel(selectedOrder.status)}</span>
            <h2>{selectedOrder.number} - {selectedOrder.customerName}</h2>
            <p>{selectedOrder.pickupAddress}</p>
            <p>{selectedOrder.destinationAddress}</p>
            <div className="detail-metrics"><span>{formatCurrency(selectedOrder.totalCents)}</span><span>{selectedOrder.items.length} item(ns)</span></div>
            {!selectedOrder.assignedCourierId ? <AssignStrip assignOrder={assignOrder} couriers={snapshot.couriers} order={selectedOrder} /> : null}
            <div className="action-row">
              <button className="button-soft" onClick={() => changeOrderStatus(selectedOrder, 'delayed')} type="button"><AlertTriangle size={15} /> Marcar atraso</button>
              <button className="button-danger" onClick={() => changeOrderStatus(selectedOrder, 'cancelled')} type="button"><XCircle size={15} /> Cancelar</button>
            </div>
          </>
        ) : <EmptyBlock title="Selecione um pedido" text="Abra um pedido da fila para despachar ou editar status." />}
      </div>
    </section>
  )
}

function CouriersAdminView({ couriers, orders, setCourierStatus }: { couriers: Courier[]; orders: Order[]; setCourierStatus: (courier: Courier, status: CourierStatus) => void }) {
  return (
    <section className="cards-grid-view">
      {couriers.map((courier) => {
        const active = orders.filter((order) => order.assignedCourierId === courier.id && activeStatuses.includes(order.status)).length
        return (
          <article className="panel entity-card" key={courier.id}>
            <span className={`courier-dot ${courier.status}`} />
            <h2>{courier.name}</h2>
            <p>{courier.phone}</p>
            <p>{courier.vehicle} · {courier.plate}</p>
            <div className="detail-metrics"><span>{courierStatusLabel(courier.status)}</span><span>{active} ativa(s)</span><span>★ {courier.rating}</span></div>
            <div className="action-row">
              <button className="button-soft" onClick={() => setCourierStatus(courier, 'available')} type="button">Disponivel</button>
              <button className="button-soft" onClick={() => setCourierStatus(courier, 'offline')} type="button">Offline</button>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function ClientsAdminView({ orders, profiles }: { orders: Order[]; profiles: Profile[] }) {
  const clients = profiles.filter((profile) => profile.role === 'client')
  return (
    <section className="cards-grid-view">
      {clients.map((client) => {
        const clientOrders = orders.filter((order) => order.clientProfileId === client.id)
        return (
          <article className="panel entity-card" key={client.id}>
            <span className="entity-icon"><UsersRound size={18} /></span>
            <h2>{client.name}</h2>
            <p>{client.email}</p>
            <div className="detail-metrics"><span>{clientOrders.length} pedido(s)</span><span>{clientOrders.filter((order) => activeStatuses.includes(order.status)).length} ativo(s)</span></div>
          </article>
        )
      })}
    </section>
  )
}

function ShopsAdminView({ saveShop, shops }: { saveShop: (input: ShopInput, shopId?: string) => Promise<void>; shops: Shop[] }) {
  return (
    <section className="admin-two-column shops-layout">
      <ShopForm saveShop={saveShop} />
      <div className="panel">
        <PanelTitle action={`${shops.length} lojas`} title="Shops" />
        <div className="entity-list">
          {shops.map((shop) => (
            <article className="shop-row" key={shop.id}>
              <span className="entity-icon"><Store size={17} /></span>
              <div><strong>{shop.name}</strong><small>{shop.address}</small><small>{shop.contactName} · {shop.phone}</small></div>
              <button className="button-soft" onClick={() => void saveShop({ ...shop, active: !shop.active }, shop.id)} type="button">{shop.active ? 'Ativa' : 'Inativa'}</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ShopForm({ saveShop }: { saveShop: (input: ShopInput, shopId?: string) => Promise<void> }) {
  const [name, setName] = useState('Nova loja')
  const [address, setAddress] = useState('Rua Haddock Lobo, 500 - Sao Paulo')
  const [contactName, setContactName] = useState('Contato')
  const [phone, setPhone] = useState('+55 11 3000-0000')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveShop({ name, address, contactName, phone, lat: -23.5629, lng: -46.6644, active: true })
  }

  return (
    <form className="panel order-form" onSubmit={(event) => void submit(event)}>
      <PanelTitle action="Cadastro" title="Nova loja" />
      <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Endereco<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label>Contato<input value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
      <label>Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> Salvar loja</button>
    </form>
  )
}

function HistoryAdminView({ events, orders }: { events: DeliveryEvent[]; orders: Order[] }) {
  return (
    <section className="panel history-panel">
      <PanelTitle action={`${events.length} eventos`} title="History" />
      <div className="timeline-list">
        {events.map((event) => {
          const order = orders.find((item) => item.id === event.orderId)
          return (
            <article className="timeline-row" key={event.id}>
              <span className={`status-pill ${event.status}`}>{statusLabel(event.status)}</span>
              <div><strong>{order?.number ?? 'Pedido'} · {event.actorName}</strong><p>{event.message}</p></div>
              <time>{new Date(event.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ClientPage({ createOrder, logout, routePlan, selectedOrderId, session, setSelectedOrderId, snapshot }: {
  createOrder: (input: CreateOrderInput) => Promise<void>
  logout: () => void
  routePlan: RoutePlan | null
  selectedOrderId: string
  session: SessionUser
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  const activeShops = snapshot.shops.filter((shop) => shop.active)
  const [shopId, setShopId] = useState(activeShops[0]?.id ?? '')
  const [destinationIndex, setDestinationIndex] = useState('0')
  const [itemName, setItemName] = useState('Pedido de teste')
  const [phone, setPhone] = useState('+55 11 90000-1001')
  const clientOrders = snapshot.orders.filter((order) => order.clientProfileId === session.id)
  const selectedOrder = clientOrders.find((order) => order.id === selectedOrderId) ?? clientOrders[0] ?? null
  const selectedLocation = selectedOrder ? (snapshot.locations.find((location) => location.orderId === selectedOrder.id || location.courierId === selectedOrder.assignedCourierId) ?? null) : null
  const eta = selectedOrder && selectedLocation ? estimateEtaFromLocation(selectedLocation, selectedOrder.destination) : routePlan?.etaMinutes ?? selectedOrder?.etaMinutes ?? 0

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const shop = activeShops.find((item) => item.id === shopId) ?? activeShops[0]
    const destination = destinationOptions[Number(destinationIndex)] ?? destinationOptions[0]
    if (!shop) return

    await createOrder({
      clientProfileId: session.id,
      customerName: session.name,
      customerPhone: phone,
      merchantName: shop.name,
      pickupAddress: shop.address,
      destinationAddress: destination.address,
      pickup: { lat: shop.lat, lng: shop.lng },
      destination: destination.point,
      totalCents: 6990,
      items: [{ name: itemName || 'Pedido de teste', quantity: 1 }],
    })
    setItemName('Pedido de teste')
  }

  return (
    <main className="workspace-shell client-shell">
      <aside className="app-sidebar">
        <div className="sidebar-logo"><Navigation size={18} /> Motoboy Manager</div>
        <div className="sidebar-user"><span><UserRound size={16} /></span><div><strong>{session.name}</strong><small>Cliente</small></div></div>
        <button className="sidebar-new" type="button"><Plus size={16} /> Novo Pedido</button>
        <nav className="sidebar-nav"><button className="active" type="button"><LayoutDashboard size={15} /> Dashboard</button><button type="button"><ClipboardList size={15} /> Orders</button></nav>
        <button className="sidebar-logout" onClick={logout} type="button"><LogOut size={15} /> Sair</button>
      </aside>
      <section className="workspace-main client-main">
        <WorkspaceTopbar search="" setSearch={() => undefined} title="Meus Pedidos" />
        <div className="client-content-grid">
          <div className="panel client-orders-panel">
            <PanelTitle action="Pedidos Ativos" title="Meus Pedidos" />
            <OrderQueue orders={clientOrders} selectedOrderId={selectedOrder?.id ?? ''} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
          </div>
          <form className="panel order-form request-panel" onSubmit={(event) => void submitOrder(event)}>
            <PanelTitle action="Online" title="Solicitar Nova Entrega" />
            <label>Origem (Loja)<select value={shopId} onChange={(event) => setShopId(event.target.value)}>{activeShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
            <label>Destino<select value={destinationIndex} onChange={(event) => setDestinationIndex(event.target.value)}>{destinationOptions.map((option, index) => <option key={option.address} value={index}>{option.label}</option>)}</select></label>
            <label>Item / Observacoes<input value={itemName} onChange={(event) => setItemName(event.target.value)} /></label>
            <label>Celular<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <button className="button-primary full" type="submit"><PlusCircle size={16} /> Criar pedido</button>
            {selectedOrder ? <ClientOrderPreview eta={eta} order={selectedOrder} routePlan={routePlan} selectedLocation={selectedLocation} /> : <EmptyBlock title="Nenhum pedido" text="Crie uma entrega para visualizar mapa e ETA." />}
          </form>
        </div>
      </section>
    </main>
  )
}

function ClientOrderPreview({ eta, order, routePlan, selectedLocation }: { eta: number; order: Order; routePlan: RoutePlan | null; selectedLocation: CourierLocation | null }) {
  return (
    <div className="client-preview">
      <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
      <MapCanvas height="320px" locations={selectedLocation ? [selectedLocation] : []} orders={[order]} routePlan={routePlan} selectedOrder={order} />
      <div className="detail-metrics"><span>{order.assignedCourierId ? `ETA ${eta} min` : 'Aguardando admin'}</span><span>{formatCurrency(order.totalCents)}</span></div>
    </div>
  )
}

function CourierPage({ applyLocation, changeOrderStatus, logout, routePlan, session, showNotice, snapshot }: {
  applyLocation: (location: CourierLocation) => void
  changeOrderStatus: (order: Order, status: DeliveryStatus, actorName: string) => void
  logout: () => void
  routePlan: RoutePlan | null
  session: SessionUser
  showNotice: (message: string) => void
  snapshot: AppSnapshot
}) {
  const courier = snapshot.couriers.find((item) => item.profileId === session.id) ?? snapshot.couriers[0]
  const order = snapshot.orders.find((item) => item.assignedCourierId === courier?.id && activeStatuses.includes(item.status)) ?? null
  const currentLocation = courier ? snapshot.locations.find((item) => item.courierId === courier.id) ?? null : null
  const [gpsActive, setGpsActive] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const progressRef = useRef(0)
  const watchRef = useRef<number | null>(null)

  useEffect(() => {
    if (!simulating || !routePlan || !courier || !order) return

    const timer = window.setInterval(() => {
      progressRef.current = Math.min(1, progressRef.current + 0.035)
      const point = interpolatePoint(routePlan.points, progressRef.current)
      applyLocation({ courierId: courier.id, orderId: order.id, lat: point.lat, lng: point.lng, accuracy: 8, speed: 9, heading: null, battery: 0.76, recordedAt: new Date().toISOString() })
      if (progressRef.current >= 1) {
        setSimulating(false)
        progressRef.current = 0
      }
    }, 1600)

    return () => window.clearInterval(timer)
  }, [simulating, routePlan, courier, order, applyLocation])

  function startGps() {
    if (!navigator.geolocation || !courier || !order) {
      showNotice('Geolocalizacao nao disponivel neste navegador.')
      return
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => applyLocation({ courierId: courier.id, orderId: order.id, lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, speed: position.coords.speed, heading: position.coords.heading, battery: null, recordedAt: new Date().toISOString() }),
      () => showNotice('Permissao de localizacao negada ou indisponivel.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    )
    setGpsActive(true)
  }

  function stopGps() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setGpsActive(false)
  }

  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
  }, [])

  if (!courier || !order) {
    return (
      <main className="courier-stage">
        <section className="courier-phone empty-courier"><div className="mobile-top"><strong>Motoboy Manager</strong><button onClick={logout} type="button"><LogOut size={14} /></button></div><h1>Nenhuma entrega ativa</h1><p>Quando o admin atribuir um pedido, ele aparece aqui.</p></section>
      </main>
    )
  }

  const nextStatus = getNextStatus(order.status)
  const eta = currentLocation ? estimateEtaFromLocation(currentLocation, order.destination) : routePlan?.etaMinutes ?? order.etaMinutes

  return (
    <main className="courier-stage">
      <section className="courier-phone">
        <div className="mobile-top"><strong>Motoboy Manager</strong><button onClick={logout} type="button"><LogOut size={14} /></button></div>
        <div className="mobile-map"><MapCanvas height="260px" locations={currentLocation ? [currentLocation] : []} orders={[order]} routePlan={routePlan} selectedOrder={order} /></div>
        <div className="delivery-ticket">
          <div><span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span><strong>Pedido {order.number}</strong><small>Cliente: {order.customerName}</small></div>
          <strong>{formatCurrency(order.totalCents)}</strong>
        </div>
        <div className="route-steps"><Step title="Retirada" text={order.pickupAddress} /><Step title="Entrega" text={order.destinationAddress} muted /></div>
        <div className="courier-actions">
          {nextStatus ? <button className="button-primary full" onClick={() => changeOrderStatus(order, nextStatus, courier.name)} type="button"><PackageCheck size={16} /> {nextStatusLabel(nextStatus)}</button> : null}
          <button className="button-soft" onClick={gpsActive ? stopGps : startGps} type="button"><Radio size={16} /> {gpsActive ? 'Parar GPS' : 'GPS real'}</button>
          <button className="button-soft" onClick={() => setSimulating((current) => !current)} type="button"><Play size={16} /> {simulating ? 'Parar demo' : 'Simular rota'}</button>
          <span className="eta-chip"><Clock3 size={14} /> ETA {eta} min</span>
        </div>
      </section>
    </main>
  )
}

function OrderQueue({ orders, selectedOrderId, setSelectedOrderId, snapshot }: { orders: Order[]; selectedOrderId: string; setSelectedOrderId: (id: string) => void; snapshot: AppSnapshot }) {
  return (
    <div className="queue-list">
      {orders.map((order) => {
        const courier = snapshot.couriers.find((item) => item.id === order.assignedCourierId)
        return (
          <button className={`queue-card ${selectedOrderId === order.id ? 'active' : ''}`} key={order.id} onClick={() => setSelectedOrderId(order.id)} type="button">
            <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
            <strong>{order.number}</strong>
            <small>{order.merchantName} · {shortAddress(order.destinationAddress)}</small>
            <span><MapPin size={13} /> {courier?.name ?? 'Sem motoboy'} · ETA {order.etaMinutes || '—'} min</span>
          </button>
        )
      })}
    </div>
  )
}

function AssignStrip({ assignOrder, couriers, order }: { assignOrder: (order: Order, courierId: string) => void; couriers: Courier[]; order: Order }) {
  const available = couriers.filter((courier) => courier.status !== 'offline')
  return (
    <div className="assign-strip">
      {available.map((courier) => <button className="button-assign" key={courier.id} onClick={() => assignOrder(order, courier.id)} type="button">Atribuir {courier.name.split(' ')[0]}</button>)}
    </div>
  )
}

function KpiCard({ icon, label, tone, value }: { icon: ReactNode; label: string; tone?: 'amber' | 'red'; value: string }) {
  return <article className={`kpi-card ${tone ?? ''}`}><span>{label}{icon}</span><strong>{value}</strong></article>
}

function MiniMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="mini-metric"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>
}

function AccessCard({ action, disabled, icon, onClick, text, title }: { action: string; disabled: boolean; icon: ReactNode; onClick: () => void; text: string; title: string }) {
  return <article className="access-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p><button disabled={disabled} onClick={onClick} type="button">{action} →</button></article>
}

function PanelTitle({ action, title }: { action?: string; title: string }) {
  return <div className="panel-title"><h2>{title}</h2>{action ? <span>{action}</span> : null}</div>
}

function EmptyBlock({ text, title }: { text: string; title: string }) {
  return <div className="empty-block"><h2>{title}</h2><p>{text}</p></div>
}

function Step({ muted, text, title }: { muted?: boolean; text: string; title: string }) {
  return <div className={`route-step ${muted ? 'muted' : ''}`}><span /><div><strong>{title}</strong><p>{text}</p></div></div>
}

function getNextStatus(status: DeliveryStatus): DeliveryStatus | null {
  if (status === 'assigned') return 'pickup'
  if (status === 'pickup') return 'in_transit'
  if (status === 'in_transit' || status === 'delayed') return 'delivered'
  return null
}

function nextStatusLabel(status: DeliveryStatus) {
  if (status === 'pickup') return 'Cheguei na retirada'
  if (status === 'in_transit') return 'Sair para entrega'
  if (status === 'delivered') return 'Finalizar entrega'
  return statusLabel(status)
}

function matchesOrder(order: Order, search: string) {
  const value = search.trim().toLowerCase()
  if (!value) return true
  return [order.number, order.customerName, order.merchantName, order.destinationAddress].some((item) => item.toLowerCase().includes(value))
}

function shortAddress(address: string) {
  return address.split(',').slice(0, 2).join(',')
}

function readRoute(): RouteState {
  const pathname = window.location.pathname
  if (pathname.startsWith('/admin')) return { name: 'admin' }
  if (pathname.startsWith('/cliente') || pathname.startsWith('/client')) return { name: 'client' }
  if (pathname.startsWith('/motoboy')) return { name: 'courier' }
  return { name: 'home' }
}

export default App
