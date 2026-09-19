// What Bushel covers, by state, and how. California's fires are built ahead of time from California's own
// data and checked against CAL FIRE's published need. Every other state in the lower 48 is built live, on
// request, in the browser, from national services, and says so. Alaska and Hawaii are outside the
// national burn-severity mosaic Bushel reads.

export type Coverage = 'covered' | 'live' | 'later'

const OUTSIDE = new Set(['AK', 'HI'])

export function coverage(postal: string): Coverage {
  if (postal === 'CA') return 'covered'
  return OUTSIDE.has(postal) ? 'later' : 'live'
}

export const COVERAGE_COPY: Record<Coverage, { label: string; detail: string }> = {
  covered: {
    label: 'Built and checked',
    detail:
      'Every CAL FIRE perimeter of 1,000+ acres from 2018 to 2023 with a burn-severity assessment, built from ' +
      'California’s own data and checked against CAL FIRE’s published need.',
  },
  live: {
    label: 'Built live on request',
    detail:
      'Search any fire here and Bushel builds it in your browser from national data: MTBS burn severity, ' +
      'PAD-US land ownership, USFS tree species and forest types, the national seed zones and USGS elevation. ' +
      'Not yet checked against a published figure for this state.',
  },
  later: {
    label: 'Not yet',
    detail: 'The national burn-severity mosaic Bushel reads covers the lower 48 states only.',
  },
}
