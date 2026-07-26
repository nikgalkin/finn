import { Link } from 'react-router-dom';
import { Spinner } from './components/PageLoader';

export default function LoaderDebug() {
  return (
    <div className="loader-debug-page">
      <div className="loader-debug-header">
        <div>
          <p className="loader-debug-eyebrow">Internal preview</p>
          <h2>Loader Debug</h2>
          <p>Compare both money-counting loaders against the real application background.</p>
        </div>
        <Link className="btn" to="/">Back to dashboard</Link>
      </div>

      <div className="loader-debug-grid">
        <section className="glass-panel loader-debug-card">
          <div className="loader-debug-stage">
            <Spinner character="marceline" label="Marceline loader preview" size={176} />
          </div>
          <div>
            <h3>Marceline</h3>
            <p>8-frame counting loop · 128 × 128 source</p>
          </div>
        </section>

        <section className="glass-panel loader-debug-card">
          <div className="loader-debug-stage">
            <Spinner character="bubblegum" label="Bubblegum loader preview" size={176} />
          </div>
          <div>
            <h3>Princess Bubblegum</h3>
            <p>6-frame counting loop · 128 × 128 source</p>
          </div>
        </section>
      </div>
    </div>
  );
}
