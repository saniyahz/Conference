export type Region = 'UAE' | 'NORTH_AMERICA' | 'EUROPE';

export interface PrintingPartner {
  id: string;
  name: string;
  region: Region;
  apiEndpoint: string;
  supportedFormats: string[];
  estimatedDeliveryDays: number;
  pricing: {
    basePrice: number;
    currency: string;
    perPageCost: number;
  };
  contactEmail: string;
}

export const PRINTING_PARTNERS: Record<Region, PrintingPartner> = {
  UAE: {
    id: 'printhaus-uae',
    name: 'PrintHaus UAE',
    region: 'UAE',
    apiEndpoint: 'https://api.printhaus-uae.com/v1/orders',
    supportedFormats: ['PDF', 'JPG', 'PNG'],
    estimatedDeliveryDays: 3,
    pricing: {
      basePrice: 45,
      currency: 'AED',
      perPageCost: 2.5,
    },
    contactEmail: 'orders@printhaus-uae.com',
  },
  NORTH_AMERICA: {
    id: 'printify-na',
    name: 'Printify North America',
    region: 'NORTH_AMERICA',
    apiEndpoint: 'https://api.printify.com/v1/orders',
    supportedFormats: ['PDF', 'JPG', 'PNG'],
    estimatedDeliveryDays: 5,
    pricing: {
      basePrice: 12,
      currency: 'USD',
      perPageCost: 0.75,
    },
    contactEmail: 'support@printify.com',
  },
  EUROPE: {
    id: 'printful-eu',
    name: 'Printful Europe',
    region: 'EUROPE',
    apiEndpoint: 'https://api.printful.com/v1/orders',
    supportedFormats: ['PDF', 'JPG', 'PNG'],
    estimatedDeliveryDays: 4,
    pricing: {
      basePrice: 10,
      currency: 'EUR',
      perPageCost: 0.65,
    },
    contactEmail: 'support@printful.com',
  },
};

// Country to region mapping
export const COUNTRY_TO_REGION: Record<string, Region> = {
  // UAE
  'AE': 'UAE',

  // North America
  'US': 'NORTH_AMERICA',
  'CA': 'NORTH_AMERICA',
  'MX': 'NORTH_AMERICA',

  // Europe
  'GB': 'EUROPE',
  'FR': 'EUROPE',
  'DE': 'EUROPE',
  'IT': 'EUROPE',
  'ES': 'EUROPE',
  'NL': 'EUROPE',
  'BE': 'EUROPE',
  'SE': 'EUROPE',
  'NO': 'EUROPE',
  'DK': 'EUROPE',
  'FI': 'EUROPE',
  'PL': 'EUROPE',
  'AT': 'EUROPE',
  'CH': 'EUROPE',
  'IE': 'EUROPE',
  'PT': 'EUROPE',
  'GR': 'EUROPE',
  'CZ': 'EUROPE',
  'RO': 'EUROPE',
  'HU': 'EUROPE',
  'BG': 'EUROPE',
  'HR': 'EUROPE',
  'SK': 'EUROPE',
  'SI': 'EUROPE',
  'LT': 'EUROPE',
  'LV': 'EUROPE',
  'EE': 'EUROPE',
  'CY': 'EUROPE',
  'MT': 'EUROPE',
  'LU': 'EUROPE',
};

export function getRegionFromCountryCode(countryCode: string): Region {
  return COUNTRY_TO_REGION[countryCode] || 'NORTH_AMERICA'; // Default to North America
}

export function getPrintingPartner(region: Region): PrintingPartner {
  return PRINTING_PARTNERS[region];
}

export function calculatePrintingCost(region: Region, pageCount: number): {
  subtotal: number;
  currency: string;
  partner: string;
} {
  const partner = getPrintingPartner(region);
  const subtotal = partner.pricing.basePrice + (pageCount * partner.pricing.perPageCost);

  return {
    subtotal: Math.round(subtotal * 100) / 100, // Round to 2 decimal places
    currency: partner.pricing.currency,
    partner: partner.name,
  };
}
