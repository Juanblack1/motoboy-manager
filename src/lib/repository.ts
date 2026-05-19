import type { RealtimeChannel } from '@supabase/supabase-js'

import { demoProfiles, demoSnapshot } from './demo-data'
import { appCredentials, hasSupabaseConfig, supabase } from './supabase'
import type {
  AppSnapshot,
  Courier,
  CourierLocation,
  DeliveryEvent,
  DeliveryStatus,
  Order,
  PublicTracking,
  Role,
  SessionUser,
} from '../types'

type OrderRow = {
  id: string
  number: string
  public_code: string
  customer_name: string
  customer_phone: string
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

  const credentials = role === 'admin' ? appCredentials.admin : appCredentials.courier
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

  const [couriers, orders, locations, events] = await Promise.all([
    supabase.from('couriers').select('*').order('name'),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('courier_locations').select('*'),
    supabase.from('delivery_events').select('*').order('created_at', { ascending: false }).limit(20),
  ])

  if (couriers.error) throw couriers.error
  if (orders.error) throw orders.error
  if (locations.error) throw locations.error
  if (events.error) throw events.error

  return {
    couriers: (couriers.data as CourierRow[]).map(mapCourier),
    orders: (orders.data as OrderRow[]).map(mapOrder),
    locations: (locations.data as LocationRow[]).map(mapLocation),
    events: (events.data as EventRow[]).map(mapEvent),
  }
}

export async function loadPublicTracking(publicCode: string): Promise<PublicTracking | null> {
  if (!supabase) {
    const order = demoSnapshot.orders.find((item) => item.publicCode.toLowerCase() === publicCode.toLowerCase())
    if (!order) return null

    const courier = demoSnapshot.couriers.find((item) => item.id === order.assignedCourierId) ?? null
    const location = demoSnapshot.locations.find((item) => item.orderId === order.id) ?? null
    return { order, courier, location }
  }

  const { data, error } = await supabase.rpc('get_public_tracking', { p_code: publicCode })
  if (error) throw error
  if (!data) return null

  const payload = data as {
    order: OrderRow | null
    courier: CourierRow | null
    location: LocationRow | null
  }
  if (!payload.order) return null

  return {
    order: mapOrder(payload.order),
    courier: payload.courier ? mapCourier(payload.courier) : null,
    location: payload.location ? mapLocation(payload.location) : null,
  }
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
