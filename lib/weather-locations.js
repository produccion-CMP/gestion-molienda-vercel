export const WEATHER_LOCATIONS = Object.freeze({
  planta: { nombre: 'Playa Molienda · Cevil Pozo', lat: -26.789032, lon: -65.255817 },
  san_miguel: { nombre: 'San Miguel de Tucumán', lat: -26.81601, lon: -65.21051 },
  yerba_buena: { nombre: 'Yerba Buena', lat: -26.81298, lon: -65.29543 },
  tafi_viejo: { nombre: 'Tafí Viejo', lat: -26.732, lon: -65.2592 }
});

export function nearestWeatherLocation(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'planta';
  const distance = place => {
    const toRadians = degrees => degrees * Math.PI / 180;
    const a = Math.sin(toRadians(place.lat - latitude) / 2) ** 2 +
      Math.cos(toRadians(latitude)) * Math.cos(toRadians(place.lat)) *
      Math.sin(toRadians(place.lon - longitude) / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  return Object.entries(WEATHER_LOCATIONS).reduce((nearest, [key, place]) =>
    distance(place) < distance(WEATHER_LOCATIONS[nearest]) ? key : nearest, 'planta');
}
