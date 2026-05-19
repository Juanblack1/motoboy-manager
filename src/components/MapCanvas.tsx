import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

import { translations, type Locale } from '../lib/i18n'
import type { Coordinates, Courier, CourierLocation, Order, RoutePlan } from '../types'

type MapCanvasProps = {
  courier?: Courier | null
  orders: Order[]
  selectedOrder: Order | null
  locations: CourierLocation[]
  routePlan: RoutePlan | null
  height?: string
  locale?: Locale
  mode?: 'standard' | 'pickup' | 'delivery'
}

const pickupIcon = createMarkerIcon('pickup')
const destinationIcon = createMarkerIcon('destination')

export function MapCanvas({ courier, orders, selectedOrder, locations, routePlan, height = '520px', locale = 'pt-BR', mode = 'standard' }: MapCanvasProps) {
  const copy = translations[locale].map
  const selectedLocation = selectedOrder
    ? locations.find((item) => item.orderId === selectedOrder.id || item.courierId === selectedOrder.assignedCourierId)
    : null
  const activeLocation = selectedLocation ?? null
  const activeTarget = selectedOrder ? (mode === 'delivery' ? selectedOrder.destination : selectedOrder.pickup) : null
  const mapCenter = getMapCenter(selectedOrder, orders, activeLocation, activeTarget, mode)
  const showPickup = Boolean(selectedOrder && mode !== 'delivery')
  const showDestination = Boolean(selectedOrder)

  return (
    <div className={`map-shell map-mode-${mode}`} style={{ height }}>
      <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} scrollWheelZoom className="map-canvas">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocus center={mapCenter} />

        {selectedOrder ? (
          <>
            {showPickup ? <Marker icon={pickupIcon} position={[selectedOrder.pickup.lat, selectedOrder.pickup.lng]}>
              <Popup>
                <strong>{copy.pickup}</strong>
                <br />
                {selectedOrder.pickupAddress}
              </Popup>
            </Marker> : null}
            {showDestination ? <Marker icon={destinationIcon} position={[selectedOrder.destination.lat, selectedOrder.destination.lng]}>
              <Popup>
                <strong>{copy.dropoff}</strong>
                <br />
                {selectedOrder.destinationAddress}
              </Popup>
            </Marker> : null}
          </>
        ) : null}

        {routePlan ? (
          <>
            <Polyline
              pathOptions={{ color: '#fffaf0', opacity: 0.94, weight: mode === 'standard' ? 8 : 10 }}
              positions={routePlan.points.map((point) => [point.lat, point.lng])}
            />
            <Polyline
              pathOptions={{ color: mode === 'delivery' ? '#16a064' : '#f59e0b', opacity: 0.95, weight: mode === 'standard' ? 5 : 6 }}
              positions={routePlan.points.map((point) => [point.lat, point.lng])}
            />
          </>
        ) : null}

        {locations.map((location) => (
          <Marker icon={createCourierIcon(location.heading)} key={`${location.courierId}-${location.orderId ?? 'free'}`} position={[location.lat, location.lng]}>
            <Popup>
              <div className="map-courier-popup">
                <img alt="" src={courier ? `/assets/couriers/${courier.id}.svg` : '/assets/couriers/default.svg'} />
                <div>
                  <strong>{courier?.name ?? copy.courierOnline}</strong>
                  <br />
                  {copy.updated} {new Date(location.recordedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {activeLocation && activeTarget && !routePlan ? (
          <>
            <Polyline
              pathOptions={{ color: '#fffaf0', opacity: 0.9, weight: 7 }}
              positions={[
                [activeLocation.lat, activeLocation.lng],
                [activeTarget.lat, activeTarget.lng],
              ]}
            />
            <Polyline
              pathOptions={{ color: mode === 'delivery' ? '#16a064' : '#2563eb', dashArray: mode === 'delivery' ? undefined : '8 10', opacity: 0.9, weight: 4 }}
              positions={[
                [activeLocation.lat, activeLocation.lng],
                [activeTarget.lat, activeTarget.lng],
              ]}
            />
          </>
        ) : null}
      </MapContainer>
    </div>
  )
}

function MapFocus({ center }: { center: Coordinates }) {
  const map = useMap()
  map.setView([center.lat, center.lng], map.getZoom(), { animate: true })
  return null
}

function getMapCenter(selectedOrder: Order | null, orders: Order[], selectedLocation: CourierLocation | null, activeTarget: Coordinates | null, mode: MapCanvasProps['mode']) {
  if (selectedLocation && activeTarget) {
    return {
      lat: (selectedLocation.lat + activeTarget.lat) / 2,
      lng: (selectedLocation.lng + activeTarget.lng) / 2,
    }
  }

  if (selectedOrder) {
    if (mode === 'delivery') return selectedOrder.destination

    return {
      lat: (selectedOrder.pickup.lat + selectedOrder.destination.lat) / 2,
      lng: (selectedOrder.pickup.lng + selectedOrder.destination.lng) / 2,
    }
  }

  return orders[0]?.pickup ?? { lat: -23.561684, lng: -46.655981 }
}

function createMarkerIcon(kind: 'pickup' | 'destination' | 'courier') {
  const label = kind === 'pickup' ? 'R' : kind === 'destination' ? 'E' : 'M'
  const className = `marker-pin marker-${kind}`

  return L.divIcon({
    className,
    html: `<span class="marker-label">${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function createCourierIcon(heading: number | null) {
  const rotation = Number.isFinite(heading) ? Number(heading) : 0

  return L.divIcon({
    className: 'marker-pin marker-courier marker-courier-moto',
    html: `<img alt="" src="/assets/icons/motorcycle.svg" style="transform: rotate(${rotation}deg);" />`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  })
}
