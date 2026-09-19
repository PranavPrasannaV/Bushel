// T055 / FR-006: no user-facing control changes the seeding-distance threshold or Baker's reference fraction.
// A negative requirement is easy to break silently, and the threshold statement (T053) is exactly where a
// toggle would get added. This scans the shipped source text, so it needs no browser.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeOrder } from '../src/convert/computeOrder.ts'
import type { Factors, FireRecord } from '../src/convert/types.ts'
import fireJson from './fixtures/fire.json'

const SRC = new URL('../src/', import.meta.url)
const FIXED = /threshold_m|baker_reference_fraction|thresholdM|bakerReference|bakerFraction/i

const tsxFiles = (readdirSync(SRC, { recursive: true }) as string[])
  .map((f) => f.replace(/\\/g, '/')) // readdirSync yields backslashes on Windows
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, SRC), 'utf8') }))

/** Opening tags of anything a user can operate. `=>` inside an attribute does not end the tag. */
const CONTROL_TAG = /<(input|select|textarea|button|option)\b(?:=>|[^>])*>/g
const CONTROL_ROLE = /<\w+\b(?:=>|[^>])*role=["'{]*(slider|spinbutton|switch|checkbox|radio|combobox)\b(?:=>|[^>])*>/g

describe('FR-006: threshold_m and baker_reference_fraction have no control', () => {
  it('finds the component sources to scan', () => {
    expect(tsxFiles.map((f) => f.file)).toContain('components/BurnMap.tsx')
  })

  it('no input, select, slider or button in src/**/*.tsx is bound to either value', () => {
    const offenders: string[] = []
    for (const { file, text } of tsxFiles) {
      for (const re of [CONTROL_TAG, CONTROL_ROLE]) {
        for (const m of text.matchAll(re)) if (FIXED.test(m[0])) offenders.push(`${file}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no .tsx source writes either value or keeps it in state', () => {
    const write = /\b(threshold_m|baker_reference_fraction)\s*(=(?!=)|:)/
    const setter = /\bset(Threshold|Baker)\w*/i
    const offenders = tsxFiles
      .filter(({ text }) => write.test(text) || setter.test(text))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it("BurnMap's props are data, plus two callbacks that only pick a fire or a county", () => {
    const text = readFileSync(new URL('components/BurnMap.tsx', SRC), 'utf8')
    const sig = text.match(/export default function BurnMap\(\s*\w+\s*:\s*\{([\s\S]*?)\}\s*\)/)
    expect(sig, 'BurnMap signature not found').not.toBeNull()
    const props = sig![1]
    const keys = [...props.matchAll(/^\s*(\w+)\??\s*:/gm)].map((m) => m[1]).sort()
    expect(keys).toEqual([
      'counties',
      'fireName',
      'fitBox',
      'focusCounty',
      'geojson',
      'onPickCounty',
      'onPickFire',
      'overview',
      'overviewTitle',
      'pin',
      'planting',
      'showOverview',
    ])
    // The callbacks take a fire id or a county code and nothing else: neither can carry a threshold or a fraction.
    expect(props).toMatch(/onPickFire\?:\s*\(id: string\) => void/)
    expect(props).toMatch(/onPickCounty\?:\s*\(fips: string\) => void/)
    const rest = props
      .replace(/onPickFire\?:\s*\(id: string\) => void/, '')
      .replace(/onPickCounty\?:\s*\(fips: string\) => void/, '')
    expect(rest).not.toMatch(/=>|\bon[A-Z]\w*|\bset[A-Z]\w*|Dispatch|SetStateAction/)
  })

  it('neither value is an adjustable assumption in factors.json or computeOrder', () => {
    const factors = JSON.parse(
      readFileSync(new URL('../public/data/reference/factors.json', import.meta.url), 'utf8'),
    ) as Factors
    const names = [...factors.published, ...factors.unpublished].map((f) => f.name)
    expect(names.filter((n) => FIXED.test(n))).toEqual([])

    const order = computeOrder(fireJson as FireRecord, factors, {
      threshold_m: 30,
      baker_reference_fraction: 0.5,
    })
    expect(order.assumptions_used.map((a) => a.name).filter((n) => FIXED.test(n))).toEqual([])
  })
})
