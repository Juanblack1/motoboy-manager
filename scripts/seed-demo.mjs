import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local antes de rodar o seed.')
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const users = {
  admin: {
    email: process.env.VITE_DEMO_ADMIN_EMAIL || 'admin@motoboy.demo',
    password: process.env.VITE_DEMO_ADMIN_PASSWORD || 'Admin@123456',
    name: 'Marina Alves',
    role: 'admin',
  },
  courier: {
    email: process.env.VITE_DEMO_COURIER_EMAIL || 'motoboy@motoboy.demo',
    password: process.env.VITE_DEMO_COURIER_PASSWORD || 'Motoboy@123456',
    name: 'Rafael Motta',
    role: 'courier',
  },
}

const ids = {
  courierRafael: '11111111-1111-4111-8111-111111111111',
  courierLuiza: '22222222-2222-4222-8222-222222222222',
  courierDiego: '33333333-3333-4333-8333-333333333333',
  order1001: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1001',
  order1002: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1002',
  order1003: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1003',
}

const adminUser = await upsertAuthUser(users.admin)
const courierUser = await upsertAuthUser(users.courier)

await upsert('profiles', [
  {
    id: adminUser.id,
    name: users.admin.name,
    email: users.admin.email,
    role: users.admin.role,
  },
  {
    id: courierUser.id,
    name: users.courier.name,
    email: users.courier.email,
    role: users.courier.role,
  },
])

await upsert('couriers', [
  {
    id: ids.courierRafael,
    profile_id: courierUser.id,
    name: 'Rafael Motta',
    phone: '+55 11 98888-0101',
    vehicle: 'Honda CG 160',
    plate: 'RTA-4B22',
    rating: 4.92,
    status: 'busy',
  },
  {
    id: ids.courierLuiza,
    profile_id: adminUser.id,
    name: 'Luiza Neri',
    phone: '+55 11 97777-2020',
    vehicle: 'Yamaha Factor',
    plate: 'LZN-8C19',
    rating: 4.87,
    status: 'available',
  },
  {
    id: ids.courierDiego,
    profile_id: adminUser.id,
    name: 'Diego Ramos',
    phone: '+55 11 96666-3030',
    vehicle: 'Honda Biz',
    plate: 'DGR-2A71',
    rating: 4.75,
    status: 'offline',
  },
])

const now = Date.now()

await upsert('orders', [
  {
    id: ids.order1001,
    number: '#1001',
    public_code: 'SP-8K2M',
    customer_name: 'Camila Torres',
    customer_phone: '+55 11 90000-1001',
    merchant_name: 'Bistro Avenida',
    pickup_address: 'Av. Paulista, 1578 - Bela Vista, Sao Paulo',
    destination_address: 'Rua Oscar Freire, 620 - Jardins, Sao Paulo',
    pickup_lat: -23.561684,
    pickup_lng: -46.655981,
    destination_lat: -23.561325,
    destination_lng: -46.669402,
    status: 'in_transit',
    assigned_courier_id: ids.courierRafael,
    total_cents: 8450,
    eta_minutes: 13,
    distance_km: 3.6,
    items: [
      { name: 'Combo executivo', quantity: 1 },
      { name: 'Suco natural', quantity: 2 },
    ],
    created_at: new Date(now - 1000 * 60 * 36).toISOString(),
    promised_at: new Date(now + 1000 * 60 * 18).toISOString(),
  },
  {
    id: ids.order1002,
    number: '#1002',
    public_code: 'SP-4Q9Z',
    customer_name: 'Bruno Martins',
    customer_phone: '+55 11 90000-1002',
    merchant_name: 'Mercado Central Express',
    pickup_address: 'Rua Augusta, 1600 - Consolacao, Sao Paulo',
    destination_address: 'Rua Frei Caneca, 720 - Consolacao, Sao Paulo',
    pickup_lat: -23.555421,
    pickup_lng: -46.662089,
    destination_lat: -23.553379,
    destination_lng: -46.651782,
    status: 'assigned',
    assigned_courier_id: ids.courierLuiza,
    total_cents: 12990,
    eta_minutes: 21,
    distance_km: 2.8,
    items: [
      { name: 'Compras de mercado', quantity: 1 },
      { name: 'Agua mineral', quantity: 6 },
    ],
    created_at: new Date(now - 1000 * 60 * 12).toISOString(),
    promised_at: new Date(now + 1000 * 60 * 34).toISOString(),
  },
  {
    id: ids.order1003,
    number: '#1003',
    public_code: 'SP-7L1A',
    customer_name: 'Nadia Lima',
    customer_phone: '+55 11 90000-1003',
    merchant_name: 'Farmacia Jardins',
    pickup_address: 'Alameda Santos, 980 - Jardim Paulista, Sao Paulo',
    destination_address: 'Rua Pamplona, 1005 - Jardim Paulista, Sao Paulo',
    pickup_lat: -23.566076,
    pickup_lng: -46.656292,
    destination_lat: -23.568295,
    destination_lng: -46.661425,
    status: 'queued',
    assigned_courier_id: null,
    total_cents: 5290,
    eta_minutes: 0,
    distance_km: 1.4,
    items: [
      { name: 'Pedido farmacia', quantity: 1 },
    ],
    created_at: new Date(now - 1000 * 60 * 4).toISOString(),
    promised_at: new Date(now + 1000 * 60 * 41).toISOString(),
  },
])

await upsert('courier_locations', [
  {
    courier_id: ids.courierRafael,
    order_id: ids.order1001,
    lat: -23.561515,
    lng: -46.662611,
    accuracy: 14,
    speed: 8.5,
    heading: 274,
    battery: 0.78,
    recorded_at: new Date(now - 1000 * 20).toISOString(),
  },
])

await admin.from('delivery_events').delete().in('order_id', [ids.order1001, ids.order1002, ids.order1003])
await insert('delivery_events', [
  {
    order_id: ids.order1001,
    actor_name: 'Marina Alves',
    status: 'assigned',
    message: 'Pedido atribuido para Rafael Motta.',
    created_at: new Date(now - 1000 * 60 * 32).toISOString(),
  },
  {
    order_id: ids.order1001,
    actor_name: 'Rafael Motta',
    status: 'pickup',
    message: 'Motoboy chegou no ponto de retirada.',
    created_at: new Date(now - 1000 * 60 * 24).toISOString(),
  },
  {
    order_id: ids.order1001,
    actor_name: 'Rafael Motta',
    status: 'in_transit',
    message: 'Pedido saiu para entrega.',
    created_at: new Date(now - 1000 * 60 * 16).toISOString(),
  },
])

console.log('Seed concluido com usuarios de demo:')
console.log(`Admin: ${users.admin.email} / ${users.admin.password}`)
console.log(`Motoboy: ${users.courier.email} / ${users.courier.password}`)

async function upsertAuthUser(user) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw listError

  const existing = list.users.find((item) => item.email?.toLowerCase() === user.email.toLowerCase())
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name, role: user.role },
    })
    if (error) throw error
    return data.user
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { name: user.name, role: user.role },
  })
  if (error) throw error
  return data.user
}

async function upsert(table, rows) {
  const { error } = await admin.from(table).upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

async function insert(table, rows) {
  const { error } = await admin.from(table).insert(rows)
  if (error) throw error
}
