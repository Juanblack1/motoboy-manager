import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bike,
  Clock3,
  Copy,
  ExternalLink,
  Gauge,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'

import { MapCanvas } from './components/MapCanvas'
import { demoSnapshot } from './lib/demo-data'
import { estimateEtaFromLocation, formatCurrency, getRoutePlan, interpolatePoint, statusLabel } from './lib/geo'
import {
  loadPublicTracking,
  loadSnapshot,
  signInWithDemoRole,
  signOut,
  subscribeToOperations,
  unsubscribe,
  updateOrderStatus,
  upsertLocation,
} from './lib/repository'
import { hasSupabaseConfig } from './lib/supabase'
import type { AppSnapshot, CourierLocation, DeliveryStatus, Order, PublicTracking, Role, RoutePlan, SessionUser } from './types'

type RouteState =
  | { name: 'home' }
  | { name: 'admin' }
  | { name: 'courier' }
  | { name: 'track'; code: string }

const activeStatuses: DeliveryStatus[] = ['assigned', 'pickup', 'in_transit', 'delayed']

function App() {
  const [route, setRoute] = useState<RouteState>(readRoute())
  const [session, setSession] = useState<SessionUser | null>(null)
  const [snapshot, setSnapshot] = useState<AppSnapshot>(demoSnapshot)
  const [selectedOrderId, setSelectedOrderId] = useState(demoSnapshot.orders[0]?.id ?? '')
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [tracking, setTracking] = useState<PublicTracking | null>(null)
  const [trackingLoading, setTrackingLoading] = useState(false)

  const selectedOrder = snapshot.orders.find((order) => order.id === selectedOrderId) ?? snapshot.orders[0] ?? null
  const routeOrder = route.name === 'track' ? tracking?.order ?? null : selectedOrder

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
    if (route.name !== 'track') return

    let cancelled = false
    const load = async () => {
      setTrackingLoading(true)
      try {
        const payload = await loadPublicTracking(route.code)
        if (!cancelled) setTracking(payload)
      } catch (error) {
        showNotice(error instanceof Error ? error.message : 'Nao foi possivel carregar o rastreamento.')
      } finally {
        if (!cancelled) setTrackingLoading(false)
      }
    }

    void load()
    const interval = window.setInterval(() => void load(), 12000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [route])

  useEffect(() => {
    if (!routeOrder) return

    let cancelled = false
    void getRoutePlan(routeOrder).then((plan) => {
      if (!cancelled) setRoutePlan(plan)
    })

    return () => {
      cancelled = true
    }
  }, [routeOrder])

  function navigate(path: string) {
    window.history.pushState({}, '', path)
    setRoute(readRoute())
  }

  async function login(role: Role) {
    setLoading(true)
    try {
      const user = await signInWithDemoRole(role)
      setSession(user)
      navigate(role === 'admin' ? '/admin' : '/motoboy')
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

  function applyLocation(location: CourierLocation) {
    setSnapshot((current) => ({
      ...current,
      locations: [
        ...current.locations.filter((item) => item.courierId !== location.courierId),
        location,
      ],
    }))

    if (tracking?.order.id === location.orderId) {
      setTracking((current) => (current ? { ...current, location } : current))
    }

    void upsertLocation(location).catch((error) => {
      showNotice(error instanceof Error ? error.message : 'Falha ao enviar localizacao.')
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

  return (
    <div className="app-shell">
      <Header route={route} session={session} navigate={navigate} logout={logout} />
      {notice ? <div className="toast" role="status">{notice}</div> : null}

      {route.name === 'home' ? (
        <HomePage loading={loading} login={login} navigate={navigate} snapshot={snapshot} />
      ) : null}

      {route.name === 'admin' ? (
        session?.role === 'admin' ? (
          <AdminPage
            routePlan={routePlan}
            selectedOrder={selectedOrder}
            selectedOrderId={selectedOrderId}
            setSelectedOrderId={setSelectedOrderId}
            showNotice={showNotice}
            snapshot={snapshot}
          />
        ) : (
          <LoginGate loading={loading} login={login} role="admin" />
        )
      ) : null}

      {route.name === 'courier' ? (
        session?.role === 'courier' ? (
          <CourierPage
            applyLocation={applyLocation}
            changeOrderStatus={changeOrderStatus}
            routePlan={routePlan}
            session={session}
            showNotice={showNotice}
            snapshot={snapshot}
          />
        ) : (
          <LoginGate loading={loading} login={login} role="courier" />
        )
      ) : null}

      {route.name === 'track' ? (
        <TrackingPage loading={trackingLoading} routePlan={routePlan} tracking={tracking} />
      ) : null}
    </div>
  )
}

function Header({ route, session, navigate, logout }: {
  route: RouteState
  session: SessionUser | null
  navigate: (path: string) => void
  logout: () => void
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate('/')} type="button">
        <span className="brand-mark"><Navigation size={20} /></span>
        <span>
          <strong>Motoboy Manager</strong>
          <small>{hasSupabaseConfig ? 'Supabase realtime' : 'Modo demo local'}</small>
        </span>
      </button>
      <nav className="nav-links" aria-label="Principal">
        <button className={route.name === 'admin' ? 'active' : ''} onClick={() => navigate('/admin')} type="button">Admin</button>
        <button className={route.name === 'courier' ? 'active' : ''} onClick={() => navigate('/motoboy')} type="button">Motoboy</button>
        <button className={route.name === 'track' ? 'active' : ''} onClick={() => navigate('/r/SP-8K2M')} type="button">Rastreio</button>
      </nav>
      {session ? (
        <button className="ghost-button" onClick={logout} type="button">
          <LogOut size={16} /> Sair
        </button>
      ) : null}
    </header>
  )
}

function HomePage({ loading, login, navigate, snapshot }: {
  loading: boolean
  login: (role: Role) => void
  navigate: (path: string) => void
  snapshot: AppSnapshot
}) {
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status)).length
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline').length

  return (
    <main className="home-grid">
      <section className="hero-card">
        <div className="eyebrow"><Radio size={16} /> Operacao em tempo real</div>
        <h1>Controle entregas, motoboys e rastreamento em uma unica central.</h1>
        <p>
          Painel admin, link do motoboy, rastreio publico e mapa com previsao de chegada. Feito para demo publica com Supabase, Vercel e dados de teste seguros.
        </p>
        <div className="hero-actions">
          <button className="primary-button" disabled={loading} onClick={() => login('admin')} type="button">
            <ShieldCheck size={18} /> Entrar como admin
          </button>
          <button className="secondary-button" disabled={loading} onClick={() => login('courier')} type="button">
            <Smartphone size={18} /> Entrar como motoboy
          </button>
        </div>
      </section>

      <aside className="launch-panel">
        <div className="metric-card dark">
          <span>Pedidos ativos</span>
          <strong>{activeOrders}</strong>
        </div>
        <div className="metric-card">
          <span>Motoboys online</span>
          <strong>{onlineCouriers}</strong>
        </div>
        <div className="quick-links">
          <button onClick={() => navigate('/admin')} type="button"><ExternalLink size={16} /> Link admin</button>
          <button onClick={() => navigate('/motoboy')} type="button"><ExternalLink size={16} /> Link motoboy</button>
          <button onClick={() => navigate('/r/SP-8K2M')} type="button"><ExternalLink size={16} /> Link cliente</button>
        </div>
      </aside>
    </main>
  )
}

function LoginGate({ loading, login, role }: { loading: boolean; login: (role: Role) => void; role: Role }) {
  return (
    <main className="login-gate">
      <div className="login-card">
        <div className="eyebrow"><UserRound size={16} /> Acesso {role === 'admin' ? 'admin' : 'motoboy'}</div>
        <h1>{role === 'admin' ? 'Painel administrativo' : 'Link do motoboy'}</h1>
        <p>Use as credenciais de demo configuradas no seed ou rode sem Supabase em modo local.</p>
        <button className="primary-button" disabled={loading} onClick={() => login(role)} type="button">
          Entrar como {role === 'admin' ? 'admin' : 'motoboy'} de teste
        </button>
      </div>
    </main>
  )
}

function AdminPage({ routePlan, selectedOrder, selectedOrderId, setSelectedOrderId, showNotice, snapshot }: {
  routePlan: RoutePlan | null
  selectedOrder: Order | null
  selectedOrderId: string
  setSelectedOrderId: (id: string) => void
  showNotice: (message: string) => void
  snapshot: AppSnapshot
}) {
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status))
  const deliveredToday = snapshot.orders.filter((order) => order.status === 'delivered').length
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline').length
  const selectedLocation = selectedOrder
    ? snapshot.locations.find((location) => location.orderId === selectedOrder.id || location.courierId === selectedOrder.assignedCourierId)
    : null
  const eta = selectedOrder && selectedLocation
    ? estimateEtaFromLocation({ lat: selectedLocation.lat, lng: selectedLocation.lng }, selectedOrder.destination)
    : routePlan?.etaMinutes ?? selectedOrder?.etaMinutes ?? 0

  async function copyTrackingLink(order: Order) {
    const url = `${window.location.origin}/r/${order.publicCode}`
    await navigator.clipboard.writeText(url)
    showNotice('Link de rastreamento copiado.')
  }

  return (
    <main className="dashboard-grid">
      <section className="operation-column">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><Gauge size={16} /> Central de despacho</span>
            <h1>Pedidos a caminho</h1>
          </div>
          <button className="ghost-button" onClick={() => window.location.reload()} type="button"><RefreshCw size={16} /> Atualizar</button>
        </div>

        <div className="stats-row">
          <StatCard icon={<PackageCheck size={18} />} label="Ativos" value={String(activeOrders.length)} />
          <StatCard icon={<Bike size={18} />} label="Online" value={String(onlineCouriers)} />
          <StatCard icon={<Clock3 size={18} />} label="Entregues" value={String(deliveredToday)} />
        </div>

        <div className="orders-list">
          {snapshot.orders.map((order) => {
            const courier = snapshot.couriers.find((item) => item.id === order.assignedCourierId)
            return (
              <button
                className={`order-card ${selectedOrderId === order.id ? 'selected' : ''}`}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                type="button"
              >
                <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                <strong>{order.number} - {order.customerName}</strong>
                <small>{order.merchantName}</small>
                <span className="order-meta">
                  <MapPin size={14} /> {courier?.name ?? 'Sem motoboy'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="map-column">
        <MapCanvas
          locations={snapshot.locations}
          orders={snapshot.orders}
          routePlan={routePlan}
          selectedOrder={selectedOrder}
        />

        {selectedOrder ? (
          <div className="detail-panel">
            <div>
              <span className={`status-pill ${selectedOrder.status}`}>{statusLabel(selectedOrder.status)}</span>
              <h2>{selectedOrder.number} para {selectedOrder.customerName}</h2>
              <p>{selectedOrder.destinationAddress}</p>
            </div>
            <div className="detail-metrics">
              <span><Clock3 size={16} /> ETA {eta} min</span>
              <span><Navigation size={16} /> {(routePlan?.distanceKm ?? selectedOrder.distanceKm).toFixed(1)} km</span>
              <span>{formatCurrency(selectedOrder.totalCents)}</span>
            </div>
            <button className="secondary-button" onClick={() => void copyTrackingLink(selectedOrder)} type="button">
              <Copy size={16} /> Copiar link publico
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function CourierPage({ applyLocation, changeOrderStatus, routePlan, session, showNotice, snapshot }: {
  applyLocation: (location: CourierLocation) => void
  changeOrderStatus: (order: Order, status: DeliveryStatus, actorName: string) => void
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
      applyLocation({
        courierId: courier.id,
        orderId: order.id,
        lat: point.lat,
        lng: point.lng,
        accuracy: 8,
        speed: 9,
        heading: null,
        battery: 0.76,
        recordedAt: new Date().toISOString(),
      })

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
      (position) => {
        applyLocation({
          courierId: courier.id,
          orderId: order.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          battery: null,
          recordedAt: new Date().toISOString(),
        })
      },
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

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [])

  if (!courier || !order) {
    return (
      <main className="courier-layout">
        <section className="phone-card empty-state">
          <span className="eyebrow"><Bike size={16} /> Motoboy</span>
          <h1>Nenhuma entrega ativa</h1>
          <p>Quando o admin atribuir um pedido, ele aparece aqui com rota e botoes de status.</p>
        </section>
      </main>
    )
  }

  const nextStatus = getNextStatus(order.status)
  const eta = currentLocation ? estimateEtaFromLocation(currentLocation, order.destination) : routePlan?.etaMinutes ?? order.etaMinutes

  return (
    <main className="courier-layout">
      <section className="phone-card">
        <div className="courier-hero">
          <span className="eyebrow"><Bike size={16} /> Link do motoboy</span>
          <h1>{order.number}</h1>
          <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
        </div>

        <div className="delivery-card">
          <strong>{order.customerName}</strong>
          <p>{order.destinationAddress}</p>
          <div className="detail-metrics compact">
            <span><Clock3 size={16} /> {eta} min</span>
            <span><Navigation size={16} /> {(routePlan?.distanceKm ?? order.distanceKm).toFixed(1)} km</span>
          </div>
        </div>

        <MapCanvas
          height="320px"
          locations={currentLocation ? [currentLocation] : []}
          orders={[order]}
          routePlan={routePlan}
          selectedOrder={order}
        />

        <div className="action-stack">
          {nextStatus ? (
            <button className="primary-button full" onClick={() => changeOrderStatus(order, nextStatus, courier.name)} type="button">
              <PackageCheck size={18} /> {nextStatusLabel(nextStatus)}
            </button>
          ) : null}
          <button className="secondary-button full" onClick={gpsActive ? stopGps : startGps} type="button">
            <Radio size={18} /> {gpsActive ? 'Parar GPS real' : 'Ativar GPS real'}
          </button>
          <button className="ghost-button full" onClick={() => setSimulating((current) => !current)} type="button">
            <Play size={18} /> {simulating ? 'Parar simulacao' : 'Simular rota demo'}
          </button>
        </div>
      </section>
    </main>
  )
}

function TrackingPage({ loading, routePlan, tracking }: {
  loading: boolean
  routePlan: RoutePlan | null
  tracking: PublicTracking | null
}) {
  if (loading) {
    return <main className="tracking-page"><div className="tracking-card"><h1>Carregando rastreamento...</h1></div></main>
  }

  if (!tracking) {
    return <main className="tracking-page"><div className="tracking-card"><h1>Pedido nao encontrado</h1><p>Confira o codigo do link de rastreamento.</p></div></main>
  }

  const eta = tracking.location
    ? estimateEtaFromLocation(tracking.location, tracking.order.destination)
    : routePlan?.etaMinutes ?? tracking.order.etaMinutes

  return (
    <main className="tracking-page">
      <section className="tracking-card">
        <span className="eyebrow"><MapPin size={16} /> Rastreamento publico</span>
        <h1>{tracking.order.status === 'delivered' ? 'Pedido entregue' : `Chega em cerca de ${eta} min`}</h1>
        <p>{tracking.order.merchantName} para {tracking.order.customerName}</p>
        <div className="detail-metrics">
          <span className={`status-pill ${tracking.order.status}`}>{statusLabel(tracking.order.status)}</span>
          <span>{tracking.courier?.name ?? 'Aguardando motoboy'}</span>
          <span>{tracking.order.publicCode}</span>
        </div>
      </section>

      <MapCanvas
        height="560px"
        locations={tracking.location ? [tracking.location] : []}
        orders={[tracking.order]}
        routePlan={routePlan}
        selectedOrder={tracking.order}
      />
    </main>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  )
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

function readRoute(): RouteState {
  const pathname = window.location.pathname
  if (pathname.startsWith('/admin')) return { name: 'admin' }
  if (pathname.startsWith('/motoboy')) return { name: 'courier' }
  if (pathname.startsWith('/r/')) return { name: 'track', code: decodeURIComponent(pathname.replace('/r/', '')) }
  return { name: 'home' }
}

export default App
