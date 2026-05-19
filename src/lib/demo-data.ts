import type { AppSnapshot, Courier, CourierLocation, DeliveryEvent, Order, Profile, Shop } from '../types'

const now = new Date()

export const demoProfiles: Profile[] = [
  {
    id: 'demo-admin',
    name: 'Marina Alves',
    email: 'admin@motoboy.demo',
    role: 'admin',
  },
  {
    id: 'demo-courier-profile',
    name: 'Rafael Motta',
    email: 'motoboy@motoboy.demo',
    role: 'courier',
  },
  {
    id: 'demo-client-profile',
    name: 'Camila Torres',
    email: 'cliente@motoboy.demo',
    role: 'client',
  },
]

export const demoCouriers: Courier[] = [
  {
    id: 'courier-rafael',
    profileId: 'demo-courier-profile',
    name: 'Rafael Motta',
    phone: '+55 11 98888-0101',
    vehicle: 'Honda CG 160',
    plate: 'RTA-4B22',
    rating: 4.92,
    status: 'busy',
  },
  {
    id: 'courier-luiza',
    profileId: 'demo-courier-luiza',
    name: 'Luiza Neri',
    phone: '+55 11 97777-2020',
    vehicle: 'Yamaha Factor',
    plate: 'LZN-8C19',
    rating: 4.87,
    status: 'available',
  },
  {
    id: 'courier-diego',
    profileId: 'demo-courier-diego',
    name: 'Diego Ramos',
    phone: '+55 11 96666-3030',
    vehicle: 'Honda Biz',
    plate: 'DGR-2A71',
    rating: 4.75,
    status: 'offline',
  },
]

export const demoShops: Shop[] = [
  {
    id: 'shop-bistro-avenida',
    name: 'Bistro Avenida',
    address: 'Av. Paulista, 1578 - Bela Vista, Sao Paulo',
    contactName: 'Julia Moraes',
    phone: '+55 11 3333-1001',
    lat: -23.561684,
    lng: -46.655981,
    active: true,
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 21).toISOString(),
  },
  {
    id: 'shop-mercado-central',
    name: 'Mercado Central Express',
    address: 'Rua Augusta, 1600 - Consolacao, Sao Paulo',
    contactName: 'Paulo Vieira',
    phone: '+55 11 3333-1002',
    lat: -23.555421,
    lng: -46.662089,
    active: true,
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
  },
  {
    id: 'shop-farmacia-jardins',
    name: 'Farmacia Jardins',
    address: 'Alameda Santos, 980 - Jardim Paulista, Sao Paulo',
    contactName: 'Nadia Lima',
    phone: '+55 11 3333-1003',
    lat: -23.566076,
    lng: -46.656292,
    active: true,
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14).toISOString(),
  },
]

export const demoOrders: Order[] = [
  {
    id: 'order-1001',
    number: '#1001',
    publicCode: 'SP-8K2M',
    customerName: 'Camila Torres',
    customerPhone: '+55 11 90000-1001',
    clientProfileId: 'demo-client-profile',
    merchantName: 'Bistro Avenida',
    pickupAddress: 'Av. Paulista, 1578 - Bela Vista, Sao Paulo',
    destinationAddress: 'Rua Oscar Freire, 620 - Jardins, Sao Paulo',
    pickup: { lat: -23.561684, lng: -46.655981 },
    destination: { lat: -23.561325, lng: -46.669402 },
    status: 'in_transit',
    assignedCourierId: 'courier-rafael',
    totalCents: 8450,
    createdAt: new Date(now.getTime() - 1000 * 60 * 36).toISOString(),
    promisedAt: new Date(now.getTime() + 1000 * 60 * 18).toISOString(),
    etaMinutes: 13,
    distanceKm: 3.6,
    items: [
      { name: 'Combo executivo', quantity: 1 },
      { name: 'Suco natural', quantity: 2 },
    ],
  },
  {
    id: 'order-1002',
    number: '#1002',
    publicCode: 'SP-4Q9Z',
    customerName: 'Bruno Martins',
    customerPhone: '+55 11 90000-1002',
    clientProfileId: 'demo-client-profile',
    merchantName: 'Mercado Central Express',
    pickupAddress: 'Rua Augusta, 1600 - Consolacao, Sao Paulo',
    destinationAddress: 'Rua Frei Caneca, 720 - Consolacao, Sao Paulo',
    pickup: { lat: -23.555421, lng: -46.662089 },
    destination: { lat: -23.553379, lng: -46.651782 },
    status: 'assigned',
    assignedCourierId: 'courier-luiza',
    totalCents: 12990,
    createdAt: new Date(now.getTime() - 1000 * 60 * 12).toISOString(),
    promisedAt: new Date(now.getTime() + 1000 * 60 * 34).toISOString(),
    etaMinutes: 21,
    distanceKm: 2.8,
    items: [
      { name: 'Compras de mercado', quantity: 1 },
      { name: 'Agua mineral', quantity: 6 },
    ],
  },
  {
    id: 'order-1003',
    number: '#1003',
    publicCode: 'SP-7L1A',
    customerName: 'Nadia Lima',
    customerPhone: '+55 11 90000-1003',
    clientProfileId: 'demo-client-profile',
    merchantName: 'Farmacia Jardins',
    pickupAddress: 'Alameda Santos, 980 - Jardim Paulista, Sao Paulo',
    destinationAddress: 'Rua Pamplona, 1005 - Jardim Paulista, Sao Paulo',
    pickup: { lat: -23.566076, lng: -46.656292 },
    destination: { lat: -23.568295, lng: -46.661425 },
    status: 'queued',
    assignedCourierId: null,
    totalCents: 5290,
    createdAt: new Date(now.getTime() - 1000 * 60 * 4).toISOString(),
    promisedAt: new Date(now.getTime() + 1000 * 60 * 41).toISOString(),
    etaMinutes: 0,
    distanceKm: 1.4,
    items: [
      { name: 'Pedido farmacia', quantity: 1 },
    ],
  },
]

export const demoLocations: CourierLocation[] = [
  {
    courierId: 'courier-rafael',
    orderId: 'order-1001',
    lat: -23.561515,
    lng: -46.662611,
    accuracy: 14,
    speed: 8.5,
    heading: 274,
    battery: 0.78,
    recordedAt: new Date(now.getTime() - 1000 * 20).toISOString(),
  },
]

export const demoEvents: DeliveryEvent[] = [
  {
    id: 'event-1',
    orderId: 'order-1001',
    actorName: 'Marina Alves',
    status: 'assigned',
    message: 'Pedido atribuido para Rafael Motta.',
    createdAt: new Date(now.getTime() - 1000 * 60 * 32).toISOString(),
  },
  {
    id: 'event-2',
    orderId: 'order-1001',
    actorName: 'Rafael Motta',
    status: 'pickup',
    message: 'Motoboy chegou no ponto de retirada.',
    createdAt: new Date(now.getTime() - 1000 * 60 * 24).toISOString(),
  },
  {
    id: 'event-3',
    orderId: 'order-1001',
    actorName: 'Rafael Motta',
    status: 'in_transit',
    message: 'Pedido saiu para entrega.',
    createdAt: new Date(now.getTime() - 1000 * 60 * 16).toISOString(),
  },
]

export const demoSnapshot: AppSnapshot = {
  profiles: demoProfiles,
  couriers: demoCouriers,
  shops: demoShops,
  orders: demoOrders,
  locations: demoLocations,
  events: demoEvents,
}

export const demoCredentials = {
  admin: {
    email: 'admin@motoboy.demo',
    password: 'Admin@123456',
  },
  courier: {
    email: 'motoboy@motoboy.demo',
    password: 'Motoboy@123456',
  },
  client: {
    email: 'cliente@motoboy.demo',
    password: 'Cliente@123456',
  },
}
