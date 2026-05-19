import type { Coordinates, Order, RoutePlan } from '../types'
import { translations, type Locale } from './i18n'

const averageCourierSpeedKmh = 24

export function formatCurrency(cents: number, locale: Locale = 'pt-BR') {
  return new Intl.NumberFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

export function statusLabel(status: string, locale: Locale = 'pt-BR') {
  return translations[locale].status[status as keyof typeof translations['pt-BR']['status']] ?? status
}

export function courierStatusLabel(status: string, locale: Locale = 'pt-BR') {
  return translations[locale].courierStatus[status as keyof typeof translations['pt-BR']['courierStatus']] ?? status
}

export function haversineKm(start: Coordinates, end: Coordinates) {
  const earthRadiusKm = 6371
  const dLat = toRadians(end.lat - start.lat)
  const dLng = toRadians(end.lng - start.lng)
  const lat1 = toRadians(start.lat)
  const lat2 = toRadians(end.lat)
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusKm * c
}

export function fallbackRoute(order: Pick<Order, 'pickup' | 'destination'>): RoutePlan {
  const distanceKm = haversineKm(order.pickup, order.destination) * 1.28
  const etaMinutes = Math.max(3, Math.ceil((distanceKm / averageCourierSpeedKmh) * 60))

  return {
    points: [order.pickup, order.destination],
    distanceKm,
    etaMinutes,
    provider: 'fallback',
  }
}

export async function getRoutePlan(order: Pick<Order, 'pickup' | 'destination'>): Promise<RoutePlan> {
  const fallback = fallbackRoute(order)
  const coordinates = `${order.pickup.lng},${order.pickup.lat};${order.destination.lng},${order.destination.lat}`
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`

  try {
    const response = await fetch(url)
    if (!response.ok) return fallback

    const payload = await response.json() as {
      routes?: Array<{
        distance: number
        duration: number
        geometry: {
          coordinates: Array<[number, number]>
        }
      }>
    }
    const route = payload.routes?.[0]
    if (!route) return fallback

    return {
      points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: route.distance / 1000,
      etaMinutes: Math.max(1, Math.ceil(route.duration / 60)),
      provider: 'osrm',
    }
  } catch {
    return fallback
  }
}

export function interpolatePoint(points: Coordinates[], progress: number) {
  if (points.length === 0) return { lat: 0, lng: 0 }
  if (points.length === 1) return points[0]

  const safeProgress = Math.min(1, Math.max(0, progress))
  const segment = safeProgress * (points.length - 1)
  const index = Math.min(points.length - 2, Math.floor(segment))
  const localProgress = segment - index
  const start = points[index]
  const end = points[index + 1]

  return {
    lat: start.lat + (end.lat - start.lat) * localProgress,
    lng: start.lng + (end.lng - start.lng) * localProgress,
  }
}

export function estimateEtaFromLocation(location: Coordinates, destination: Coordinates) {
  const remainingKm = haversineKm(location, destination) * 1.2
  return Math.max(1, Math.ceil((remainingKm / averageCourierSpeedKmh) * 60))
}

function toRadians(value: number) {
  return value * (Math.PI / 180)
}
