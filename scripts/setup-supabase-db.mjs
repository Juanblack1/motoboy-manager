import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })
config()

const databaseUrl = process.env.SUPABASE_DB_URL

if (!databaseUrl) {
  throw new Error('Defina SUPABASE_DB_URL em .env.local ou no ambiente antes de rodar este script.')
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

const demoUsers = {
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
  client: {
    email: process.env.VITE_DEMO_CLIENT_EMAIL || 'cliente@motoboy.demo',
    password: process.env.VITE_DEMO_CLIENT_PASSWORD || 'Cliente@123456',
    name: 'Camila Torres',
    role: 'client',
  },
}

const ids = {
  courierRafael: '11111111-1111-4111-8111-111111111111',
  courierLuiza: '22222222-2222-4222-8222-222222222222',
  courierDiego: '33333333-3333-4333-8333-333333333333',
  shopBistro: '44444444-4444-4444-8444-444444444441',
  shopMercado: '44444444-4444-4444-8444-444444444442',
  shopFarmacia: '44444444-4444-4444-8444-444444444443',
  order1001: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1001',
  order1002: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1002',
  order1003: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1003',
}

await client.connect()

try {
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  await client.query(schema)

  const adminUser = await upsertAuthUser(demoUsers.admin)
  const courierUser = await upsertAuthUser(demoUsers.courier)
  const clientUser = await upsertAuthUser(demoUsers.client)

  await upsertProfiles(adminUser, courierUser, clientUser)
  await seedOperationalData(adminUser, courierUser, clientUser)

  console.log('Supabase configurado com sucesso.')
  console.log(`Admin demo: ${demoUsers.admin.email}`)
  console.log(`Cliente demo: ${demoUsers.client.email}`)
  console.log(`Motoboy demo: ${demoUsers.courier.email}`)
  console.log('Fluxo demo: cliente cria, admin atribui, motoboy entrega.')
} finally {
  await client.end()
}

async function upsertAuthUser(user) {
  const existing = await client.query('select id from auth.users where lower(email) = lower($1) limit 1', [user.email])
  const id = existing.rows[0]?.id || randomUUID()
  const appMeta = { provider: 'email', providers: ['email'] }
  const userMeta = { name: user.name, role: user.role }

  if (existing.rowCount) {
    await client.query(
      `update auth.users
       set encrypted_password = crypt($2, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data = $3::jsonb,
           raw_user_meta_data = $4::jsonb,
           updated_at = now()
       where id = $1`,
      [id, user.password, JSON.stringify(appMeta), JSON.stringify(userMeta)],
    )
  } else {
    await client.query(
      `insert into auth.users (
         instance_id,
         id,
         aud,
         role,
         email,
         encrypted_password,
         email_confirmed_at,
         raw_app_meta_data,
         raw_user_meta_data,
         created_at,
         updated_at,
         confirmation_token,
         recovery_token,
         email_change_token_new,
         email_change
       ) values (
         '00000000-0000-0000-0000-000000000000',
         $1,
         'authenticated',
         'authenticated',
         $2,
         crypt($3, gen_salt('bf')),
         now(),
         $4::jsonb,
         $5::jsonb,
         now(),
         now(),
         '',
         '',
         '',
         ''
       )`,
      [id, user.email, user.password, JSON.stringify(appMeta), JSON.stringify(userMeta)],
    )
  }

  await upsertEmailIdentity(id, user.email)
  return { id, ...user }
}

async function upsertEmailIdentity(userId, email) {
  const columnsResult = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities'`,
  )
  const columns = new Set(columnsResult.rows.map((row) => row.column_name))
  const now = new Date()
  const values = {
    id: userId,
    user_id: userId,
    provider_id: email,
    identity_data: JSON.stringify({ sub: userId, email, email_verified: true, phone_verified: false }),
    provider: 'email',
    last_sign_in_at: now,
    created_at: now,
    updated_at: now,
  }
  const insertColumns = Object.keys(values).filter((column) => columns.has(column))
  const placeholders = insertColumns.map((_, index) => `$${index + 1}`)

  await client.query('delete from auth.identities where user_id = $1 and provider = $2', [userId, 'email'])
  await client.query(
    `insert into auth.identities (${insertColumns.join(', ')}) values (${placeholders.join(', ')})`,
    insertColumns.map((column) => values[column]),
  )
}

async function upsertProfiles(adminUser, courierUser, clientUser) {
  await client.query(
    `insert into public.profiles (id, name, email, role)
     values ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)
     on conflict (id) do update
     set name = excluded.name,
         email = excluded.email,
         role = excluded.role`,
    [
      adminUser.id,
      adminUser.name,
      adminUser.email,
      adminUser.role,
      courierUser.id,
      courierUser.name,
      courierUser.email,
      courierUser.role,
      clientUser.id,
      clientUser.name,
      clientUser.email,
      clientUser.role,
    ],
  )
}

async function seedOperationalData(adminUser, courierUser, clientUser) {
  const now = Date.now()

  await client.query(
    `insert into public.couriers (id, profile_id, name, phone, vehicle, plate, rating, status)
     values
       ($1, $2, 'Rafael Motta', '+55 11 98888-0101', 'Honda CG 160', 'RTA-4B22', 4.92, 'busy'),
       ($3, $4, 'Luiza Neri', '+55 11 97777-2020', 'Yamaha Factor', 'LZN-8C19', 4.87, 'available'),
       ($5, $4, 'Diego Ramos', '+55 11 96666-3030', 'Honda Biz', 'DGR-2A71', 4.75, 'offline')
     on conflict (id) do update
     set profile_id = excluded.profile_id,
         name = excluded.name,
         phone = excluded.phone,
         vehicle = excluded.vehicle,
         plate = excluded.plate,
         rating = excluded.rating,
         status = excluded.status`,
    [ids.courierRafael, courierUser.id, ids.courierLuiza, adminUser.id, ids.courierDiego],
  )

  await client.query(
    `insert into public.shops (id, name, address, contact_name, phone, lat, lng, active)
     values
       ($1, 'Bistro Avenida', 'Av. Paulista, 1578 - Bela Vista, Sao Paulo', 'Julia Moraes', '+55 11 3333-1001', -23.561684, -46.655981, true),
       ($2, 'Mercado Central Express', 'Rua Augusta, 1600 - Consolacao, Sao Paulo', 'Paulo Vieira', '+55 11 3333-1002', -23.555421, -46.662089, true),
       ($3, 'Farmacia Jardins', 'Alameda Santos, 980 - Jardim Paulista, Sao Paulo', 'Nadia Lima', '+55 11 3333-1003', -23.566076, -46.656292, true)
     on conflict (id) do update
     set name = excluded.name,
         address = excluded.address,
         contact_name = excluded.contact_name,
         phone = excluded.phone,
         lat = excluded.lat,
         lng = excluded.lng,
         active = excluded.active`,
    [ids.shopBistro, ids.shopMercado, ids.shopFarmacia],
  )

  await client.query(
    `insert into public.orders (
     id, number, public_code, customer_name, customer_phone, merchant_name,
       client_profile_id, pickup_address, destination_address, pickup_lat, pickup_lng,
       destination_lat, destination_lng, status, assigned_courier_id,
       total_cents, eta_minutes, distance_km, items, created_at, promised_at
     ) values
       ($1, '#1001', 'SP-8K2M', 'Camila Torres', '+55 11 90000-1001', 'Bistro Avenida', $2,
        'Av. Paulista, 1578 - Bela Vista, Sao Paulo', 'Rua Oscar Freire, 620 - Jardins, Sao Paulo',
        -23.561684, -46.655981, -23.561325, -46.669402, 'in_transit', $3,
        8450, 13, 3.6, $4::jsonb, $5, $6),
       ($7, '#1002', 'SP-4Q9Z', 'Bruno Martins', '+55 11 90000-1002', 'Mercado Central Express', $2,
        'Rua Augusta, 1600 - Consolacao, Sao Paulo', 'Rua Frei Caneca, 720 - Consolacao, Sao Paulo',
        -23.555421, -46.662089, -23.553379, -46.651782, 'assigned', $8,
        12990, 21, 2.8, $9::jsonb, $10, $11),
       ($12, '#1003', 'SP-7L1A', 'Nadia Lima', '+55 11 90000-1003', 'Farmacia Jardins', $2,
        'Alameda Santos, 980 - Jardim Paulista, Sao Paulo', 'Rua Pamplona, 1005 - Jardim Paulista, Sao Paulo',
        -23.566076, -46.656292, -23.568295, -46.661425, 'queued', null,
        5290, 0, 1.4, $13::jsonb, $14, $15)
     on conflict (id) do update
     set number = excluded.number,
         public_code = excluded.public_code,
         customer_name = excluded.customer_name,
         customer_phone = excluded.customer_phone,
         client_profile_id = excluded.client_profile_id,
         merchant_name = excluded.merchant_name,
         pickup_address = excluded.pickup_address,
         destination_address = excluded.destination_address,
         pickup_lat = excluded.pickup_lat,
         pickup_lng = excluded.pickup_lng,
         destination_lat = excluded.destination_lat,
         destination_lng = excluded.destination_lng,
         status = excluded.status,
         assigned_courier_id = excluded.assigned_courier_id,
         total_cents = excluded.total_cents,
         eta_minutes = excluded.eta_minutes,
         distance_km = excluded.distance_km,
         items = excluded.items,
         created_at = excluded.created_at,
         promised_at = excluded.promised_at`,
    [
      ids.order1001,
      clientUser.id,
      ids.courierRafael,
      JSON.stringify([{ name: 'Combo executivo', quantity: 1 }, { name: 'Suco natural', quantity: 2 }]),
      new Date(now - 1000 * 60 * 36),
      new Date(now + 1000 * 60 * 18),
      ids.order1002,
      ids.courierLuiza,
      JSON.stringify([{ name: 'Compras de mercado', quantity: 1 }, { name: 'Agua mineral', quantity: 6 }]),
      new Date(now - 1000 * 60 * 12),
      new Date(now + 1000 * 60 * 34),
      ids.order1003,
      JSON.stringify([{ name: 'Pedido farmacia', quantity: 1 }]),
      new Date(now - 1000 * 60 * 4),
      new Date(now + 1000 * 60 * 41),
    ],
  )

  await client.query(
    `insert into public.courier_locations (courier_id, order_id, lat, lng, accuracy, speed, heading, battery, recorded_at)
     values ($1, $2, -23.561515, -46.662611, 14, 8.5, 274, 0.78, $3)
     on conflict (courier_id) do update
     set order_id = excluded.order_id,
         lat = excluded.lat,
         lng = excluded.lng,
         accuracy = excluded.accuracy,
         speed = excluded.speed,
         heading = excluded.heading,
         battery = excluded.battery,
         recorded_at = excluded.recorded_at`,
    [ids.courierRafael, ids.order1001, new Date(now - 1000 * 20)],
  )

  await client.query('delete from public.delivery_events where order_id = any($1::uuid[])', [[ids.order1001, ids.order1002, ids.order1003]])
  await client.query(
    `insert into public.delivery_events (order_id, actor_name, status, message, created_at)
     values
       ($1, 'Marina Alves', 'assigned', 'Pedido atribuido para Rafael Motta.', $2),
       ($1, 'Rafael Motta', 'pickup', 'Motoboy chegou no ponto de retirada.', $3),
       ($1, 'Rafael Motta', 'in_transit', 'Pedido saiu para entrega.', $4)`,
    [
      ids.order1001,
      new Date(now - 1000 * 60 * 32),
      new Date(now - 1000 * 60 * 24),
      new Date(now - 1000 * 60 * 16),
    ],
  )
}
