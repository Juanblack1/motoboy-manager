import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Bike,
  Clock3,
  Gauge,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  Play,
  PlusCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  UserRound,
} from 'lucide-react'

import { MapCanvas } from './components/MapCanvas'
import { demoSnapshot } from './lib/demo-data'
import { estimateEtaFromLocation, formatCurrency, getRoutePlan, interpolatePoint, statusLabel } from './lib/geo'
import {
  assignOrderToCourier,
  createClientOrder,
  loadSnapshot,
  signInWithDemoRole,
  signOut,
  subscribeToOperations,
  unsubscribe,
  updateOrderStatus,
  upsertLocation,
  type CreateOrderInput,
} from './lib/repository'
import { hasSupabaseConfig } from './lib/supabase'
import type { AppSnapshot, CourierLocation, DeliveryEvent, DeliveryStatus, Order, Role, RoutePlan, SessionUser } from './types'

type RouteState =
  | { name: 'home' }
  | { name: 'admin' }
  | { name: 'client' }
  | { name: 'courier' }

const activeStatuses: DeliveryStatus[] = ['assigned', 'pickup', 'in_transit', 'delayed']

const pickupOptions = [
  {
    name: 'Bistro Avenida',
    address: 'Av. Paulista, 1578 - Bela Vista, Sao Paulo',
    point: { lat: -23.561684, lng: -46.655981 },
  },
  {
    name: 'Mercado Central Express',
    address: 'Rua Augusta, 1600 - Consolacao, Sao Paulo',
    point: { lat: -23.555421, lng: -46.662089 },
  },
  {
    name: 'Farmacia Jardins',
    address: 'Alameda Santos, 980 - Jardim Paulista, Sao Paulo',
    point: { lat: -23.566076, lng: -46.656292 },
  },
]

const destinationOptions = [
  {
    label: 'Rua Oscar Freire, 620 - Jardins',
    address: 'Rua Oscar Freire, 620 - Jardins, Sao Paulo',
    point: { lat: -23.561325, lng: -46.669402 },
  },
  {
    label: 'Rua Frei Caneca, 720 - Consolacao',
    address: 'Rua Frei Caneca, 720 - Consolacao, Sao Paulo',
    point: { lat: -23.553379, lng: -46.651782 },
  },
  {
    label: 'Rua Pamplona, 1005 - Jardim Paulista',
    address: 'Rua Pamplona, 1005 - Jardim Paulista, Sao Paulo',
    point: { lat: -23.568295, lng: -46.661425 },
  },
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
            assignOrder={assignOrder}
            routePlan={routePlan}
            selectedOrder={selectedOrder}
            selectedOrderId={selectedOrderId}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
          />
        ) : (
          <LoginGate loading={loading} login={login} role="admin" />
        )
      ) : null}

      {route.name === 'client' ? (
        session?.role === 'client' ? (
          <ClientPage
            createOrder={createOrder}
            routePlan={routePlan}
            selectedOrderId={selectedOrderId}
            session={session}
            setSelectedOrderId={setSelectedOrderId}
            snapshot={snapshot}
          />
        ) : (
          <LoginGate loading={loading} login={login} role="client" />
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
        <button className={route.name === 'client' ? 'active' : ''} onClick={() => navigate('/cliente')} type="button">Cliente</button>
        <button className={route.name === 'courier' ? 'active' : ''} onClick={() => navigate('/motoboy')} type="button">Motoboy</button>
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
        <div className="eyebrow"><Radio size={16} /> Operacao autenticada</div>
        <h1>Cliente pede, admin despacha, motoboy entrega com GPS.</h1>
        <p>
          Tres areas protegidas para simular o fluxo real: o cliente cria pedidos, o admin acompanha e atribui entregas, e o motoboy executa a rota com localizacao em tempo real.
        </p>
        <div className="hero-actions">
          <button className="primary-button" disabled={loading} onClick={() => login('admin')} type="button">
            <ShieldCheck size={18} /> Entrar como admin
          </button>
          <button className="secondary-button" disabled={loading} onClick={() => login('client')} type="button">
            <ShoppingBag size={18} /> Entrar como cliente
          </button>
          <button className="ghost-button" disabled={loading} onClick={() => login('courier')} type="button">
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
          <button onClick={() => navigate('/admin')} type="button"><ShieldCheck size={16} /> Area admin</button>
          <button onClick={() => navigate('/cliente')} type="button"><ShoppingBag size={16} /> Area cliente</button>
          <button onClick={() => navigate('/motoboy')} type="button"><Bike size={16} /> Area motoboy</button>
        </div>
      </aside>
    </main>
  )
}

function LoginGate({ loading, login, role }: { loading: boolean; login: (role: Role) => void; role: Role }) {
  const labels: Record<Role, { eyebrow: string; title: string; action: string }> = {
    admin: { eyebrow: 'Acesso admin', title: 'Painel administrativo', action: 'Entrar como admin de teste' },
    client: { eyebrow: 'Acesso cliente', title: 'Area do cliente', action: 'Entrar como cliente de teste' },
    courier: { eyebrow: 'Acesso motoboy', title: 'Link do motoboy', action: 'Entrar como motoboy de teste' },
  }

  return (
    <main className="login-gate">
      <div className="login-card">
        <div className="eyebrow"><UserRound size={16} /> {labels[role].eyebrow}</div>
        <h1>{labels[role].title}</h1>
        <p>Use as credenciais de demo configuradas no seed ou rode sem Supabase em modo local.</p>
        <button className="primary-button" disabled={loading} onClick={() => login(role)} type="button">
          {labels[role].action}
        </button>
      </div>
    </main>
  )
}

function AdminPage({ assignOrder, routePlan, selectedOrder, selectedOrderId, setSelectedOrderId, snapshot }: {
  assignOrder: (order: Order, courierId: string) => void
  routePlan: RoutePlan | null
  selectedOrder: Order | null
  selectedOrderId: string
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  const activeOrders = snapshot.orders.filter((order) => activeStatuses.includes(order.status))
  const deliveredToday = snapshot.orders.filter((order) => order.status === 'delivered').length
  const onlineCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline').length
  const candidateCouriers = snapshot.couriers.filter((courier) => courier.status !== 'offline')
  const selectedLocation = selectedOrder
    ? snapshot.locations.find((location) => location.orderId === selectedOrder.id || location.courierId === selectedOrder.assignedCourierId)
    : null
  const eta = selectedOrder && selectedLocation
    ? estimateEtaFromLocation({ lat: selectedLocation.lat, lng: selectedLocation.lng }, selectedOrder.destination)
    : routePlan?.etaMinutes ?? selectedOrder?.etaMinutes ?? 0

  return (
    <main className="dashboard-grid">
      <section className="operation-column">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><Gauge size={16} /> Central de despacho</span>
            <h1>Pedidos da operacao</h1>
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
                  <MapPin size={14} /> {courier?.name ?? 'Aguardando despacho'}
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
            {selectedOrder.assignedCourierId ? null : (
              <div className="assignment-panel">
                {candidateCouriers.map((courier) => (
                  <button className="secondary-button" key={courier.id} onClick={() => assignOrder(selectedOrder, courier.id)} type="button">
                    <Bike size={16} /> Atribuir {courier.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  )
}

function ClientPage({ createOrder, routePlan, selectedOrderId, session, setSelectedOrderId, snapshot }: {
  createOrder: (input: CreateOrderInput) => Promise<void>
  routePlan: RoutePlan | null
  selectedOrderId: string
  session: SessionUser
  setSelectedOrderId: (id: string) => void
  snapshot: AppSnapshot
}) {
  const [merchantIndex, setMerchantIndex] = useState('0')
  const [destinationIndex, setDestinationIndex] = useState('0')
  const [itemName, setItemName] = useState('Pedido de teste')
  const [phone, setPhone] = useState('+55 11 90000-1001')
  const clientOrders = snapshot.orders.filter((order) => order.clientProfileId === session.id)
  const selectedOrder = clientOrders.find((order) => order.id === selectedOrderId) ?? clientOrders[0] ?? null
  const selectedLocation = selectedOrder
    ? snapshot.locations.find((location) => location.orderId === selectedOrder.id || location.courierId === selectedOrder.assignedCourierId)
    : null
  const eta = selectedOrder && selectedLocation
    ? estimateEtaFromLocation(selectedLocation, selectedOrder.destination)
    : routePlan?.etaMinutes ?? selectedOrder?.etaMinutes ?? 0

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const pickup = pickupOptions[Number(merchantIndex)] ?? pickupOptions[0]
    const destination = destinationOptions[Number(destinationIndex)] ?? destinationOptions[0]
    await createOrder({
      clientProfileId: session.id,
      customerName: session.name,
      customerPhone: phone,
      merchantName: pickup.name,
      pickupAddress: pickup.address,
      destinationAddress: destination.address,
      pickup: pickup.point,
      destination: destination.point,
      totalCents: 6990,
      items: [{ name: itemName || 'Pedido de teste', quantity: 1 }],
    })
    setItemName('Pedido de teste')
  }

  return (
    <main className="client-grid">
      <section className="client-panel">
        <span className="eyebrow"><ShoppingBag size={16} /> Area do cliente</span>
        <h1>Fazer novo pedido</h1>
        <form className="order-form" onSubmit={(event) => void submitOrder(event)}>
          <label>
            Loja
            <select value={merchantIndex} onChange={(event) => setMerchantIndex(event.target.value)}>
              {pickupOptions.map((option, index) => <option key={option.name} value={index}>{option.name}</option>)}
            </select>
          </label>
          <label>
            Entregar em
            <select value={destinationIndex} onChange={(event) => setDestinationIndex(event.target.value)}>
              {destinationOptions.map((option, index) => <option key={option.address} value={index}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Item
            <input value={itemName} onChange={(event) => setItemName(event.target.value)} />
          </label>
          <label>
            Celular do cliente
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <button className="primary-button full" type="submit"><PlusCircle size={18} /> Criar pedido</button>
        </form>
      </section>

      <section className="client-panel client-orders">
        <div className="section-heading compact-heading">
          <div>
            <span className="eyebrow"><PackageCheck size={16} /> Meus pedidos</span>
            <h1>Status</h1>
          </div>
        </div>
        <div className="orders-list">
          {clientOrders.map((order) => {
            const courier = snapshot.couriers.find((item) => item.id === order.assignedCourierId)
            return (
              <button
                className={`order-card ${selectedOrder?.id === order.id ? 'selected' : ''}`}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                type="button"
              >
                <span className={`status-pill ${order.status}`}>{statusLabel(order.status)}</span>
                <strong>{order.number} - {order.merchantName}</strong>
                <small>{order.destinationAddress}</small>
                <span className="order-meta"><Bike size={14} /> {courier?.name ?? 'Admin ainda vai despachar'}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="client-map-panel">
        {selectedOrder ? (
          <>
            <MapCanvas
              height="520px"
              locations={selectedLocation ? [selectedLocation] : []}
              orders={[selectedOrder]}
              routePlan={routePlan}
              selectedOrder={selectedOrder}
            />
            <div className="detail-panel client-detail-panel">
              <div>
                <span className={`status-pill ${selectedOrder.status}`}>{statusLabel(selectedOrder.status)}</span>
                <h2>{selectedOrder.number} - {selectedOrder.merchantName}</h2>
                <p>{selectedOrder.destinationAddress}</p>
              </div>
              <div className="detail-metrics">
                <span><Clock3 size={16} /> {selectedOrder.assignedCourierId ? `ETA ${eta} min` : 'Aguardando admin'}</span>
                <span>{formatCurrency(selectedOrder.totalCents)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-map-state">
            <h2>Nenhum pedido ainda</h2>
            <p>Crie um pedido para acompanhar o despacho, status e rota aqui.</p>
          </div>
        )}
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
  if (pathname.startsWith('/cliente') || pathname.startsWith('/client')) return { name: 'client' }
  if (pathname.startsWith('/motoboy')) return { name: 'courier' }
  return { name: 'home' }
}

export default App
