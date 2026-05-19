export type Role = 'admin' | 'courier' | 'client'

export type DeliveryStatus = 'queued' | 'assigned' | 'pickup' | 'in_transit' | 'delivered' | 'delayed' | 'cancelled'

export type CourierStatus = 'available' | 'busy' | 'offline'

export type Coordinates = {
  lat: number
  lng: number
}

export type Profile = {
  id: string
  name: string
  email: string
  role: Role
}

export type Courier = {
  id: string
  profileId: string | null
  name: string
  phone: string
  vehicle: string
  plate: string
  rating: number
  status: CourierStatus
}

export type Shop = {
  id: string
  name: string
  address: string
  contactName: string
  phone: string
  lat: number
  lng: number
  active: boolean
  createdAt: string
}

export type Product = {
  id: string
  shopId: string
  name: string
  category: string
  priceCents: number
  active: boolean
  createdAt: string
}

export type Customer = {
  id: string
  name: string
  email: string
  phone: string
  address: string
  active: boolean
  createdAt: string
}

export type StaffMember = {
  id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'dispatcher' | 'support'
  active: boolean
  createdAt: string
}

export type OrderItem = {
  name: string
  quantity: number
}

export type Order = {
  id: string
  number: string
  publicCode: string
  customerName: string
  customerPhone: string
  clientProfileId: string | null
  merchantName: string
  pickupAddress: string
  destinationAddress: string
  pickup: Coordinates
  destination: Coordinates
  status: DeliveryStatus
  assignedCourierId: string | null
  totalCents: number
  createdAt: string
  promisedAt: string
  etaMinutes: number
  distanceKm: number
  items: OrderItem[]
}

export type CourierLocation = {
  courierId: string
  orderId: string | null
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  battery: number | null
  recordedAt: string
}

export type DeliveryEvent = {
  id: string
  orderId: string
  actorName: string
  status: DeliveryStatus
  message: string
  createdAt: string
}

export type AppSnapshot = {
  profiles: Profile[]
  couriers: Courier[]
  customers: Customer[]
  shops: Shop[]
  products: Product[]
  staffMembers: StaffMember[]
  orders: Order[]
  locations: CourierLocation[]
  events: DeliveryEvent[]
}

export type RoutePlan = {
  points: Coordinates[]
  distanceKm: number
  etaMinutes: number
  provider: 'osrm' | 'fallback'
}

export type SessionUser = {
  id: string
  name: string
  role: Role
  email: string
}
