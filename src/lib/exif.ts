/** Parse EXIF GPS to decimal degrees. Handles both signed decimals and DMS format. */
export function parseExifGps(
  exif: Record<string, unknown> | undefined
): { latitude: number; longitude: number } | null {
  if (!exif) return null;
  const lat = exif.GPSLatitude;
  const lng = exif.GPSLongitude;
  if (lat == null || lng == null) return null;

  const toDecimal = (val: unknown, ref: string | undefined): number | null => {
    if (typeof val === 'number' && !Number.isNaN(val)) {
      return ref === 'S' || ref === 'W' ? -Math.abs(val) : val;
    }
    if (Array.isArray(val) && val.length >= 3) {
      const d = Number(val[0]) || 0;
      const m = Number(val[1]) || 0;
      const s = Number(val[2]) || 0;
      let dec = d + m / 60 + s / 3600;
      if (ref === 'S' || ref === 'W') dec = -dec;
      return dec;
    }
    return null;
  };

  const latitude = toDecimal(lat, exif.GPSLatitudeRef as string | undefined);
  const longitude = toDecimal(lng, exif.GPSLongitudeRef as string | undefined);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}
