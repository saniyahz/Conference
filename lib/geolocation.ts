import { Region, getRegionFromCountryCode } from './printingConfig';

export interface GeolocationData {
  country: string;
  countryCode: string;
  region: Region;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Detects user's location using IP-based geolocation
 * This is a client-side safe approach that works without requiring user permission
 */
export async function detectUserLocation(): Promise<GeolocationData> {
  try {
    // Use ipapi.co for IP-based geolocation (free tier: 1000 requests/day)
    const response = await fetch('https://ipapi.co/json/', {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch location data');
    }

    const data = await response.json();

    const region = getRegionFromCountryCode(data.country_code);

    return {
      country: data.country_name || 'Unknown',
      countryCode: data.country_code || 'US',
      region,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
    };
  } catch (error) {
    console.error('Geolocation detection failed:', error);

    // Fallback to North America as default
    return {
      country: 'United States',
      countryCode: 'US',
      region: 'NORTH_AMERICA',
    };
  }
}

/**
 * Server-side location detection from request headers
 * This can be used in API routes
 */
export function detectLocationFromHeaders(headers: Headers): { countryCode?: string; region: Region } {
  // Check common headers set by CDNs/proxies
  const countryCode =
    headers.get('CF-IPCountry') || // Cloudflare
    headers.get('X-Vercel-IP-Country') || // Vercel
    headers.get('X-Country-Code') || // Generic
    'US'; // Default

  const region = getRegionFromCountryCode(countryCode);

  return {
    countryCode,
    region,
  };
}
