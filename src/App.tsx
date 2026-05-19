import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
  Target,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react'

import { MapCanvas } from './components/MapCanvas'
import { demoSnapshot } from './lib/demo-data'
import { courierStatusLabel, estimateEtaFromLocation, formatCurrency, getRoutePlan, haversineKm, interpolatePoint, statusLabel } from './lib/geo'
import { isLocale, translations, type Locale } from './lib/i18n'
import {
  assignOrderToCourier,
  createClientOrder,
  loadSnapshot,
  signInWithDemoRole,
  signOut,
  subscribeToOperations,
  unsubscribe,
  upsertCourier,
  upsertCustomer,
  upsertProduct,
  upsertStaffMember,
  updateCourierStatus,
  updateOrderStatus,
  upsertLocation,
  upsertShop,
  type CourierInput,
  type CreateOrderInput,
  type CustomerInput,
  type ProductInput,
  type ShopInput,
  type StaffMemberInput,
} from './lib/repository'
import type {
  AppSnapshot,
  Courier,
  CourierLocation,
  CourierStatus,
  Customer,
  DeliveryEvent,
  DeliveryStatus,
  Order,
  Product,
  Role,
  RoutePlan,
  SessionUser,
  Shop,
  StaffMember,
} from './types'

type RouteState =
  | { name: 'home' }
  | { name: 'admin' }
  | { name: 'client' }
  | { name: 'courier' }

type AdminTab = 'dashboard' | 'orders' | 'couriers' | 'clients' | 'shops' | 'team' | 'history'
type ClientTab = 'dashboard' | 'orders' | 'newOrder'
type OrderStatusFilter = DeliveryStatus | 'all'

type Copy = typeof translations['pt-BR']

type NotificationItem = {
  id: string
  orderId: string
  read: boolean
  title: string
  description: string
  time: string
}

type I18nContextValue = {
  copy: Copy
  locale: Locale
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

const activeStatuses: DeliveryStatus[] = ['assigned', 'pickup', 'in_transit', 'delayed']
const statusFilterValues: OrderStatusFilter[] = ['all', 'queued', 'assigned', 'pickup', 'in_transit', 'delayed', 'delivered', 'cancelled']

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
    const nextCourierStatus = getCourierStatusAfterOrderStatus(status)

    setSnapshot((current) => ({
      ...current,
      couriers: nextCourierStatus && order.assignedCourierId
        ? current.couriers.map((item) => item.id === order.assignedCourierId ? { ...item, status: nextCourierStatus } : item)
        : current.couriers,
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

    if (nextCourierStatus && order.assignedCourierId) {
      void updateCourierStatus(order.assignedCourierId, nextCourierStatus).catch((error) => {
        showNotice(error instanceof Error ? error.message : copy.notice.courierFailed)
      })
    }
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

  async function saveProduct(input: ProductInput, productId?: string) {
    try {
      const product = await upsertProduct(input, productId)
      setSnapshot((current) => ({
        ...current,
        products: [product, ...current.products.filter((item) => item.id !== product.id)].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      showNotice(productId ? copy.notice.productUpdated : copy.notice.productCreated)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.productFailed)
    }
  }

  async function saveCustomer(input: CustomerInput, customerId?: string) {
    try {
      const customer = await upsertCustomer(input, customerId)
      setSnapshot((current) => ({
        ...current,
        customers: [customer, ...current.customers.filter((item) => item.id !== customer.id)].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      showNotice(customerId ? copy.notice.customerUpdated : copy.notice.customerCreated)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.customerFailed)
    }
  }

  async function saveCourier(input: CourierInput, courierId?: string) {
    try {
      const courier = await upsertCourier(input, courierId)
      setSnapshot((current) => ({
        ...current,
        couriers: [courier, ...current.couriers.filter((item) => item.id !== courier.id)].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      showNotice(courierId ? copy.notice.courierUpdated : copy.notice.courierCreated)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.courierFailed)
    }
  }

  async function saveStaffMember(input: StaffMemberInput, staffMemberId?: string) {
    try {
      const staffMember = await upsertStaffMember(input, staffMemberId)
      setSnapshot((current) => ({
        ...current,
        staffMembers: [staffMember, ...current.staffMembers.filter((item) => item.id !== staffMember.id)].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      showNotice(staffMemberId ? copy.notice.staffUpdated : copy.notice.staffCreated)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : copy.notice.staffFailed)
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
            saveCourier={saveCourier}
            saveCustomer={saveCustomer}
            saveProduct={saveProduct}
            saveShop={saveShop}
            saveStaffMember={saveStaffMember}
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
            assignOrder={assignOrder}
            changeOrderStatus={changeOrderStatus}
            logout={logout}
            markCourierStatus={setCourierStatus}
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
            <div className="phone-photo"><img alt="" src="/assets/site/delivery-hero.svg" /></div>
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

function AdminPage({ assignOrder, changeOrderStatus, logout, routePlan, saveCourier, saveCustomer, saveProduct, saveShop, saveStaffMember, selectedOrder, selectedOrderId, setCourierStatus, setSelectedOrderId, snapshot, user }: {
  assignOrder: (order: Order, courierId: string) => void
  changeOrderStatus: (order: Order, status: DeliveryStatus) => void
  logout: () => void
  routePlan: RoutePlan | null
  saveCourier: (input: CourierInput, courierId?: string) => Promise<void>
  saveCustomer: (input: CustomerInput, customerId?: string) => Promise<void>
  saveProduct: (input: ProductInput, productId?: string) => Promise<void>
  saveShop: (input: ShopInput, shopId?: string) => Promise<void>
  saveStaffMember: (input: StaffMemberInput, staffMemberId?: string) => Promise<void>
  selectedOrder: Order | null
  selectedOrderId: string
  setCourierStatus: (courier: Courier, status: CourierStatus) => void
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
  user: SessionUser
}) {
  const { copy, locale } = useI18n()
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [search, setSearch] = useState('')
  const filteredOrders = sortOrdersByPriority(snapshot.orders.filter((order) => matchesOrder(order, search)))
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status))
  const deliveredToday = snapshot.orders.filter((order) => order.status === 'delivered').length
  const delayed = snapshot.orders.filter((order) => order.status === 'delayed')
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline')
  const { markAllNotificationsRead, markNotificationRead, readNotificationIds } = useNotificationReadState(user.id)
  const notifications = makeNotificationItems(snapshot.events, snapshot.orders, copy, locale, readNotificationIds)

  function openNotification(notification: NotificationItem) {
    setSelectedOrderId(notification.orderId)
    setTab('orders')
  }

  return (
    <main className="workspace-shell">
      <AdminSidebar active={tab} logout={logout} setActive={setTab} user={user} />
      <section className="workspace-main">
        <WorkspaceTopbar markAllNotificationsRead={() => markAllNotificationsRead(notifications.map((notification) => notification.id))} markNotificationRead={markNotificationRead} notifications={notifications} openNotification={openNotification} search={search} setSearch={setSearch} title={copy.topbar.adminTitle} />
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
        {tab === 'couriers' ? <CouriersAdminView couriers={snapshot.couriers} orders={snapshot.orders} saveCourier={saveCourier} search={search} setCourierStatus={setCourierStatus} /> : null}
        {tab === 'clients' ? <ClientsAdminView saveCustomer={saveCustomer} search={search} snapshot={snapshot} /> : null}
        {tab === 'shops' ? <ShopsAdminView saveProduct={saveProduct} saveShop={saveShop} search={search} snapshot={snapshot} /> : null}
        {tab === 'team' ? <TeamAdminView saveStaffMember={saveStaffMember} search={search} staffMembers={snapshot.staffMembers} /> : null}
        {tab === 'history' ? <HistoryAdminView events={snapshot.events} orders={snapshot.orders} search={search} /> : null}
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
    { id: 'team', label: copy.sidebar.team, icon: <ShieldCheck size={15} /> },
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

function WorkspaceTopbar({ markAllNotificationsRead, markNotificationRead, notifications = [], openNotification, search, setSearch, title }: {
  markAllNotificationsRead?: () => void
  markNotificationRead?: (id: string) => void
  notifications?: NotificationItem[]
  openNotification?: (notification: NotificationItem) => void
  search: string
  setSearch: (value: string) => void
  title: string
}) {
  const { copy } = useI18n()
  const [open, setOpen] = useState(false)
  const unreadCount = notifications.filter((notification) => !notification.read).length

  function openItem(notification: NotificationItem) {
    markNotificationRead?.(notification.id)
    openNotification?.(notification)
    setOpen(false)
  }

  return (
    <header className="workspace-topbar">
      <h1>{title}</h1>
      <div className="workspace-search"><Search size={15} /><input aria-label={copy.topbar.searchPlaceholder} placeholder={copy.topbar.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="notifications-menu">
        <button className="icon-button" aria-expanded={open} aria-label={copy.topbar.notifications} onClick={() => setOpen((current) => !current)} type="button">
          <Bell size={16} />
          {unreadCount ? <span className="notification-badge">{unreadCount}</span> : null}
        </button>
        {open ? (
          <div className="notifications-panel" role="dialog" aria-label={copy.topbar.notifications}>
            <div className="notifications-panel-head">
              <PanelTitle action={unreadCount ? copy.topbar.notificationCount(unreadCount) : copy.topbar.allRead} title={copy.topbar.latestNotifications} />
              {notifications.length ? <button className="notification-mark-all" onClick={markAllNotificationsRead} type="button">{copy.topbar.markAllRead}</button> : null}
            </div>
            {notifications.length ? (
              <div className="notification-list">
                {notifications.map((item) => (
                  <article className={`notification-row ${item.read ? 'read' : 'unread'}`} key={item.id}>
                    <button className="notification-main" onClick={() => openItem(item)} type="button">
                      <span className="notification-dot" />
                      <span>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                        <time>{item.time}</time>
                      </span>
                    </button>
                    {!item.read ? <button className="notification-read-action" onClick={() => markNotificationRead?.(item.id)} type="button">{copy.topbar.markRead}</button> : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyBlock title={copy.topbar.notificationsEmptyTitle} text={copy.topbar.notificationsEmptyText} />
            )}
          </div>
        ) : null}
      </div>
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
        <KpiCard icon={<PackageCheck size={16} />} label={copy.admin.activeOrders} value={String(activeOrders.length)} />
        <KpiCard icon={<Clock3 size={16} />} label={copy.admin.pendingDispatch} value={String(pendingOrders.length)} tone="amber" />
        <KpiCard icon={<Bike size={16} />} label={copy.admin.onlineCouriers} value={String(onlineCouriers.length)} />
        <KpiCard icon={<CheckCircle2 size={16} />} label={copy.admin.deliveredToday} value={String(deliveredToday)} />
        <KpiCard icon={<AlertTriangle size={16} />} label={copy.admin.delayed} value={String(delayed.length)} tone="red" />
      </section>
      <section className="dashboard-content-grid">
        <div className="panel active-queue-panel">
          <PanelTitle action={copy.admin.total(snapshot.orders.length)} title={copy.admin.activeQueue} />
          <OrderQueue orders={sortOrdersByPriority(snapshot.orders)} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
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
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all')
  const visibleOrders = orders.filter((order) => matchesStatusFilter(order, statusFilter))

  useEffect(() => {
    if (visibleOrders.length && !visibleOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(visibleOrders[0].id)
    }
  }, [selectedOrderId, setSelectedOrderId, visibleOrders])

  return (
    <section className="admin-two-column">
      <div className="panel">
        <PanelTitle action={copy.admin.ordersCount(visibleOrders.length)} title={copy.admin.ordersTitle} />
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <OrderQueue orders={visibleOrders} selectedOrderId={selectedOrderId} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
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

function CouriersAdminView({ couriers, orders, saveCourier, search, setCourierStatus }: { couriers: Courier[]; orders: Order[]; saveCourier: (input: CourierInput, courierId?: string) => Promise<void>; search: string; setCourierStatus: (courier: Courier, status: CourierStatus) => void }) {
  const { copy, locale } = useI18n()
  const visibleCouriers = couriers.filter((courier) => matchesCourier(courier, search))
  return (
    <section className="registry-workbench">
      <CourierForm saveCourier={saveCourier} />
      <div className="registry-list-panel panel">
        <PanelTitle action={copy.admin.couriersCount(visibleCouriers.length)} title={copy.sidebar.couriers} />
        <div className="cards-grid-view compact-cards">
          {visibleCouriers.length ? visibleCouriers.map((courier) => {
            const activeCourierOrders = orders.filter((order) => order.assignedCourierId === courier.id && activeStatuses.includes(order.status))
            const activeOrder = activeCourierOrders[0] ?? null
            const operationalLabel = courier.status === 'offline'
              ? courierStatusLabel('offline', locale)
              : activeOrder
                ? statusLabel(activeOrder.status, locale)
                : courierStatusLabel('available', locale)
            return (
              <article className="entity-card registry-card" key={courier.id}>
                <span className={`courier-dot ${courier.status}`} />
                <h2>{courier.name}</h2>
                <p>{courier.phone}</p>
                <p>{courier.vehicle} · {courier.plate}</p>
                <div className="detail-metrics"><span>{operationalLabel}</span><span>{copy.admin.activeCount(activeCourierOrders.length)}</span><span>★ {courier.rating}</span></div>
                <div className="action-row">
                  <button className="button-soft" onClick={() => setCourierStatus(courier, 'available')} type="button">{copy.admin.available}</button>
                  <button className="button-soft" onClick={() => setCourierStatus(courier, 'offline')} type="button">{copy.admin.offline}</button>
                </div>
              </article>
            )
          }) : <EmptyBlock title={copy.filters.noResultsTitle} text={copy.filters.noResultsText} />}
        </div>
      </div>
    </section>
  )
}

function CourierForm({ saveCourier }: { saveCourier: (input: CourierInput, courierId?: string) => Promise<void> }) {
  const { copy } = useI18n()
  const [name, setName] = useState('Novo motoboy')
  const [phone, setPhone] = useState('+55 11 98888-0000')
  const [vehicle, setVehicle] = useState('Honda CG 160')
  const [plate, setPlate] = useState('MOT-0B01')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveCourier({ name, phone, vehicle, plate, rating: 5, status: 'available' })
  }

  return (
    <form className="panel order-form registry-form" onSubmit={(event) => void submit(event)}>
      <PanelTitle action={copy.admin.operationalRecord} title={copy.admin.newCourierTitle} />
      <label>{copy.admin.name}<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.admin.phone}<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label>{copy.admin.vehicle}<input required value={vehicle} onChange={(event) => setVehicle(event.target.value)} /></label>
      <label>{copy.admin.plate}<input required value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} /></label>
      <p className="form-hint">{copy.admin.authInviteHint}</p>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.admin.saveCourier}</button>
    </form>
  )
}

function ClientsAdminView({ saveCustomer, search, snapshot }: { saveCustomer: (input: CustomerInput, customerId?: string) => Promise<void>; search: string; snapshot: AppSnapshot }) {
  const { copy } = useI18n()
  const visibleCustomers = snapshot.customers.filter((customer) => matchesCustomer(customer, search))
  const [selectedCustomerId, setSelectedCustomerId] = useState(snapshot.customers[0]?.id ?? '')
  const selectedCustomer = snapshot.customers.find((customer) => customer.id === selectedCustomerId) ?? snapshot.customers[0] ?? null

  return (
    <section className="registry-workbench wide">
      <CustomerForm saveCustomer={saveCustomer} />
      <div className="entity-selection-list">
        {visibleCustomers.length ? visibleCustomers.map((customer) => {
          const clientOrders = snapshot.orders.filter((order) => orderBelongsToCustomer(order, customer))
          return (
            <button className={`panel entity-card entity-card-button ${selectedCustomer?.id === customer.id ? 'selected' : ''}`} key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} type="button">
              <span className="entity-icon"><UsersRound size={18} /></span>
              <h2>{customer.name}</h2>
              <p>{customer.email}</p>
              <p>{customer.address}</p>
              <div className="detail-metrics"><span>{copy.admin.clientOrderCount(clientOrders.length)}</span><span>{copy.admin.activeCount(clientOrders.filter((order) => activeStatuses.includes(order.status)).length)}</span></div>
            </button>
          )
        }) : <EmptyBlock title={copy.filters.noResultsTitle} text={copy.filters.noResultsText} />}
      </div>
      <ClientAdminDetail customer={selectedCustomer} snapshot={snapshot} />
    </section>
  )
}

function CustomerForm({ saveCustomer }: { saveCustomer: (input: CustomerInput, customerId?: string) => Promise<void> }) {
  const { copy } = useI18n()
  const [name, setName] = useState('Novo cliente')
  const [email, setEmail] = useState('cliente.novo@motoboy.demo')
  const [phone, setPhone] = useState('+55 11 90000-0000')
  const [address, setAddress] = useState('Rua Bela Cintra, 900 - Consolacao, Sao Paulo')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveCustomer({ name, email, phone, address, active: true })
  }

  return (
    <form className="panel order-form registry-form" onSubmit={(event) => void submit(event)}>
      <PanelTitle action={copy.admin.operationalRecord} title={copy.admin.newCustomerTitle} />
      <label>{copy.admin.name}<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.admin.email}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>{copy.admin.phone}<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label>{copy.admin.address}<input required value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <p className="form-hint">{copy.admin.authInviteHint}</p>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.admin.saveCustomer}</button>
    </form>
  )
}

function ClientAdminDetail({ customer, snapshot }: { customer: Customer | null; snapshot: AppSnapshot }) {
  const { copy } = useI18n()

  if (!customer) return <EmptyBlock title={copy.admin.selectClientTitle} text={copy.admin.selectClientText} />

  const clientOrders = snapshot.orders.filter((order) => orderBelongsToCustomer(order, customer))
  const activeClientOrders = clientOrders.filter((order) => activeStatuses.includes(order.status))
  const deliveredClientOrders = clientOrders.filter((order) => order.status === 'delivered')

  return (
    <div className="panel detail-admin-panel">
      <PanelTitle action={copy.admin.clientOrderCount(clientOrders.length)} title={copy.admin.clientDetails} />
      <h2>{customer.name}</h2>
      <p>{customer.email}</p>
      <p>{customer.phone}</p>
      <p>{customer.address}</p>
      <div className="detail-metrics">
        <span>{copy.admin.activeCount(activeClientOrders.length)}</span>
        <span>{copy.admin.deliveredCount(deliveredClientOrders.length)}</span>
      </div>
      <PanelTitle action={copy.admin.ordersCount(clientOrders.length)} title={copy.admin.clientOrdersTitle} />
      {clientOrders.length ? (
        <OrderQueue orders={clientOrders} selectedOrderId="" setSelectedOrderId={() => undefined} snapshot={snapshot} />
      ) : (
        <EmptyBlock title={copy.admin.noClientOrdersTitle} text={copy.admin.noClientOrdersText} />
      )}
    </div>
  )
}

function ShopsAdminView({ saveProduct, saveShop, search, snapshot }: { saveProduct: (input: ProductInput, productId?: string) => Promise<void>; saveShop: (input: ShopInput, shopId?: string) => Promise<void>; search: string; snapshot: AppSnapshot }) {
  const { copy } = useI18n()
  const [selectedShopId, setSelectedShopId] = useState(snapshot.shops[0]?.id ?? '')
  const selectedShop = snapshot.shops.find((shop) => shop.id === selectedShopId) ?? snapshot.shops[0] ?? null
  const visibleShops = snapshot.shops.filter((shop) => matchesShop(shop, snapshot.products, search))

  return (
    <section className="admin-three-column shops-layout">
      <div className="registry-stack">
        <ShopForm saveShop={saveShop} />
        <ProductForm key={selectedShop?.id ?? 'new-product'} saveProduct={saveProduct} selectedShopId={selectedShop?.id ?? snapshot.shops[0]?.id ?? ''} shops={snapshot.shops} />
      </div>
      <div className="panel">
        <PanelTitle action={copy.admin.shopsCount(visibleShops.length)} title={copy.admin.shopsTitle} />
        <div className="entity-list">
          {visibleShops.length ? visibleShops.map((shop) => (
            <article className={`shop-row ${selectedShop?.id === shop.id ? 'selected' : ''}`} key={shop.id}>
              <button className="shop-row-main" onClick={() => setSelectedShopId(shop.id)} type="button">
                <span className="entity-icon"><Store size={17} /></span>
                <div><strong>{shop.name}</strong><small>{shop.address}</small><small>{shop.contactName} · {shop.phone}</small><small>{copy.admin.productsCount(snapshot.products.filter((product) => product.shopId === shop.id).length)}</small></div>
              </button>
              <div className="shop-row-actions">
                <button className="button-soft" onClick={() => setSelectedShopId(shop.id)} type="button">{copy.admin.openDetails}</button>
                <button className="button-soft" onClick={() => void saveShop({ ...shop, active: !shop.active }, shop.id)} type="button">{shop.active ? copy.admin.shopActive : copy.admin.shopInactive}</button>
              </div>
            </article>
          )) : <EmptyBlock title={copy.filters.noResultsTitle} text={copy.filters.noResultsText} />}
        </div>
      </div>
      <ShopAdminDetail saveProduct={saveProduct} shop={selectedShop} snapshot={snapshot} />
    </section>
  )
}

function ProductForm({ saveProduct, selectedShopId, shops }: { saveProduct: (input: ProductInput, productId?: string) => Promise<void>; selectedShopId: string; shops: Shop[] }) {
  const { copy } = useI18n()
  const [shopId, setShopId] = useState(selectedShopId)
  const [name, setName] = useState('Novo produto')
  const [category, setCategory] = useState('Geral')
  const [price, setPrice] = useState('49.90')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveProduct({ shopId, name, category, priceCents: Math.round(Number(price.replace(',', '.')) * 100), active: true })
  }

  return (
    <form className="panel order-form registry-form" onSubmit={(event) => void submit(event)}>
      <PanelTitle action={copy.admin.catalog} title={copy.admin.productFormTitle} />
      <label>{copy.admin.shop}<select required value={shopId} onChange={(event) => setShopId(event.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
      <label>{copy.admin.name}<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.admin.category}<input required value={category} onChange={(event) => setCategory(event.target.value)} /></label>
      <label>{copy.admin.price}<input min="0" required step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.admin.saveProduct}</button>
    </form>
  )
}

function ShopAdminDetail({ saveProduct, shop, snapshot }: { saveProduct: (input: ProductInput, productId?: string) => Promise<void>; shop: Shop | null; snapshot: AppSnapshot }) {
  const { copy, locale } = useI18n()

  if (!shop) return <EmptyBlock title={copy.admin.selectShopTitle} text={copy.admin.selectShopText} />

  const shopOrders = snapshot.orders.filter((order) => orderBelongsToShop(order, shop))
  const clientIds = new Set(shopOrders.map((order) => order.clientProfileId).filter(Boolean))
  const shopClients = snapshot.customers.filter((customer) => shopOrders.some((order) => orderBelongsToCustomer(order, customer)) || clientIds.has(customer.id))
  const activeShopOrders = shopOrders.filter((order) => activeStatuses.includes(order.status))
  const shopProducts = snapshot.products.filter((product) => product.shopId === shop.id)

  return (
    <div className="panel detail-admin-panel">
      <PanelTitle action={shop.active ? copy.admin.shopActive : copy.admin.shopInactive} title={copy.admin.shopDetails} />
      <h2>{shop.name}</h2>
      <p>{shop.address}</p>
      <div className="detail-metrics">
        <span>{shop.contactName}</span>
        <span>{shop.phone}</span>
        <span>{copy.admin.activeCount(activeShopOrders.length)}</span>
      </div>
      <PanelTitle action={copy.admin.productsCount(shopProducts.length)} title={copy.admin.catalogTitle} />
      {shopProducts.length ? (
        <div className="product-list">
          {shopProducts.map((product) => (
            <article className="product-row" key={product.id}>
              <div><strong>{product.name}</strong><span>{product.category} · {formatCurrency(product.priceCents, locale)}</span></div>
              <button className="button-soft" onClick={() => void saveProduct({ ...product, active: !product.active }, product.id)} type="button">{product.active ? copy.admin.productActive : copy.admin.productInactive}</button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title={copy.admin.noProductsTitle} text={copy.admin.noProductsText} />
      )}
      <PanelTitle action={copy.admin.clientOrderCount(shopClients.length)} title={copy.admin.shopClientsTitle} />
      {shopClients.length ? (
        <div className="detail-list">
          {shopClients.map((client) => <div className="small-entity-row" key={client.id}><strong>{client.name}</strong><span>{client.email}</span></div>)}
        </div>
      ) : (
        <EmptyBlock title={copy.admin.noShopClientsTitle} text={copy.admin.noShopClientsText} />
      )}
      <PanelTitle action={copy.admin.ordersCount(shopOrders.length)} title={copy.admin.shopOrdersTitle} />
      {shopOrders.length ? (
        <OrderQueue orders={shopOrders} selectedOrderId="" setSelectedOrderId={() => undefined} snapshot={snapshot} />
      ) : (
        <EmptyBlock title={copy.admin.noShopOrdersTitle} text={copy.admin.noShopOrdersText} />
      )}
    </div>
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
      <label>{copy.admin.name}<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.admin.address}<input required value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label>{copy.admin.contact}<input required value={contactName} onChange={(event) => setContactName(event.target.value)} /></label>
      <label>{copy.admin.phone}<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.admin.saveShop}</button>
    </form>
  )
}

function TeamAdminView({ saveStaffMember, search, staffMembers }: { saveStaffMember: (input: StaffMemberInput, staffMemberId?: string) => Promise<void>; search: string; staffMembers: StaffMember[] }) {
  const { copy } = useI18n()
  const visibleStaff = staffMembers.filter((staffMember) => matchesStaffMember(staffMember, search))

  return (
    <section className="registry-workbench">
      <StaffMemberForm saveStaffMember={saveStaffMember} />
      <div className="registry-list-panel panel">
        <PanelTitle action={copy.admin.staffCount(visibleStaff.length)} title={copy.admin.teamTitle} />
        <div className="cards-grid-view compact-cards">
          {visibleStaff.length ? visibleStaff.map((staffMember) => (
            <article className="entity-card registry-card" key={staffMember.id}>
              <span className="entity-icon"><ShieldCheck size={18} /></span>
              <h2>{staffMember.name}</h2>
              <p>{staffMember.email}</p>
              <p>{staffMember.phone}</p>
              <div className="detail-metrics"><span>{staffRoleLabel(staffMember.role, copy)}</span><span>{staffMember.active ? copy.admin.staffActive : copy.admin.staffInactive}</span></div>
              <button className="button-soft" onClick={() => void saveStaffMember({ ...staffMember, active: !staffMember.active }, staffMember.id)} type="button">{staffMember.active ? copy.admin.staffActive : copy.admin.staffInactive}</button>
            </article>
          )) : <EmptyBlock title={copy.filters.noResultsTitle} text={copy.filters.noResultsText} />}
        </div>
      </div>
    </section>
  )
}

function StaffMemberForm({ saveStaffMember }: { saveStaffMember: (input: StaffMemberInput, staffMemberId?: string) => Promise<void> }) {
  const { copy } = useI18n()
  const [name, setName] = useState('Novo operador')
  const [email, setEmail] = useState('operador@motoboy.demo')
  const [phone, setPhone] = useState('+55 11 97777-0000')
  const [role, setRole] = useState<StaffMember['role']>('dispatcher')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveStaffMember({ name, email, phone, role, active: true })
  }

  return (
    <form className="panel order-form registry-form" onSubmit={(event) => void submit(event)}>
      <PanelTitle action={copy.admin.operationalRecord} title={copy.admin.newStaffTitle} />
      <label>{copy.admin.name}<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{copy.admin.email}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>{copy.admin.phone}<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label>{copy.admin.role}<select value={role} onChange={(event) => setRole(event.target.value as StaffMember['role'])}><option value="admin">{copy.admin.roleAdmin}</option><option value="dispatcher">{copy.admin.roleDispatcher}</option><option value="support">{copy.admin.roleSupport}</option></select></label>
      <p className="form-hint">{copy.admin.authInviteHint}</p>
      <button className="button-primary full" type="submit"><PlusCircle size={16} /> {copy.admin.saveStaff}</button>
    </form>
  )
}

function HistoryAdminView({ events, orders, search }: { events: DeliveryEvent[]; orders: Order[]; search: string }) {
  const { copy, locale } = useI18n()
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all')
  const visibleEvents = events.filter((event) => matchesStatusFilter(event, statusFilter) && matchesHistoryEvent(event, orders, search))
  return (
    <section className="panel history-panel">
      <PanelTitle action={copy.admin.eventsCount(visibleEvents.length)} title={copy.admin.historyTitle} />
      <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      <div className="timeline-list">
        {visibleEvents.length ? visibleEvents.map((event) => {
          const order = orders.find((item) => item.id === event.orderId)
          return (
            <article className="timeline-row" key={event.id}>
              <span className={`status-pill ${event.status}`}>{statusLabel(event.status, locale)}</span>
              <div><strong>{order?.number ?? copy.courier.order} · {event.actorName}</strong><p>{copy.admin.historyMessage(statusLabel(event.status, locale))}</p></div>
              <time>{new Date(event.createdAt).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
            </article>
          )
        }) : <EmptyBlock title={copy.filters.noResultsTitle} text={copy.filters.noResultsText} />}
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
  const { copy, locale } = useI18n()
  const [tab, setTab] = useState<ClientTab>('dashboard')
  const [search, setSearch] = useState('')
  const activeShops = snapshot.shops.filter((shop) => shop.active)
  const [shopId, setShopId] = useState(activeShops[0]?.id ?? '')
  const [destinationIndex, setDestinationIndex] = useState('0')
  const [itemName, setItemName] = useState(copy.client.defaultItem)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({})
  const previousDefaultItem = useRef(copy.client.defaultItem)
  const [phone, setPhone] = useState('+55 11 90000-1001')
  const clientOrders = snapshot.orders.filter((order) => order.clientProfileId === session.id)
  const filteredClientOrders = clientOrders.filter((order) => matchesOrder(order, search))
  const selectedOrder = clientOrders.find((order) => order.id === selectedOrderId) ?? clientOrders[0] ?? null
  const canTrackSelectedOrder = selectedOrder ? canClientTrackCourier(selectedOrder) : false
  const selectedLocation = selectedOrder && canTrackSelectedOrder ? (snapshot.locations.find((location) => location.orderId === selectedOrder.id || location.courierId === selectedOrder.assignedCourierId) ?? null) : null
  const eta = selectedOrder && canTrackSelectedOrder && selectedLocation ? estimateEtaFromLocation(selectedLocation, selectedOrder.destination) : routePlan?.etaMinutes ?? selectedOrder?.etaMinutes ?? 0
  const activeClientOrders = clientOrders.filter((order) => order.status === 'queued' || activeStatuses.includes(order.status))
  const highlightedOrder = activeClientOrders[0] ?? clientOrders[0] ?? null
  const pageTitle = tab === 'dashboard' ? copy.client.dashboardTitle : tab === 'orders' ? copy.client.ordersTitle : copy.client.requestTitle
  const effectiveShopId = activeShops.some((shop) => shop.id === shopId) ? shopId : activeShops[0]?.id ?? ''
  const shopProducts = snapshot.products.filter((product) => product.active && product.shopId === effectiveShopId)
  const selectedProductIdsForShop = selectedProductIds.filter((productId) => shopProducts.some((product) => product.id === productId))
  const clientOrderIds = new Set(clientOrders.map((order) => order.id))
  const { markAllNotificationsRead, markNotificationRead, readNotificationIds } = useNotificationReadState(session.id)
  const notifications = makeNotificationItems(snapshot.events.filter((event) => clientOrderIds.has(event.orderId)), clientOrders, copy, locale, readNotificationIds)

  function openNotification(notification: NotificationItem) {
    setSelectedOrderId(notification.orderId)
    setTab('orders')
  }

  useEffect(() => {
    if (itemName === previousDefaultItem.current) setItemName(copy.client.defaultItem)
    previousDefaultItem.current = copy.client.defaultItem
  }, [copy.client.defaultItem, itemName])

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId])
  }

  function setProductQuantity(productId: string, quantity: number) {
    setProductQuantities((current) => ({ ...current, [productId]: Math.max(1, quantity) }))
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const shop = activeShops.find((item) => item.id === effectiveShopId) ?? activeShops[0]
    const destination = destinationOptions[Number(destinationIndex)] ?? destinationOptions[0]
    const selectedProducts = shopProducts.filter((product) => selectedProductIdsForShop.includes(product.id))
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
      totalCents: selectedProducts.reduce((total, product) => total + product.priceCents * (productQuantities[product.id] ?? 1), 0) || 6990,
      items: selectedProducts.length
        ? selectedProducts.map((product) => ({ name: product.name, quantity: productQuantities[product.id] ?? 1 }))
        : [{ name: itemName || copy.client.defaultItem, quantity: 1 }],
    })
    setItemName(copy.client.defaultItem)
    setTab('orders')
  }

  return (
    <main className="workspace-shell client-shell">
      <aside className="app-sidebar">
        <div className="sidebar-logo"><Navigation size={18} /> Motoboy Manager</div>
        <LanguageSwitcher compact />
        <div className="sidebar-user"><span><UserRound size={16} /></span><div><strong>{session.name}</strong><small>{copy.sidebar.clientRole}</small></div></div>
        <button className={`sidebar-new ${tab === 'newOrder' ? 'active' : ''}`} onClick={() => setTab('newOrder')} type="button"><Plus size={16} /> {copy.client.newOrder}</button>
        <nav className="sidebar-nav">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')} type="button"><LayoutDashboard size={15} /> {copy.sidebar.dashboard}</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')} type="button"><ClipboardList size={15} /> {copy.client.ordersNav}</button>
        </nav>
        <button className="sidebar-logout" onClick={logout} type="button"><LogOut size={15} /> {copy.sidebar.logout}</button>
      </aside>
      <section className="workspace-main client-main">
        <WorkspaceTopbar markAllNotificationsRead={() => markAllNotificationsRead(notifications.map((notification) => notification.id))} markNotificationRead={markNotificationRead} notifications={notifications} openNotification={openNotification} search={search} setSearch={setSearch} title={pageTitle} />
        {tab === 'dashboard' ? (
          <ClientDashboardView
            activeOrders={activeClientOrders}
            clientOrders={clientOrders}
            highlightedOrder={highlightedOrder}
            onCreateOrder={() => setTab('newOrder')}
            onViewOrders={() => setTab('orders')}
            routePlan={routePlan}
            selectedLocation={selectedLocation}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
          />
        ) : null}
        {tab === 'orders' ? (
          <ClientOrdersView
            eta={eta}
            orders={filteredClientOrders}
            routePlan={routePlan}
            selectedLocation={selectedLocation}
            selectedOrder={selectedOrder}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
          />
        ) : null}
        {tab === 'newOrder' ? (
          <ClientNewOrderView
            activeShops={activeShops}
            destinationIndex={destinationIndex}
            itemName={itemName}
            phone={phone}
            productQuantities={productQuantities}
            products={shopProducts}
            selectedProductIds={selectedProductIdsForShop}
            setDestinationIndex={setDestinationIndex}
            setItemName={setItemName}
            setPhone={setPhone}
            setProductQuantity={setProductQuantity}
            setShopId={setShopId}
            shopId={effectiveShopId}
            submitOrder={submitOrder}
            toggleProduct={toggleProduct}
          />
        ) : null}
      </section>
    </main>
  )
}

function ClientDashboardView({ activeOrders, clientOrders, highlightedOrder, onCreateOrder, onViewOrders, routePlan, selectedLocation, setSelectedOrderId, snapshot }: {
  activeOrders: Order[]
  clientOrders: Order[]
  highlightedOrder: Order | null
  onCreateOrder: () => void
  onViewOrders: () => void
  routePlan: RoutePlan | null
  selectedLocation: CourierLocation | null
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  const { copy } = useI18n()
  const queuedOrders = clientOrders.filter((order) => order.status === 'queued')
  const deliveredOrders = clientOrders.filter((order) => order.status === 'delivered')
  const recentOrders = clientOrders.slice(0, 3)

  return (
    <div className="client-dashboard-stack">
      <section className="panel client-hero-panel">
        <div>
          <span className="eyebrow"><ShoppingBag size={16} /> {copy.client.dashboardTitle}</span>
          <h2>{copy.client.dashboardSubtitle}</h2>
        </div>
        <div className="client-dashboard-actions">
          <button className="button-primary" onClick={onCreateOrder} type="button"><PlusCircle size={16} /> {copy.client.createNewOrder}</button>
          <button className="button-soft" onClick={onViewOrders} type="button"><ClipboardList size={16} /> {copy.client.viewOrders}</button>
        </div>
      </section>

      <section className="kpi-grid client-kpi-grid">
        <KpiCard icon={<ClipboardList size={16} />} label={copy.client.totalOrders} value={String(clientOrders.length)} />
        <KpiCard icon={<Gauge size={16} />} label={copy.client.activeOrders} value={String(activeOrders.length)} />
        <KpiCard icon={<Clock3 size={16} />} label={copy.client.waitingDispatch} value={String(queuedOrders.length)} tone="amber" />
        <KpiCard icon={<CheckCircle2 size={16} />} label={copy.client.deliveredOrders} value={String(deliveredOrders.length)} />
      </section>

      <section className="client-dashboard-grid">
        <div className="panel client-feature-panel">
          <PanelTitle action={copy.client.online} title={copy.client.highlightedDelivery} />
          {highlightedOrder ? (
            <ClientOrderPreview eta={highlightedOrder.etaMinutes} order={highlightedOrder} routePlan={routePlan} selectedLocation={selectedLocation} />
          ) : (
            <EmptyBlock title={copy.client.noActiveTitle} text={copy.client.noActiveText} />
          )}
        </div>
        <div className="panel client-recent-panel">
          <PanelTitle action={copy.client.viewOrders} title={copy.client.recentOrders} />
          <OrderQueue orders={recentOrders} selectedOrderId={highlightedOrder?.id ?? ''} setSelectedOrderId={(id) => { setSelectedOrderId(id); onViewOrders() }} snapshot={snapshot} />
        </div>
      </section>
    </div>
  )
}

function ClientOrdersView({ eta, orders, routePlan, selectedLocation, selectedOrder, setSelectedOrderId, snapshot }: {
  eta: number
  orders: Order[]
  routePlan: RoutePlan | null
  selectedLocation: CourierLocation | null
  selectedOrder: Order | null
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  const { copy, locale } = useI18n()
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all')
  const visibleOrders = orders.filter((order) => matchesStatusFilter(order, statusFilter))

  useEffect(() => {
    if (visibleOrders.length && !visibleOrders.some((order) => order.id === selectedOrder?.id)) {
      setSelectedOrderId(visibleOrders[0].id)
    }
  }, [selectedOrder?.id, setSelectedOrderId, visibleOrders])

  return (
    <section className="client-orders-layout">
      <div className="panel client-orders-panel">
        <PanelTitle action={copy.admin.ordersCount(visibleOrders.length)} title={copy.client.ordersTitle} />
        <p className="section-lede">{copy.client.ordersSubtitle}</p>
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <OrderQueue orders={visibleOrders} selectedOrderId={selectedOrder?.id ?? ''} setSelectedOrderId={setSelectedOrderId} snapshot={snapshot} />
      </div>
      <div className="panel client-order-detail-panel">
        {selectedOrder ? (
          <>
            <PanelTitle action={statusLabel(selectedOrder.status, locale)} title={copy.client.orderDetails} />
            <h2>{selectedOrder.number} · {selectedOrder.merchantName}</h2>
            <div className="client-address-grid">
              <Step title={copy.client.pickup} text={selectedOrder.pickupAddress} />
              <Step title={copy.client.dropoff} text={selectedOrder.destinationAddress} muted />
            </div>
            <div className="detail-metrics">
              <span>{formatCurrency(selectedOrder.totalCents, locale)}</span>
              <span>{copy.admin.itemCount(selectedOrder.items.length)}</span>
              <span>{selectedOrder.assignedCourierId ? copy.courier.eta(eta) : copy.client.awaitingAdmin}</span>
            </div>
            <div className="client-items-list">
              <strong>{copy.client.items}</strong>
              {selectedOrder.items.map((item) => <span key={item.name}>{item.quantity}x {item.name}</span>)}
            </div>
            <ClientOrderPreview eta={eta} order={selectedOrder} routePlan={routePlan} selectedLocation={selectedLocation} />
          </>
        ) : (
          <EmptyBlock title={copy.client.emptyTitle} text={copy.client.emptyText} />
        )}
      </div>
    </section>
  )
}

function ClientNewOrderView({ activeShops, destinationIndex, itemName, phone, productQuantities, products, selectedProductIds, setDestinationIndex, setItemName, setPhone, setProductQuantity, setShopId, shopId, submitOrder, toggleProduct }: {
  activeShops: Shop[]
  destinationIndex: string
  itemName: string
  phone: string
  productQuantities: Record<string, number>
  products: Product[]
  selectedProductIds: string[]
  setDestinationIndex: (value: string) => void
  setItemName: (value: string) => void
  setPhone: (value: string) => void
  setProductQuantity: (productId: string, quantity: number) => void
  setShopId: (value: string) => void
  shopId: string
  submitOrder: (event: FormEvent<HTMLFormElement>) => void
  toggleProduct: (productId: string) => void
}) {
  const { copy, locale } = useI18n()
  const selectedShop = activeShops.find((shop) => shop.id === shopId) ?? activeShops[0]
  const selectedDestination = destinationOptions[Number(destinationIndex)] ?? destinationOptions[0]
  const selectedTotal = products
    .filter((product) => selectedProductIds.includes(product.id))
    .reduce((total, product) => total + product.priceCents * (productQuantities[product.id] ?? 1), 0)

  return (
    <section className="new-order-screen">
      <div className="panel new-order-hero">
        <span className="eyebrow"><PlusCircle size={16} /> {copy.client.newOrder}</span>
        <h2>{copy.client.requestTitle}</h2>
        <p>{copy.client.requestSubtitle}</p>
        <div className="route-preview-card">
          <PanelTitle action={copy.client.online} title={copy.client.routePreview} />
          <Step title={copy.client.pickup} text={selectedShop?.address ?? copy.client.origin} />
          <Step title={copy.client.dropoff} text={selectedDestination.address} muted />
          <p>{copy.client.routePreviewText}</p>
        </div>
      </div>
      <form className="panel order-form new-order-form" onSubmit={(event) => void submitOrder(event)}>
        <PanelTitle action={copy.client.online} title={copy.client.formSection} />
        <label>{copy.client.origin}<select required value={shopId} onChange={(event) => setShopId(event.target.value)}>{activeShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
        <label>{copy.client.destination}<select required value={destinationIndex} onChange={(event) => setDestinationIndex(event.target.value)}>{destinationOptions.map((option, index) => <option key={option.address} value={index}>{option.label}</option>)}</select></label>
        <div className="product-picker">
          <div className="product-picker-head"><strong>{copy.client.products}</strong><span>{selectedTotal ? formatCurrency(selectedTotal, locale) : copy.client.noProductSelected}</span></div>
          {products.length ? products.map((product) => {
            const selected = selectedProductIds.includes(product.id)
            return (
              <article className={`product-option ${selected ? 'selected' : ''}`} key={product.id}>
                <button onClick={() => toggleProduct(product.id)} type="button">
                  <span><strong>{product.name}</strong><small>{product.category}</small></span>
                  <span>{formatCurrency(product.priceCents, locale)}</span>
                </button>
                {selected ? <label>{copy.client.quantity}<input min="1" type="number" value={productQuantities[product.id] ?? 1} onChange={(event) => setProductQuantity(product.id, Number(event.target.value) || 1)} /></label> : null}
              </article>
            )
          }) : <EmptyBlock title={copy.client.noProductsTitle} text={copy.client.noProductsText} />}
        </div>
        <label>{copy.client.notes}<input value={itemName} onChange={(event) => setItemName(event.target.value)} /></label>
        <label>{copy.client.phone}<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <button className="button-primary full" disabled={products.length > 0 && selectedProductIds.length === 0} type="submit"><PlusCircle size={16} /> {copy.client.createOrder}</button>
      </form>
    </section>
  )
}

function ClientOrderPreview({ eta, order, routePlan, selectedLocation }: { eta: number; order: Order; routePlan: RoutePlan | null; selectedLocation: CourierLocation | null }) {
  const { copy, locale } = useI18n()
  const canTrack = canClientTrackCourier(order)
  const isCompleted = order.status === 'delivered'
  const isCancelled = order.status === 'cancelled'

  return (
    <div className="client-preview">
      <span className={`status-pill ${order.status}`}>{statusLabel(order.status, locale)}</span>
      {canTrack ? (
        <MapCanvas height="320px" locale={locale} locations={selectedLocation ? [selectedLocation] : []} orders={[order]} routePlan={routePlan} selectedOrder={order} />
      ) : (
        <div className={`client-static-status ${isCompleted ? 'done' : isCancelled ? 'cancelled' : ''}`}>
          <CheckCircle2 size={22} />
          <div>
            <strong>{isCompleted ? copy.client.deliveryCompleted : isCancelled ? copy.client.deliveryCancelled : copy.client.awaitingAdmin}</strong>
            <p>{isCompleted || isCancelled ? copy.client.liveLocationHidden : copy.client.waitingDispatchText}</p>
          </div>
        </div>
      )}
      <div className="detail-metrics"><span>{getClientTrackingLabel(order, eta, copy)}</span><span>{formatCurrency(order.totalCents, locale)}</span></div>
    </div>
  )
}

function CourierMobileTop({ courier, logout }: { courier: Courier; logout: () => void }) {
  const { copy } = useI18n()

  return (
    <div className="mobile-top courier-mobile-top">
      <div className="courier-mini-profile">
        <img alt={copy.courier.photoAlt(courier.name)} className="courier-avatar mini" src={getCourierPhotoUrl(courier)} />
        <div>
          <strong>{courier.name}</strong>
          <small><Bike size={12} /> {courier.vehicle}</small>
        </div>
      </div>
      <div className="mobile-actions"><LanguageSwitcher compact /><button onClick={logout} type="button"><LogOut size={14} /></button></div>
    </div>
  )
}

function CourierPage({ applyLocation, assignOrder, changeOrderStatus, logout, markCourierStatus, routePlan, session, showNotice, snapshot }: {
  applyLocation: (location: CourierLocation) => void
  assignOrder: (order: Order, courierId: string) => void
  changeOrderStatus: (order: Order, status: DeliveryStatus, actorName: string) => void
  logout: () => void
  markCourierStatus: (courier: Courier, status: CourierStatus) => void
  routePlan: RoutePlan | null
  session: SessionUser
  showNotice: (message: string) => void
  snapshot: AppSnapshot
}) {
  const { copy, locale } = useI18n()
  const courier = snapshot.couriers.find((item) => item.profileId === session.id) ?? snapshot.couriers[0]
  const courierOrders = courier ? snapshot.orders.filter((item) => item.assignedCourierId === courier.id) : []
  const courierHistory = courierOrders.filter((item) => item.status === 'delivered' || item.status === 'cancelled')
  const order = snapshot.orders.find((item) => item.assignedCourierId === courier?.id && activeStatuses.includes(item.status)) ?? null
  const currentLocation = courier ? snapshot.locations.find((item) => item.courierId === courier.id) ?? null : null
  const [availablePosition, setAvailablePosition] = useState<CourierLocation | null>(null)
  const [positionLoading, setPositionLoading] = useState(false)
  const [selectedAvailableOrderId, setSelectedAvailableOrderId] = useState('')
  const [courierRoutePlan, setCourierRoutePlan] = useState<RoutePlan | null>(null)
  const [gpsActive, setGpsActive] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const progressRef = useRef(0)
  const watchRef = useRef<number | null>(null)
  const courierId = courier?.id ?? null
  const desiredCourierStatus: CourierStatus = order ? 'busy' : 'available'
  const proximityLocation = currentLocation ?? availablePosition
  const availableOrders = sortAvailableOrdersByDistance(snapshot.orders.filter((item) => item.status === 'queued' && !item.assignedCourierId), proximityLocation)
  const selectedAvailableOrder = availableOrders.find((item) => item.order.id === selectedAvailableOrderId)?.order ?? availableOrders[0]?.order ?? null
  const deliveryLeg = order ? isDeliveryLeg(order.status) : false
  const routeTarget = order ? (deliveryLeg ? order.destination : order.pickup) : null
  const applyCourierPresence = useEffectEvent((status: CourierStatus) => {
    if (!courier || courier.status === status) return
    markCourierStatus(courier, status)
  })
  const markOfflineRemote = useEffectEvent(() => {
    if (!courier) return
    void updateCourierStatus(courier.id, 'offline')
  })

  useEffect(() => {
    if (!courierId) return
    applyCourierPresence(desiredCourierStatus)
  }, [courierId, desiredCourierStatus])

  useEffect(() => {
    if (!courierId) return
    const handlePageHide = () => markOfflineRemote()
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      markOfflineRemote()
    }
  }, [courierId])

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

  useEffect(() => {
    if (!currentLocation || !routeTarget) return

    let cancelled = false
    void getRoutePlan({ pickup: { lat: currentLocation.lat, lng: currentLocation.lng }, destination: routeTarget }).then((plan) => {
      if (!cancelled) setCourierRoutePlan(plan)
    })

    return () => {
      cancelled = true
    }
  }, [currentLocation, routeTarget])

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

  function requestAvailablePosition() {
    if (!navigator.geolocation || !courier) {
      showNotice(copy.notice.geoUnavailable)
      return
    }

    setPositionLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: CourierLocation = {
          courierId: courier.id,
          orderId: null,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          battery: null,
          recordedAt: new Date().toISOString(),
        }
        setAvailablePosition(nextLocation)
        applyLocation(nextLocation)
        setPositionLoading(false)
      },
      () => {
        showNotice(copy.notice.geoDenied)
        setPositionLoading(false)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    )
  }

  function acceptAvailableOrder(nextOrder: Order) {
    if (!courier || courier.status === 'offline') return
    setSelectedAvailableOrderId(nextOrder.id)
    assignOrder(nextOrder, courier.id)
  }

  function stopGps() {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setGpsActive(false)
  }

  function handleLogout() {
    if (courier) markCourierStatus(courier, 'offline')
    logout()
  }

  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
  }, [])

  if (!courier) {
    return (
      <main className="courier-stage">
        <section className="courier-phone empty-courier"><div className="mobile-top"><strong>Motoboy Manager</strong><div className="mobile-actions"><LanguageSwitcher compact /><button onClick={handleLogout} type="button"><LogOut size={14} /></button></div></div><h1>{copy.courier.noActiveTitle}</h1><p>{copy.courier.noActiveText}</p></section>
      </main>
    )
  }

  if (!order) {
    return (
      <main className="courier-stage">
        <section className="courier-phone courier-marketplace-phone">
          <CourierMobileTop courier={courier} logout={handleLogout} />
          <div className="courier-driver-card">
            <img alt={copy.courier.photoAlt(courier.name)} className="courier-avatar" src={getCourierPhotoUrl(courier)} />
            <div>
              <span className="courier-status-strip"><span className="courier-dot available" /> {copy.courier.availableInApp}</span>
              <h1>{copy.courier.availableTitle}</h1>
              <p>{copy.courier.availableText}</p>
            </div>
          </div>
          <div className="location-panel">
            <div><strong>{copy.courier.locationTitle}</strong><p>{proximityLocation ? copy.courier.locationReady(formatDistanceKm(proximityLocation.accuracy ? proximityLocation.accuracy / 1000 : 0, locale)) : copy.courier.locationText}</p></div>
            <button className="button-soft" disabled={positionLoading} onClick={requestAvailablePosition} type="button"><Target size={15} /> {positionLoading ? copy.courier.locating : copy.courier.activateLocation}</button>
          </div>
          <div className="available-deliveries">
            <PanelTitle action={proximityLocation ? copy.courier.sortedByDistance : copy.courier.sortNeedsLocation} title={copy.courier.availableOrders} />
            {availableOrders.length ? (
              <div className="available-order-list">
                {availableOrders.map(({ distanceKm, order: availableOrder }) => (
                  <article className={`available-order-card ${selectedAvailableOrder?.id === availableOrder.id ? 'selected' : ''}`} key={availableOrder.id}>
                    <button className="available-order-main" onClick={() => setSelectedAvailableOrderId(availableOrder.id)} type="button">
                      <span className="available-distance">{distanceKm === null ? copy.courier.distanceUnknown : copy.courier.distanceToPickup(formatDistanceKm(distanceKm, locale))}</span>
                      <strong>{availableOrder.number} · {formatCurrency(availableOrder.totalCents, locale)}</strong>
                      <small>{shortAddress(availableOrder.pickupAddress)} → {shortAddress(availableOrder.destinationAddress)}</small>
                      <span className="available-meta"><Clock3 size={13} /> {copy.courier.eta(Math.max(availableOrder.etaMinutes, 12))}</span>
                    </button>
                    <button className="button-primary mini-accept" onClick={() => acceptAvailableOrder(availableOrder)} type="button">{copy.courier.acceptOrder}</button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyBlock title={copy.courier.noAvailableOrdersTitle} text={copy.courier.noAvailableOrdersText} />
            )}
          </div>
          <CourierHistoryList orders={courierHistory} />
        </section>
      </main>
    )
  }

  const nextStatus = getNextStatus(order.status)
  const eta = currentLocation && routeTarget ? estimateEtaFromLocation(currentLocation, routeTarget) : courierRoutePlan?.etaMinutes ?? routePlan?.etaMinutes ?? order.etaMinutes
  const activeRoutePlan = currentLocation && routeTarget ? (courierRoutePlan ?? routePlan) : routePlan

  return (
    <main className="courier-stage">
      <section className="courier-phone">
        <CourierMobileTop courier={courier} logout={handleLogout} />
        <div className="mobile-map"><MapCanvas courier={courier} height="300px" locale={locale} locations={currentLocation ? [currentLocation] : []} mode={deliveryLeg ? 'delivery' : 'pickup'} orders={[order]} routePlan={activeRoutePlan} selectedOrder={order} /></div>
        <div className="courier-route-mode"><span>{deliveryLeg ? copy.courier.deliveryMapMode : copy.courier.pickupMapMode}</span><strong>{copy.courier.liveRoute}</strong></div>
        <div className="delivery-ticket">
          <div className="delivery-ticket-main"><img alt={copy.courier.photoAlt(courier.name)} className="courier-avatar small" src={getCourierPhotoUrl(courier)} /><div><span className={`status-pill ${order.status}`}>{statusLabel(order.status, locale)}</span><strong>{copy.courier.order} {order.number}</strong><small>{copy.courier.client}: {order.customerName}</small></div></div>
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

function CourierHistoryList({ orders }: { orders: Order[] }) {
  const { copy, locale } = useI18n()
  const recentOrders = orders.slice(0, 4)

  return (
    <div className="courier-history-panel">
      <PanelTitle action={copy.courier.completedCount(orders.length)} title={copy.courier.historyTitle} />
      {recentOrders.length ? (
        <div className="detail-list">
          {recentOrders.map((order) => (
            <article className="small-entity-row courier-history-row" key={order.id}>
              <span className={`status-pill ${order.status}`}>{statusLabel(order.status, locale)}</span>
              <strong>{order.number} · {order.customerName}</strong>
              <span>{shortAddress(order.destinationAddress)} · {formatCurrency(order.totalCents, locale)}</span>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title={copy.courier.noHistoryTitle} text={copy.courier.noHistoryText} />
      )}
    </div>
  )
}

function OrderQueue({ orders, selectedOrderId, setSelectedOrderId, snapshot }: { orders: Order[]; selectedOrderId: string; setSelectedOrderId: (id: string) => void; snapshot: AppSnapshot }) {
  const { copy, locale } = useI18n()
  if (!orders.length) return <EmptyBlock title={copy.queue.emptyTitle} text={copy.queue.emptyText} />

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

function StatusFilter({ onChange, value }: { onChange: (value: OrderStatusFilter) => void; value: OrderStatusFilter }) {
  const { copy, locale } = useI18n()

  return (
    <div className="filter-bar">
      <label className="filter-field">
        <span>{copy.filters.status}</span>
        <select value={value} onChange={(event) => onChange(event.target.value as OrderStatusFilter)}>
          {statusFilterValues.map((status) => (
            <option key={status} value={status}>{status === 'all' ? copy.filters.allStatuses : statusLabel(status, locale)}</option>
          ))}
        </select>
      </label>
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

function useNotificationReadState(scopeId: string) {
  const storageKey = `motoboy-manager-notifications-read-${scopeId}`
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => readNotificationIdsFromStorage(storageKey))

  function persistReadIds(nextIds: string[]) {
    const uniqueIds = Array.from(new Set(nextIds))
    window.localStorage.setItem(storageKey, JSON.stringify(uniqueIds.slice(-120)))
    return uniqueIds
  }

  function markNotificationRead(id: string) {
    setReadNotificationIds((current) => persistReadIds([...current, id]))
  }

  function markAllNotificationsRead(ids: string[]) {
    setReadNotificationIds((current) => persistReadIds([...current, ...ids]))
  }

  return { markAllNotificationsRead, markNotificationRead, readNotificationIds }
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

function getCourierStatusAfterOrderStatus(status: DeliveryStatus): CourierStatus | null {
  if (status === 'delivered' || status === 'cancelled') return 'available'
  if (activeStatuses.includes(status)) return 'busy'
  return null
}

function isDeliveryLeg(status: DeliveryStatus) {
  return status === 'in_transit' || status === 'delayed'
}

function canClientTrackCourier(order: Order) {
  return Boolean(order.assignedCourierId && activeStatuses.includes(order.status))
}

function getClientTrackingLabel(order: Order, eta: number, copy: Copy) {
  if (canClientTrackCourier(order)) return copy.courier.eta(eta)
  if (order.status === 'delivered') return copy.client.deliveryCompleted
  if (order.status === 'cancelled') return copy.client.deliveryCancelled
  return copy.client.awaitingAdmin
}

function sortAvailableOrdersByDistance(orders: Order[], location: CourierLocation | null) {
  return orders
    .map((order) => ({
      distanceKm: location ? haversineKm(location, order.pickup) : null,
      order,
    }))
    .sort((left, right) => {
      if (left.distanceKm === null && right.distanceKm === null) {
        return new Date(left.order.createdAt).getTime() - new Date(right.order.createdAt).getTime()
      }

      if (left.distanceKm === null) return 1
      if (right.distanceKm === null) return -1

      return left.distanceKm - right.distanceKm
    })
}

function sortOrdersByPriority(orders: Order[]) {
  const priority: Record<DeliveryStatus, number> = {
    delayed: 0,
    queued: 1,
    assigned: 2,
    pickup: 3,
    in_transit: 4,
    delivered: 5,
    cancelled: 6,
  }

  return [...orders].sort((left, right) => {
    const statusDelta = priority[left.status] - priority[right.status]
    if (statusDelta !== 0) return statusDelta

    return new Date(left.promisedAt).getTime() - new Date(right.promisedAt).getTime()
  })
}

function formatDistanceKm(distanceKm: number, locale: Locale) {
  if (distanceKm < 1) return `${Math.max(20, Math.round(distanceKm * 1000))} m`

  return `${new Intl.NumberFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 1 }).format(distanceKm)} km`
}

function getCourierPhotoUrl(courier: Courier) {
  return `/assets/couriers/${courier.id}.svg`
}

function makeNotificationItems(events: DeliveryEvent[], orders: Order[], copy: Copy, locale: Locale, readNotificationIds: string[] = []): NotificationItem[] {
  return events.slice(0, 8).map((event) => {
    const order = orders.find((item) => item.id === event.orderId)
    const status = statusLabel(event.status, locale)

    return {
      id: event.id,
      orderId: event.orderId,
      read: readNotificationIds.includes(event.id),
      title: order ? copy.topbar.notificationTitle(order.number, status) : status,
      description: copy.topbar.notificationDescription(event.actorName, status),
      time: new Date(event.createdAt).toLocaleString(locale, { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit' }),
    }
  })
}

function readNotificationIdsFromStorage(storageKey: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function orderBelongsToShop(order: Order, shop: Shop) {
  return normalizeText(order.merchantName) === normalizeText(shop.name) || normalizeText(order.pickupAddress) === normalizeText(shop.address)
}

function orderBelongsToCustomer(order: Order, customer: Customer) {
  return normalizeText(order.customerName) === normalizeText(customer.name)
    || normalizeText(order.customerPhone) === normalizeText(customer.phone)
    || normalizeText(order.destinationAddress) === normalizeText(customer.address)
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function includesSearch(values: Array<string | number | null | undefined>, search: string) {
  const query = normalizeText(search)
  if (!query) return true

  return values.some((value) => normalizeText(String(value ?? '')).includes(query))
}

function matchesStatusFilter(item: { status: DeliveryStatus }, statusFilter: OrderStatusFilter) {
  return statusFilter === 'all' || item.status === statusFilter
}

function matchesOrder(order: Order, search: string) {
  return includesSearch([
    order.number,
    order.customerName,
    order.customerPhone,
    order.merchantName,
    order.pickupAddress,
    order.destinationAddress,
    order.items.map((item) => item.name).join(' '),
  ], search)
}

function matchesCourier(courier: Courier, search: string) {
  return includesSearch([courier.name, courier.phone, courier.vehicle, courier.plate, courier.status], search)
}

function matchesCustomer(customer: Customer, search: string) {
  return includesSearch([customer.name, customer.email, customer.phone, customer.address, customer.active ? 'active ativo' : 'inactive inativo'], search)
}

function matchesStaffMember(staffMember: StaffMember, search: string) {
  return includesSearch([staffMember.name, staffMember.email, staffMember.phone, staffMember.role, staffMember.active ? 'active ativo' : 'inactive inativo'], search)
}

function matchesShop(shop: Shop, products: Product[], search: string) {
  const shopProducts = products.filter((product) => product.shopId === shop.id)
  return includesSearch([shop.name, shop.address, shop.contactName, shop.phone, shop.active ? 'active ativa' : 'inactive inativa', shopProducts.map((product) => `${product.name} ${product.category}`).join(' ')], search)
}

function matchesHistoryEvent(event: DeliveryEvent, orders: Order[], search: string) {
  const order = orders.find((item) => item.id === event.orderId)
  return includesSearch([
    event.actorName,
    event.message,
    event.status,
    order?.number,
    order?.customerName,
    order?.merchantName,
    order?.destinationAddress,
  ], search)
}

function shortAddress(address: string) {
  return address.split(',').slice(0, 2).join(',')
}

function staffRoleLabel(role: StaffMember['role'], copy: Copy) {
  if (role === 'admin') return copy.admin.roleAdmin
  if (role === 'support') return copy.admin.roleSupport
  return copy.admin.roleDispatcher
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
