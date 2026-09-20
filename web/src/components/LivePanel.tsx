// A live national build, shown as it happens (each national service ticking off as it answers) and, once
// done, the cross-check, where every number came from and how the build differs from California's checked
// ones. The cross-check leads the report section, the way the California branch leads with its own
// like-for-like check: it is the one number on the page that was computed twice, and it is stated as what
// it is — two implementations of one method agreeing, not a check against ground truth or a published
// figure. Outside California there is still nothing published to check a single fire against, and the
// block says so rather than letting the agreement stand in for validation.
import type { NationalBuild, Step } from '../national/build.ts'
import './LivePanel.css'

const host = (url: string) => (url ? new URL(url).host : 'this browser')
const secs = (ms?: number) => (ms === undefined ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

export function LiveProgress({
  steps,
  status,
  message,
  onRetry,
}: {
  steps: Step[]
  status: 'building' | 'ready' | 'error'
  message?: string
  onRetry?: () => void
}) {
  const done = steps.filter((s) => s.status === 'done').length
  return (
    <section className="live-progress" aria-label="Live build" aria-live="polite">
      <header className="region-head">
        <p className="slip-kind">Live build</p>
        <h2 className="region-name">{status === 'error' ? 'Build stopped' : 'Building from national data'}</h2>
        <p className="stamp">
          <span>
            {done} of {steps.length || 8} sources
          </span>
          <span>computed in this browser</span>
        </p>
      </header>
      <ol className="live-steps">
        {steps.map((s) => (
          <li key={s.key} data-status={s.status}>
            <span className="live-step-mark" aria-hidden="true" />
            <span className="live-step-text">
              <span className="live-step-label">{s.label}</span>
              <span className="live-step-source">{s.note ?? s.source}</span>
            </span>
            <span className="live-step-time">{s.status === 'done' ? secs(s.ms) : s.status === 'running' ? host(s.url) : ''}</span>
          </li>
        ))}
      </ol>
      {status === 'error' && (
        <div className="region-verdict">
          <p>{message}</p>
          {onRetry && (
            <button type="button" className="button-quiet" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** Report section for a live build: the cross-check, then the method's differences from California, then
 *  every source. */
export function LiveSources({ build }: { build: NationalBuild }) {
  return (
    <section className="live-sources" aria-labelledby="live-sources-title">
      <p className="caps">Built live</p>
      <h3 id="live-sources-title">Checked, and where these numbers came from</h3>
      <div className="live-check" data-testid="live-crosscheck">
        <p className="caps">Cross-check</p>
        <h4>The Caldor fire, computed twice</h4>
        <div className="live-check-figures">
          <div className="live-check-total">
            <p className="caps">This live build</p>
            <p className="live-check-figure">2,250</p>
            <p className="live-check-unit">acres that can&rsquo;t reseed</p>
          </div>
          <div className="live-check-total">
            <p className="caps">California&rsquo;s pipeline</p>
            <p className="live-check-figure">2,239</p>
            <p className="live-check-unit">from California&rsquo;s own data</p>
          </div>
          <div className="live-check-total">
            <p className="caps">Difference</p>
            <p className="live-check-figure">+0.5%</p>
          </div>
        </div>
        <p className="detail">
          Caldor burned in California in 2021, so both implementations can run on it: this browser build,
          from national services, and the Python pipeline, from California&rsquo;s own data. They were
          written independently and land within half a percent of each other on the same fire. That is two
          implementations of one method agreeing &mdash; not a check against ground truth, and not a check
          against a published figure.
        </p>
        <p className="live-check-note">
          No published figure yet for the fire on this page. CAL FIRE publishes its assessment for
          California annually and statewide, not fire by fire. Seed weights and prices are CAL FIRE&rsquo;s;
          species it doesn&rsquo;t list show trees, not seed.
        </p>
      </div>
      <p className="section-lede">
        This fire was built in your browser a moment ago, from national public services, at {Math.round(build.groundRes)} m
        cells. The steps are California&rsquo;s; four inputs are national stand-ins for California&rsquo;s own:
      </p>
      <dl className="live-diffs">
        <div>
          <dt>Whose land</dt>
          <dd>Non-federal land in PAD-US, where California uses CAL FIRE&rsquo;s State Responsibility Area.</dd>
        </div>
        <div>
          <dt>Which trees</dt>
          <dd>
            The conifer with the most basal area in the USFS Individual Tree Species maps; where those are blank, the
            FIA forest type group. California uses LEMMA.
          </dd>
        </div>
        <div>
          <dt>Seed zones</dt>
          <dd>The provisional national seed zones (Bower et al. 2014), where California uses its own map.</dd>
        </div>
      </dl>
      <div className="region-table-wrap">
        <table className="region-table">
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Source</th>
              <th scope="col">Service</th>
              <th scope="col" className="num">Time</th>
            </tr>
          </thead>
          <tbody>
            {build.steps.map((s) => (
              <tr key={s.key}>
                <th scope="row">{s.label}</th>
                <td>{s.source}</td>
                <td>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {host(s.url)}
                    </a>
                  ) : (
                    'this browser'
                  )}
                </td>
                <td className="num">{secs(s.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="region-note">Built {new Date(build.builtAt).toLocaleString()}.</p>
    </section>
  )
}
