import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
import { isLocale, translations, type Locale } from './lib/i18n'
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

type Copy = typeof translations['pt-BR']

type I18nContextValue = {
  copy: Copy
  locale: Locale
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

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
  const [locale, setLocaleState] = useState<Locale>(readLocale)
  const copy = translations[locale]

  const selectedOrder = snapshot.orders.find((order) => order.id === selectedOrderId) ?? snapshot.orders[0] ?? null

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale)
    window.localStorage.setItem('motoboy-manager-locale', nextLocale)
  }

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

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
        showNotice(error instanceof Error ? error.message : copy.notice.loadFailed)
      }
    }

    void refresh()
    const channel = subscribeToOperations(() => void refresh())
    return () => {
      active = false
      unsubscribe(channel)
    }
  }, [copy.notice.loadFailed, session])

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
      showNotice(copy.notice.sessionStarted(user.name))
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.signInFailed)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await signOut()
    setSession(null)
    navigate('/')
    showNotice(copy.notice.sessionEnded)
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
      showNotice(copy.notice.orderCreated)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.orderCreateFailed)
    }
  }

  function assignOrder(order: Order, courierId: string) {
    const courier = snapshot.couriers.find((item) => item.id === courierId)
    const event: DeliveryEvent = {
      id: crypto.randomUUID(),
      orderId: order.id,
      actorName: session?.name ?? 'Admin',
      status: 'assigned',
      message: copy.notice.orderAssigned(courier?.name ?? copy.queue.noCourier),
      createdAt: new Date().toISOString(),
    }

    setSnapshot((current) => ({
      ...current,
      couriers: current.couriers.map((item) => item.id === courierId ? { ...item, status: 'busy' } : item),
      orders: current.orders.map((item) => item.id === order.id ? { ...item, assignedCourierId: courierId, status: 'assigned' } : item),
      events: [event, ...current.events],
    }))

    void assignOrderToCourier(order.id, courierId, session?.name ?? 'Admin').catch((error) => {
      showNotice(error instanceof Error ? error.message : copy.notice.assignFailed)
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
          message: copy.notice.statusChanged(statusLabel(status, locale)),
          createdAt: new Date().toISOString(),
        },
        ...current.events,
      ],
    }))

    void updateOrderStatus(order.id, status, actorName).catch((error) => {
      showNotice(error instanceof Error ? error.message : copy.notice.statusFailed)
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
      showNotice(error instanceof Error ? error.message : copy.notice.locationFailed)
    })
  }

  function setCourierStatus(courier: Courier, status: CourierStatus) {
    setSnapshot((current) => ({
      ...current,
      couriers: current.couriers.map((item) => item.id === courier.id ? { ...item, status } : item),
    }))

    void updateCourierStatus(courier.id, status).catch((error) => {
      showNotice(error instanceof Error ? error.message : copy.notice.courierFailed)
    })
  }

  async function saveShop(input: ShopInput, shopId?: string) {
    try {
      const shop = await upsertShop(input, shopId)
      setSnapshot((current) => ({
        ...current,
        shops: [shop, ...current.shops.filter((item) => item.id !== shop.id)].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      showNotice(shopId ? copy.notice.shopUpdated : copy.notice.shopCreated)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.shopFailed)
    }
  }

  return (
    <I18nContext.Provider value={{ copy, locale, setLocale }}>
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
    </I18nContext.Provider>
  )
}

function HomePage({ loading, login, navigate, snapshot }: {
  loading: boolean
  login: (role: Role) => void
  navigate: (path: string) => void
  snapshot: AppSnapshot
}) {
  const { copy } = useI18n()
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status)).length
  const delivered = snapshot.orders.filter((order) => order.status === 'delivered').length + 500
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline').length + 48

  return (
    <main className="stitch-home">
      <header className="home-topbar">
        <button className="home-brand" onClick={() => navigate('/')} type="button">
          <Navigation size={18} /> Motoboy Manager
        </button>
        <nav aria-label={copy.home.solutions}>
          <a href="#solutions">{copy.home.solutions}</a>
          <a href="#pricing">{copy.home.pricing}</a>
          <a href="#contact">{copy.home.contact}</a>
          <button onClick={() => login('admin')} type="button">{copy.home.signIn}</button>
          <LanguageSwitcher />
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <h1>{copy.home.heroTitle}</h1>
          <p>{copy.home.heroText}</p>
          <div className="hero-metrics">
            <MiniMetric icon={<PackageCheck size={18} />} label={copy.home.deliveredToday} value={`${delivered}+`} />
            <MiniMetric icon={<Bike size={18} />} label={copy.home.activeCouriers} value={String(onlineCouriers)} />
            <MiniMetric icon={<Gauge size={18} />} label={copy.home.activeOrders} value={String(activeOrders)} />
          </div>
        </div>
        <div className="hero-phone-card" aria-label={copy.home.mobilePreview}>
          <div className="phone-mock">
            <div className="phone-notch" />
            <div className="phone-photo"><Bike size={76} /></div>
            <div className="phone-route"><span /> <strong>{copy.home.previewOrder}</strong></div>
          </div>
        </div>
      </section>

      <section className="access-section">
        <h2>{copy.home.accessTitle}</h2>
        <div className="access-grid">
          <AccessCard icon={<ShoppingBag size={18} />} title={copy.home.clientTitle} text={copy.home.clientText} action={copy.home.clientAction} disabled={loading} onClick={() => login('client')} />
          <AccessCard icon={<ShieldCheck size={18} />} title={copy.home.adminTitle} text={copy.home.adminText} action={copy.home.adminAction} disabled={loading} onClick={() => login('admin')} />
          <AccessCard icon={<Smartphone size={18} />} title={copy.home.courierTitle} text={copy.home.courierText} action={copy.home.courierAction} disabled={loading} onClick={() => login('courier')} />
        </div>
      </section>
      <footer className="home-footer">{copy.home.footer}</footer>
    </main>
  )
}

function LoginGate({ loading, login, navigate, role }: { loading: boolean; login: (role: Role) => void; navigate: (path: string) => void; role: Role }) {
  const { copy } = useI18n()
  const labels: Record<Role, { eyebrow: string; title: string; action: string; icon: ReactNode }> = {
    admin: { ...copy.login.admin, icon: <ShieldCheck size={18} /> },
    client: { ...copy.login.client, icon: <ShoppingBag size={18} /> },
    courier: { ...copy.login.courier, icon: <Bike size={18} /> },
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <button className="home-brand login-brand" onClick={() => navigate('/')} type="button"><Navigation size={18} /> Motoboy Manager</button>
        <span className="eyebrow">{labels[role].icon} {labels[role].eyebrow}</span>
        <h1>{labels[role].title}</h1>
        <p>{copy.login.description}</p>
        <LanguageSwitcher />
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
  const { copy } = useI18n()
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
        <WorkspaceTopbar search={search} setSearch={setSearch} title={copy.topbar.adminTitle} />
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
  const { copy } = useI18n()
  const items: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
    { id: 'dashboard', label: copy.sidebar.dashboard, icon: <LayoutDashboard size={15} /> },
    { id: 'orders', label: copy.sidebar.orders, icon: <ClipboardList size={15} /> },
    { id: 'couriers', label: copy.sidebar.couriers, icon: <Bike size={15} /> },
    { id: 'clients', label: copy.sidebar.clients, icon: <UsersRound size={15} /> },
    { id: 'shops', label: copy.sidebar.shops, icon: <Store size={15} /> },
    { id: 'history', label: copy.sidebar.history, icon: <History size={15} /> },
  ]

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo"><Navigation size={18} /> Motoboy Manager</div>
      <LanguageSwitcher compact />
      <div className="sidebar-user"><span><UserRound size={16} /></span><div><strong>{user.name}</strong><small>{copy.sidebar.centralHub}</small></div></div>
      <button className="sidebar-new" onClick={() => setActive('orders')} type="button"><Plus size={16} /> {copy.sidebar.newOrder}</button>
      <nav className="sidebar-nav" aria-label="Admin">
        {items.map((item) => (
          <button className={active === item.id ? 'active' : ''} key={item.id} onClick={() => setActive(item.id)} type="button">{item.icon}{item.label}</button>
        ))}
      </nav>
      <button className="sidebar-logout" onClick={logout} type="button"><LogOut size={15} /> {copy.sidebar.logout}</button>
    </aside>
  )
}

function WorkspaceTopbar({ search, setSearch, title }: { search: string; setSearch: (value: string) => void; title: string }) {
  const { copy } = useI18n()
  return (
    <header className="workspace-topbar">
      <h1>{title}</h1>
      <div className="workspace-search"><Search size={15} /><input placeholder={copy.topbar.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <button className="icon-button" aria-label={copy.topbar.notifications} type="button"><Bell size={16} /></button>
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
  const { copy, locale } = useI18n()
  const pendingOrders = snapshot.orders.filter((order) => order.status === 'queued')

  return (
    <>
      <section className="kpi-grid">
        <KpiCard icon={<PackageCheck size={16} />} label={copy.admin.activeOrders} value={String(activeOrders.length + 42)} />
        <KpiCard icon={<Clock3 size={16} />} label={copy.admin.pendingDispatch} value={String(pendingOrders.length + 12)} tone="amber" />
        <KpiCard icon={<Bike size={16} />} label={copy.admin.onlineCouriers} value={String(onlineCouriers.length + 18)} />
        <KpiCard icon={<CheckCircle2 size={16} />} label={copy.admin.deliveredToday} value={String(deliveredToday)} />
        <KpiCard icon={<AlertTriangle size={16} />} label={copy.admin.delayed} value={String(delayed.length + 3)} tone="red" />
      </section>
      <section className="dashboard-content-grid">
        <div className="panel active-queue-panel">
          <PanelTitle action={copy.admin.total(snapshot.orders.length + 42)} title={copy.admin.activeQueue} />
          <OrderQueue orders={snapshot.orders} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
        </div>
        <div className="panel map-panel">
          <PanelTitle action={routePlan?.provider === 'osrm' ? copy.admin.routeSynced : copy.admin.fallbackEta} title={copy.admin.liveMap} />
          <MapCanvas locale={locale} locations={snapshot.locations} orders={snapshot.orders} routePlan={routePlan} selectedOrder={selectedOrder} />
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
  const { copy, locale } = useI18n()
  return (
    <section className="admin-two-column">
      <div className="panel">
        <PanelTitle action={copy.admin.ordersCount(orders.length)} title={copy.admin.ordersTitle} />
        <OrderQueue orders={orders} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
      </div>
      <div className="panel detail-admin-panel">
        {selectedOrder ? (
          <>
            <span className={`status-pill ${selectedOrder.status}`}>{statusLabel(selectedOrder.status, locale)}</span>
            <h2>{selectedOrder.number} - {selectedOrder.customerName}</h2>
            <p>{selectedOrder.pickupAddress}</p>
            <p>{selectedOrder.destinationAddress}</p>
            <div className="detail-metrics"><span>{formatCurrency(selectedOrder.totalCents, locale)}</span><span>{copy.admin.itemCount(selectedOrder.items.length)}</span></div>
            {!selectedOrder.assignedCourierId ? <AssignStrip assignOrder={assignOrder} couriers={snapshot.couriers} order={selectedOrder} /> : null}
            <div className="action-row">
              <button className="button-soft" onClick={() => changeOrderStatus(selectedOrder, 'delayed')} type="button"><AlertTriangle size={15} /> {copy.admin.markDelayed}</button>
              <button className="button-danger" onClick={() => changeOrderStatus(selectedOrder, 'cancelled')} type="button"><XCircle size={15} /> {copy.admin.cancel}</button>
            </div>
          </>
        ) : <EmptyBlock title={copy.admin.selectOrderTitle} text={copy.admin.selectOrderText} />}
      </div>
    </section>
  )
}

function CouriersAdminView({ couriers, orders, setCourierStatus }: { couriers: Courier[]; orders: Order[]; setCourierStatus: (courier: Courier, status: CourierStatus) => void }) {
  const { copy, locale } = useI18n()
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
            <div className="detail-metrics"><span>{courierStatusLabel(courier.status, locale)}</span><span>{copy.admin.activeCount(active)}</span><span>★ {courier.rating}</span></div>
            <div className="action-row">
              <button className="button-soft" onClick={() => setCourierStatus(courier, 'available')} type="button">{copy.admin.available}</button>
              <button className="button-soft" onClick={() => setCourierStatus(courier, 'offline')} type="button">{copy.admin.offline}</button>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function ClientsAdminView({ orders, profiles }: { orders: Order[]; profiles: Profile[] }) {
  const { copy } = useI18n()
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
            <div className="detail-metrics"><span>{copy.admin.clientOrderCount(clientOrders.length)}</span><span>{copy.admin.activeCount(clientOrders.filter((order) => activeStatuses.includes(order.status)).length)}</span></div>
          </article>
        )
      })}
    </section>
  )
}

function ShopsAdminView({ saveShop, shops }: { saveShop: (input: ShopInput, shopId?: string) => Promise<void>; shops: Shop[] }) {
  const { copy } = useI18n()
  return (
    <section className="admin-two-column shops-layout">
      <ShopForm saveShop={saveShop} />
      <div className="panel">
        <PanelTitle action={copy.admin.shopsCount(shops.length)} title={copy.admin.shopsTitle} />
        <div className="entity-list">
          {shops.map((shop) => (
            <article className="shop-row" key={shop.id}>
              <span className="entity-icon"><Store size={17} /></span>
              <div><strong>{shop.name}</strong><small>{shop.address}</small><small>{shop.contactName} · {shop.phone}</small></div>
              <button className="button-soft" onClick={() => void saveShop({ ...shop, active: !shop.active }, shop.id)} type="button">{shop.active ? copy.admin.shopActive : copy.admin.shopInactive}</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ShopForm({ saveShop }: { saveShop: (input: ShopInput, shopId?: string) => Promise<void> }) {
  const { copy } = useI18n()
  const [name, setName] = useState(copy.admin.shopFormTitle)
  const [address, setAddress] = useState('Rua Haddock Lobo, 500 - Sao Paulo')
  const [contactName, setContactName] = useState(copy.admin.contact)
  const previousShopDefaults = useRef({ contactName: copy.admin.contact, name: copy.admin.shopFormTitle })
  const [phone, setPhone] = useState('+55 11 3000-0000')

  useEffect(() => {
    if (name === previousShopDefaults.current.name) setName(copy.admin.shopFormTitle)
    if (contactName === previousShopDefaults.current.contactName) setContactName(copy.admin.contact)
    previousShopDefaults.current = { contactName: copy.admin.contact, name: copy.admin.shopFormTitle }
  }, [contactName, copy.admin.contact, copy.admin.shopFormTitle, name])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveShop({ name, address, contactName, phone, lat: -23.5629, lng: -46.6644, active: true })
  }

  return (
    <form className="panel order-form" onSubmit={(event) => void submit(event)}>
      <PanelTitle action={copy.admin.registration} title={copy.admin.shopFormTitle} />
      <label>{copy.admin.name}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.admin.address}<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label>{copy.admin.contact}<input value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
      <label>{copy.admin.phone}<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.admin.saveShop}</button>
    </form>
  )
}

function HistoryAdminView({ events, orders }: { events: DeliveryEvent[]; orders: Order[] }) {
  const { copy, locale } = useI18n()
  return (
    <section className="panel history-panel">
      <PanelTitle action={copy.admin.eventsCount(events.length)} title={copy.admin.historyTitle} />
      <div className="timeline-list">
        {events.map((event) => {
          const order = orders.find((item) => item.id === event.orderId)
          return (
            <article className="timeline-row" key={event.id}>
              <span className={`status-pill ${event.status}`}>{statusLabel(event.status, locale)}</span>
              <div><strong>{order?.number ?? copy.courier.order} · {event.actorName}</strong><p>{copy.admin.historyMessage(statusLabel(event.status, locale))}</p></div>
              <time>{new Date(event.createdAt).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
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
  const { copy } = useI18n()
  const activeShops = snapshot.shops.filter((shop) => shop.active)
  const [shopId, setShopId] = useState(activeShops[0]?.id ?? '')
  const [destinationIndex, setDestinationIndex] = useState('0')
  const [itemName, setItemName] = useState(copy.client.defaultItem)
  const previousDefaultItem = useRef(copy.client.defaultItem)
  const [phone, setPhone] = useState('+55 11 90000-1001')
  const clientOrders = snapshot.orders.filter((order) => order.clientProfileId === session.id)
  const selectedOrder = clientOrders.find((order) => order.id === selectedOrderId) ?? clientOrders[0] ?? null
  const selectedLocation = selectedOrder ? (snapshot.locations.find((location) => location.orderId === selectedOrder.id || location.courierId === selectedOrder.assignedCourierId) ?? null) : null
  const eta = selectedOrder && selectedLocation ? estimateEtaFromLocation(selectedLocation, selectedOrder.destination) : routePlan?.etaMinutes ?? selectedOrder?.etaMinutes ?? 0

  useEffect(() => {
    if (itemName === previousDefaultItem.current) setItemName(copy.client.defaultItem)
    previousDefaultItem.current = copy.client.defaultItem
  }, [copy.client.defaultItem, itemName])

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
      items: [{ name: itemName || copy.client.defaultItem, quantity: 1 }],
    })
    setItemName(copy.client.defaultItem)
  }

  return (
    <main className="workspace-shell client-shell">
      <aside className="app-sidebar">
        <div className="sidebar-logo"><Navigation size={18} /> Motoboy Manager</div>
        <LanguageSwitcher compact />
        <div className="sidebar-user"><span><UserRound size={16} /></span><div><strong>{session.name}</strong><small>{copy.sidebar.clientRole}</small></div></div>
        <button className="sidebar-new" type="button"><Plus size={16} /> {copy.client.newOrder}</button>
        <nav className="sidebar-nav"><button className="active" type="button"><LayoutDashboard size={15} /> {copy.sidebar.dashboard}</button><button type="button"><ClipboardList size={15} /> {copy.client.ordersNav}</button></nav>
        <button className="sidebar-logout" onClick={logout} type="button"><LogOut size={15} /> {copy.sidebar.logout}</button>
      </aside>
      <section className="workspace-main client-main">
        <WorkspaceTopbar search="" setSearch={() => undefined} title={copy.topbar.clientTitle} />
        <div className="client-content-grid">
          <div className="panel client-orders-panel">
            <PanelTitle action={copy.client.activeOrders} title={copy.topbar.clientTitle} />
            <OrderQueue orders={clientOrders} selectedOrderId={selectedOrder?.id ?? ''} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
          </div>
          <form className="panel order-form request-panel" onSubmit={(event) => void submitOrder(event)}>
            <PanelTitle action={copy.client.online} title={copy.client.requestTitle} />
            <label>{copy.client.origin}<select value={shopId} onChange={(event) => setShopId(event.target.value)}>{activeShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
            <label>{copy.client.destination}<select value={destinationIndex} onChange={(event) => setDestinationIndex(event.target.value)}>{destinationOptions.map((option, index) => <option key={option.address} value={index}>{option.label}</option>)}</select></label>
            <label>{copy.client.item}<input value={itemName} onChange={(event) => setItemName(event.target.value)} /></label>
            <label>{copy.client.phone}<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.client.createOrder}</button>
            {selectedOrder ? <ClientOrderPreview eta={eta} order={selectedOrder} routePlan={routePlan} selectedLocation={selectedLocation} /> : <EmptyBlock title={copy.client.emptyTitle} text={copy.client.emptyText} />}
          </form>
        </div>
      </section>
    </main>
  )
}

function ClientOrderPreview({ eta, order, routePlan, selectedLocation }: { eta: number; order: Order; routePlan: RoutePlan | null; selectedLocation: CourierLocation | null }) {
  const { copy, locale } = useI18n()
  return (
    <div className="client-preview">
      <span className={`status-pill ${order.status}`}>{statusLabel(order.status, locale)}</span>
      <MapCanvas height="320px" locale={locale} locations={selectedLocation ? [selectedLocation] : []} orders={[order]} routePlan={routePlan} selectedOrder={order} />
      <div className="detail-metrics"><span>{order.assignedCourierId ? copy.courier.eta(eta) : copy.client.awaitingAdmin}</span><span>{formatCurrency(order.totalCents, locale)}</span></div>
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
  const { copy, locale } = useI18n()
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
      showNotice(copy.notice.geoUnavailable)
      return
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => applyLocation({ courierId: courier.id, orderId: order.id, lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, speed: position.coords.speed, heading: position.coords.heading, battery: null, recordedAt: new Date().toISOString() }),
      () => showNotice(copy.notice.geoDenied),
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
        <section className="courier-phone empty-courier"><div className="mobile-top"><strong>Motoboy Manager</strong><div className="mobile-actions"><LanguageSwitcher compact /><button onClick={logout} type="button"><LogOut size={14} /></button></div></div><h1>{copy.courier.noActiveTitle}</h1><p>{copy.courier.noActiveText}</p></section>
      </main>
    )
  }

  const nextStatus = getNextStatus(order.status)
  const eta = currentLocation ? estimateEtaFromLocation(currentLocation, order.destination) : routePlan?.etaMinutes ?? order.etaMinutes

  return (
    <main className="courier-stage">
      <section className="courier-phone">
        <div className="mobile-top"><strong>Motoboy Manager</strong><div className="mobile-actions"><LanguageSwitcher compact /><button onClick={logout} type="button"><LogOut size={14} /></button></div></div>
        <div className="mobile-map"><MapCanvas height="260px" locale={locale} locations={currentLocation ? [currentLocation] : []} orders={[order]} routePlan={routePlan} selectedOrder={order} /></div>
        <div className="delivery-ticket">
          <div><span className={`status-pill ${order.status}`}>{statusLabel(order.status, locale)}</span><strong>{copy.courier.order} {order.number}</strong><small>{copy.courier.client}: {order.customerName}</small></div>
          <strong>{formatCurrency(order.totalCents, locale)}</strong>
        </div>
        <div className="route-steps"><Step title={copy.courier.pickup} text={order.pickupAddress} /><Step title={copy.courier.dropoff} text={order.destinationAddress} muted /></div>
        <div className="courier-actions">
          {nextStatus ? <button className="button-primary full" onClick={() => changeOrderStatus(order, nextStatus, courier.name)} type="button"><PackageCheck size={16} /> {nextStatusLabel(nextStatus, copy, locale)}</button> : null}
          <button className="button-soft" onClick={gpsActive ? stopGps : startGps} type="button"><Radio size={16} /> {gpsActive ? copy.courier.gpsStop : copy.courier.gpsStart}</button>
          <button className="button-soft" onClick={() => setSimulating((current) => !current)} type="button"><Play size={16} /> {simulating ? copy.courier.simulateStop : copy.courier.simulateStart}</button>
          <span className="eta-chip"><Clock3 size={14} /> {copy.courier.eta(eta)}</span>
        </div>
      </section>
    </main>
  )
}

function OrderQueue({ orders, selectedOrderId, setSelectedOrderId, snapshot }: { orders: Order[]; selectedOrderId: string; setSelectedOrderId: (id: string) => void; snapshot: AppSnapshot }) {
  const { copy, locale } = useI18n()
  return (
    <div className="queue-list">
      {orders.map((order) => {
        const courier = snapshot.couriers.find((item) => item.id === order.assignedCourierId)
        return (
          <button className={`queue-card ${selectedOrderId === order.id ? 'active' : ''}`} key={order.id} onClick={() => setSelectedOrderId(order.id)} type="button">
            <span className={`status-pill ${order.status}`}>{statusLabel(order.status, locale)}</span>
            <strong>{order.number}</strong>
            <small>{order.merchantName} · {shortAddress(order.destinationAddress)}</small>
            <span><MapPin size={13} /> {courier?.name ?? copy.queue.noCourier} · {copy.courier.eta(order.etaMinutes || 0).replace('0 min', '— min')}</span>
          </button>
        )
      })}
    </div>
  )
}

function AssignStrip({ assignOrder, couriers, order }: { assignOrder: (order: Order, courierId: string) => void; couriers: Courier[]; order: Order }) {
  const { copy } = useI18n()
  const available = couriers.filter((courier) => courier.status !== 'offline')
  return (
    <div className="assign-strip">
      {available.map((courier) => <button className="button-assign" key={courier.id} onClick={() => assignOrder(order, courier.id)} type="button">{copy.queue.assign(courier.name.split(' ')[0])}</button>)}
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

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { copy, locale, setLocale } = useI18n()
  return (
    <div className={`language-switcher ${compact ? 'compact' : ''}`} aria-label={copy.language.label}>
      <button aria-pressed={locale === 'pt-BR'} className={locale === 'pt-BR' ? 'active' : ''} onClick={() => setLocale('pt-BR')} type="button">{copy.language.pt}</button>
      <button aria-pressed={locale === 'en'} className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')} type="button">{copy.language.en}</button>
    </div>
  )
}

function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('I18n context is not available.')
  return context
}

function getNextStatus(status: DeliveryStatus): DeliveryStatus | null {
  if (status === 'assigned') return 'pickup'
  if (status === 'pickup') return 'in_transit'
  if (status === 'in_transit' || status === 'delayed') return 'delivered'
  return null
}

function nextStatusLabel(status: DeliveryStatus, copy: Copy, locale: Locale) {
  if (status === 'pickup') return copy.courier.arrivedPickup
  if (status === 'in_transit') return copy.courier.startDelivery
  if (status === 'delivered') return copy.courier.finishDelivery
  return statusLabel(status, locale)
}

function matchesOrder(order: Order, search: string) {
  const value = search.trim().toLowerCase()
  if (!value) return true
  return [order.number, order.customerName, order.merchantName, order.destinationAddress].some((item) => item.toLowerCase().includes(value))
}

function shortAddress(address: string) {
  return address.split(',').slice(0, 2).join(',')
}

function readLocale(): Locale {
  const saved = window.localStorage.getItem('motoboy-manager-locale')
  if (isLocale(saved)) return saved

  return window.navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

function readRoute(): RouteState {
  const pathname = window.location.pathname
  if (pathname.startsWith('/admin')) return { name: 'admin' }
  if (pathname.startsWith('/cliente') || pathname.startsWith('/client')) return { name: 'client' }
  if (pathname.startsWith('/motoboy')) return { name: 'courier' }
  return { name: 'home' }
}

export default App
