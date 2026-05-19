import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

import { translations, type Locale } from '../lib/i18n'
import type { Coordinates, CourierLocation, Order, RoutePlan } from '../types'

type MapCanvasProps = {
  orders: Order[]
  selectedOrder: Order | null
  locations: CourierLocation[]
  routePlan: RoutePlan | null
  height?: string
  locale?: Locale
}

const pickupIcon = createMarkerIcon('pickup')
const destinationIcon = createMarkerIcon('destination')
const courierIcon = createMarkerIcon('courier')

export function MapCanvas({ orders, selectedOrder, locations, routePlan, height = '520px', locale = 'pt-BR' }: MapCanvasProps) {
  const copy = translations[locale].map
  const mapCenter = getMapCenter(selectedOrder, orders)
  const selectedLocation = selectedOrder
    ? locations.find((item) => item.orderId === selectedOrder.id || item.courierId === selectedOrder.assignedCourierId)
    : null

  return (
    <div className="map-shell" style={{ height }}>
      <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} scrollWheelZoom className="map-canvas">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocus center={mapCenter} />

        {selectedOrder ? (
          <>
            <Marker icon={pickupIcon} position={[selectedOrder.pickup.lat, selectedOrder.pickup.lng]}>
              <Popup>
                <strong>{copy.pickup}</strong>
                <br />
                {selectedOrder.pickupAddress}
              </Popup>
            </Marker>
            <Marker icon={destinationIcon} position={[selectedOrder.destination.lat, selectedOrder.destination.lng]}>
              <Popup>
                <strong>{copy.dropoff}</strong>
                <br />
                {selectedOrder.destinationAddress}
              </Popup>
            </Marker>
          </>
        ) : null}

        {routePlan ? (
          <Polyline
            pathOptions={{ color: '#f59e0b', opacity: 0.9, weight: 5 }}
            positions={routePlan.points.map((point) => [point.lat, point.lng])}
          />
        ) : null}

        {locations.map((location) => (
          <Marker icon={courierIcon} key={`${location.courierId}-${location.orderId ?? 'free'}`} position={[location.lat, location.lng]}>
            <Popup>
              <strong>{copy.courierOnline}</strong>
              <br />
              {copy.updated} {new Date(location.recordedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </Popup>
          </Marker>
        ))}

        {selectedLocation ? (
          <Polyline
            pathOptions={{ color: '#22c55e', dashArray: '8 10', opacity: 0.85, weight: 3 }}
            positions={[
              [selectedLocation.lat, selectedLocation.lng],
              [selectedOrder?.destination.lat ?? selectedLocation.lat, selectedOrder?.destination.lng ?? selectedLocation.lng],
            ]}
          />
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

function getMapCenter(selectedOrder: Order | null, orders: Order[]) {
  if (selectedOrder) {
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
    html: `<span>${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}
