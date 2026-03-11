/**
 * exif.ts
 *
 * EXIF GPS parsing utilities for photo uploads.
 *
 * Key responsibilities:
 * - Extracts latitude/longitude from image EXIF metadata
 * - Handles decimal degrees and DMS (degrees/minutes/seconds) formats
 * - Returns null on invalid or missing data
 */

/**
 * Parses EXIF GPS fields into decimal degrees.
 * Handles both signed decimals and DMS (degrees, minutes, seconds) format.
 *
 * @param exif - EXIF metadata object from image (e.g. ImagePicker result)
 * @returns { latitude, longitude } or null if GPS data missing/invalid
 */
export function parseExifGps(
  exif: Record<string, unknown> | undefined
): { latitude: number; longitude: number } | null {
  if (!exif) return null;
  const lat = exif.GPSLatitude;
  const lng = exif.GPSLongitude;
  if (lat == null || lng == null) return null;

  /** Converts a single coordinate from number or [d,m,s] array to decimal degrees */
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

/**
 * Parse EXIF date (YYYY:MM:DD HH:MM:SS) to ISO string.
 */
export function parseExifDate(exifDate: unknown): string | null {
  if (typeof exifDate !== 'string') return null;
  try {
    const cleaned = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const date = new Date(cleaned);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}
