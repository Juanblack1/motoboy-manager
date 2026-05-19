import type { RealtimeChannel } from '@supabase/supabase-js'

import { demoProfiles, demoShops, demoSnapshot } from './demo-data'
import { appCredentials, hasSupabaseConfig, supabase } from './supabase'
import type {
  AppSnapshot,
  Courier,
  CourierStatus,
  CourierLocation,
  DeliveryEvent,
  DeliveryStatus,
  Order,
  Profile,
  Role,
  SessionUser,
  Shop,
} from '../types'

type ProfileRow = {
  id: string
  name: string
  email: string
  role: Role
}

type OrderRow = {
  id: string
  number: string
  public_code: string
  customer_name: string
  customer_phone: string
  client_profile_id: string | null
  merchant_name: string
  pickup_address: string
  destination_address: string
  pickup_lat: number
  pickup_lng: number
  destination_lat: number
  destination_lng: number
  status: DeliveryStatus
  assigned_courier_id: string | null
  total_cents: number
  created_at: string
  promised_at: string
  eta_minutes: number
  distance_km: number
  items: Array<{ name: string; quantity: number }>
}

type CourierRow = {
  id: string
  profile_id: string
  name: string
  phone: string
  vehicle: string
  plate: string
  rating: number
  status: Courier['status']
}

type ShopRow = {
  id: string
  name: string
  address: string
  contact_name: string
  phone: string
  lat: number
  lng: number
  active: boolean
  created_at: string
}

type LocationRow = {
  courier_id: string
  order_id: string | null
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  battery: number | null
  recorded_at: string
}

type EventRow = {
  id: string
  order_id: string
  actor_name: string
  status: DeliveryStatus
  message: string
  created_at: string
}

export type CreateOrderInput = {
  clientProfileId: string
  customerName: string
  customerPhone: string
  merchantName: string
  pickupAddress: string
  destinationAddress: string
  pickup: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  totalCents: number
  items: Array<{ name: string; quantity: number }>
}

export type ShopInput = {
  name: string
  address: string
  contactName: string
  phone: string
  lat: number
  lng: number
  active: boolean
}

export async function signInWithDemoRole(role: Role): Promise<SessionUser> {
  if (!supabase) {
    const profile = demoProfiles.find((item) => item.role === role)
    if (!profile) throw new Error('Perfil demo nao encontrado.')

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    }
  }

  const credentials = appCredentials[role]
  const { data, error } = await supabase.auth.signInWithPassword(credentials)
  if (error) throw error

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,name,email,role')
    .eq('id', data.user.id)
    .single()
  if (profileError) throw profileError

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
  }
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function loadSnapshot(): Promise<AppSnapshot> {
  if (!supabase) return demoSnapshot

  const [profiles, couriers, shops, orders, locations, events] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('couriers').select('*').order('name'),
    supabase.from('shops').select('*').order('name'),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('courier_locations').select('*'),
    supabase.from('delivery_events').select('*').order('created_at', { ascending: false }).limit(20),
  ])

  if (profiles.error) throw profiles.error
  if (couriers.error) throw couriers.error
  if (shops.error && !isMissingShopsTable(shops.error)) throw shops.error
  if (orders.error) throw orders.error
  if (locations.error) throw locations.error
  if (events.error) throw events.error

  return {
    profiles: (profiles.data as ProfileRow[]).map(mapProfile),
    couriers: (couriers.data as CourierRow[]).map(mapCourier),
    shops: shops.error ? demoShops : (shops.data as ShopRow[]).map(mapShop),
    orders: (orders.data as OrderRow[]).map(mapOrder),
    locations: (locations.data as LocationRow[]).map(mapLocation),
    events: (events.data as EventRow[]).map(mapEvent),
  }
}

export async function createClientOrder(input: CreateOrderInput): Promise<Order> {
  const order: Order = {
    id: crypto.randomUUID(),
    number: `#${Math.floor(1000 + Math.random() * 9000)}`,
    publicCode: `ORD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    clientProfileId: input.clientProfileId,
    merchantName: input.merchantName,
    pickupAddress: input.pickupAddress,
    destinationAddress: input.destinationAddress,
    pickup: input.pickup,
    destination: input.destination,
    status: 'queued',
    assignedCourierId: null,
    totalCents: input.totalCents,
    createdAt: new Date().toISOString(),
    promisedAt: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
    etaMinutes: 0,
    distanceKm: 0,
    items: input.items,
  }

  if (!supabase) return order

  const { data, error } = await supabase
    .from('orders')
    .insert({
      id: order.id,
      number: order.number,
      public_code: order.publicCode,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      client_profile_id: order.clientProfileId,
      merchant_name: order.merchantName,
      pickup_address: order.pickupAddress,
      destination_address: order.destinationAddress,
      pickup_lat: order.pickup.lat,
      pickup_lng: order.pickup.lng,
      destination_lat: order.destination.lat,
      destination_lng: order.destination.lng,
      status: order.status,
      assigned_courier_id: null,
      total_cents: order.totalCents,
      eta_minutes: order.etaMinutes,
      distance_km: order.distanceKm,
      items: order.items,
      promised_at: order.promisedAt,
    })
    .select('*')
    .single()
  if (error) throw error

  return mapOrder(data as OrderRow)
}

export async function assignOrderToCourier(orderId: string, courierId: string, actorName: string) {
  if (!supabase) return

  const { error: rpcError } = await supabase.rpc('accept_order', {
    p_actor_name: actorName,
    p_courier_id: courierId,
    p_order_id: orderId,
  })

  if (!rpcError) return

  if (!isMissingRpc(rpcError)) throw rpcError

  const { error } = await supabase
    .from('orders')
    .update({ assigned_courier_id: courierId, status: 'assigned' })
    .eq('id', orderId)
  if (error) throw error

  await supabase.from('couriers').update({ status: 'busy' }).eq('id', courierId)
  await supabase.from('delivery_events').insert({
    order_id: orderId,
    actor_name: actorName,
    status: 'assigned',
    message: 'Pedido atribuido para motoboy.',
  })
}

export async function updateCourierStatus(courierId: string, status: CourierStatus) {
  if (!supabase) return

  const { error } = await supabase.from('couriers').update({ status }).eq('id', courierId)
  if (error) throw error
}

export async function upsertShop(input: ShopInput, shopId?: string): Promise<Shop> {
  const shop: Shop = {
    id: shopId ?? crypto.randomUUID(),
    name: input.name,
    address: input.address,
    contactName: input.contactName,
    phone: input.phone,
    lat: input.lat,
    lng: input.lng,
    active: input.active,
    createdAt: new Date().toISOString(),
  }

  if (!supabase) return shop

  const { data, error } = await supabase
    .from('shops')
    .upsert({
      id: shop.id,
      name: shop.name,
      address: shop.address,
      contact_name: shop.contactName,
      phone: shop.phone,
      lat: shop.lat,
      lng: shop.lng,
      active: shop.active,
    })
    .select('*')
    .single()
  if (error) throw error

  return mapShop(data as ShopRow)
}

export async function updateOrderStatus(orderId: string, status: DeliveryStatus, actorName: string) {
  if (!supabase) return

  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
  if (error) throw error

  await supabase.from('delivery_events').insert({
    order_id: orderId,
    actor_name: actorName,
    status,
    message: `Status atualizado para ${status}.`,
  })
}

export async function upsertLocation(location: CourierLocation) {
  if (!supabase) return

  const { error } = await supabase.from('courier_locations').upsert({
    courier_id: location.courierId,
    order_id: location.orderId,
    lat: location.lat,
    lng: location.lng,
    accuracy: location.accuracy,
    speed: location.speed,
    heading: location.heading,
    battery: location.battery,
    recorded_at: location.recordedAt,
  })
  if (error) throw error
}

export function subscribeToOperations(onChange: () => void): RealtimeChannel | null {
  if (!supabase || !hasSupabaseConfig) return null

  return supabase
    .channel('operations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_events' }, onChange)
    .subscribe()
}

export function unsubscribe(channel: RealtimeChannel | null) {
  if (!supabase || !channel) return
  void supabase.removeChannel(channel)
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    number: row.number,
    publicCode: row.public_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    clientProfileId: row.client_profile_id,
    merchantName: row.merchant_name,
    pickupAddress: row.pickup_address,
    destinationAddress: row.destination_address,
    pickup: { lat: row.pickup_lat, lng: row.pickup_lng },
    destination: { lat: row.destination_lat, lng: row.destination_lng },
    status: row.status,
    assignedCourierId: row.assigned_courier_id,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    promisedAt: row.promised_at,
    etaMinutes: row.eta_minutes,
    distanceKm: row.distance_km,
    items: row.items ?? [],
  }
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
  }
}

function mapCourier(row: CourierRow): Courier {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    phone: row.phone,
    vehicle: row.vehicle,
    plate: row.plate,
    rating: row.rating,
    status: row.status,
  }
}

function mapShop(row: ShopRow): Shop {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contactName: row.contact_name,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    active: row.active,
    createdAt: row.created_at,
  }
}

function mapLocation(row: LocationRow): CourierLocation {
  return {
    courierId: row.courier_id,
    orderId: row.order_id,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    speed: row.speed,
    heading: row.heading,
    battery: row.battery,
    recordedAt: row.recorded_at,
  }
}

function mapEvent(row: EventRow): DeliveryEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    actorName: row.actor_name,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  }
}

function isMissingShopsTable(error: { code?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
}

function isMissingRpc(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202' || error.message?.includes('accept_order')
}
