// Which states Bushel covers, and what stands between the rest and a real order. Stated plainly on the
// national map: only California is built. The West is next because every California-only input has a
// public western counterpart and Dobrowski et al. (2024) published a seed-limited reforestation need for
// eleven western states to check against. The rest of the country has no such published figure yet.

export type Coverage = 'covered' | 'next' | 'later'

/** The ten western states Dobrowski et al. (2024) assessed alongside California. */
const NEXT = new Set(['AZ', 'CO', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY'])

export function coverage(postal: string): Coverage {
  if (postal === 'CA') return 'covered'
  return NEXT.has(postal) ? 'next' : 'later'
}

export const COVERAGE_COPY: Record<Coverage, { label: string; detail: string }> = {
  covered: {
    label: 'Built',
    detail:
      'Every CAL FIRE perimeter of 1,000+ acres from 2018 to 2023 with a burn-severity assessment, built from ' +
      'the agency services and checked against CAL FIRE’s own published need.',
  },
  next: {
    label: 'Next: the West',
    detail:
      'The same pipeline runs on national layers that already exist (provisional seed zones, LANDFIRE ' +
      'vegetation, PAD-US ownership, MTBS severity), and Dobrowski et al. (2024) published this state’s ' +
      'seed-limited need to check against. It opens once those inputs are validated here.',
  },
  later: {
    label: 'Not yet',
    detail:
      'Fewer severe conifer burns, and no published seed-limited need to check an order against yet. ' +
      'Bushel will not show a figure it cannot check.',
  },
}
