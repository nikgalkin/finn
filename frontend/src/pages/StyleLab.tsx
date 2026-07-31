import { useEffect } from 'react';
import { ArrowLeft, Check, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { isTextInputTarget } from '../lib/hotkeys';
import {
  loaderChoices,
  logoChoices,
  netWorthCardChoices,
  netWorthStripChoices,
  selectLoader,
  selectLogo,
  selectLogoGradient,
  selectNetWorthCard,
  selectNetWorthStrip,
  type LoaderChoice,
  type LogoChoice,
  type NetWorthCardChoice,
  type NetWorthStripChoice,
} from '../lib/visualPreferences';
import { useVisualPreferences } from '../hooks/useVisualPreferences';
import { logoMarks } from './components/logoMarks';
import { CompactLoader, Spinner } from './components/PageLoader';
import { DashboardNetWorthPanel, type NetWorthPanelData } from './components/DashboardNetWorthPanel';
import { StickyPageHeader } from './components/StickyPageHeader';

const logoCopy: Record<LogoChoice, { title: string; hint: string }> = {
  'plain': { title: 'Plain', hint: 'Just Finn Tracker, clean and quiet.' },
  'hat-dot': { title: 'Hat Dot', hint: 'The Finn hat is tucked above the letter i.' },
  'mark': { title: 'Mark', hint: 'Badge only — the same shape as the favicon.' },
  'face': { title: 'Face', hint: 'Chibi Finn looks back at you, tongue out.' },
  'candle': { title: 'Candle', hint: 'A candlestick in the hood: the hat that tracks.' },
};

const netWorthCardCopy: Record<NetWorthCardChoice, { title: string; hint: string }> = {
  'classic': { title: 'Classic', hint: 'Compact totals together, with trend and counters below.' },
  'split': { title: 'Overview', hint: 'Currency strip with organizations listed in full beside it.' },
};

const netWorthStripCopy: Record<NetWorthStripChoice, { title: string; hint: string }> = {
  'allocation': { title: 'Currency split', hint: 'Share of net worth held in each currency.' },
  'flow': { title: 'What moved it', hint: 'This month split into deposits and FX impact.' },
  'history': { title: 'Month history', hint: 'One bar per snapshot, height by size of the change.' },
  'goal': { title: 'Next milestone', hint: 'Progress to the next round number, with a pace estimate.' },
};

const standaloneNetWorthCardChoices = [
  'classic',
] as const satisfies readonly NetWorthCardChoice[];

const stripNetWorthCardChoices = [
  'split',
] as const satisfies readonly NetWorthCardChoice[];

const netWorthSample: NetWorthPanelData = {
  month: '2026-07',
  baseCurrency: 'RUB',
  secondaryCurrency: 'USD',
  totalBase: 12_480_500,
  totalSecondary: 145_320,
  secondaryRate: 85.9,
  monthDelta: { amount: 218_400, percent: 1.78 },
  yearDelta: { amount: 1_842_300, percent: 17.31 },
  organizations: [
    { name: 'Interactive Brokers', value: 3_544_000 },
    { name: 'Tinkoff', value: 2_383_000 },
    { name: 'Freedom Finance', value: 1_834_000 },
    { name: 'Revolut', value: 1_397_000 },
    { name: 'Cash', value: 1_198_000 },
    { name: 'Wise', value: 911_000 },
    { name: 'Deposits', value: 674_000 },
    { name: 'Crypto', value: 539_000 },
  ],
  snapshots: 34,
  allocation: [
    { name: 'RUB', value: 7_363_000 },
    { name: 'USD', value: 2_995_000 },
    { name: 'EUR', value: 1_248_000 },
    { name: 'KZT', value: 561_000 },
    { name: 'GEL', value: 313_000 },
  ],
  flow: {
    previousMonth: '2026-06',
    previousTotal: 12_262_100,
    deposits: 154_600,
    fxImpact: 63_800,
  },
  history: [
    { month: '2025-08', delta: 204_000, percent: 2.1 },
    { month: '2025-09', delta: -51_000, percent: -0.5 },
    { month: '2025-10', delta: 348_000, percent: 3.5 },
    { month: '2025-11', delta: -104_000, percent: -1.0 },
    { month: '2025-12', delta: 602_000, percent: 5.9 },
    { month: '2026-01', delta: 297_000, percent: 2.8 },
    { month: '2026-02', delta: -88_000, percent: -0.8 },
    { month: '2026-03', delta: 512_000, percent: 4.7 },
    { month: '2026-04', delta: 289_000, percent: 2.5 },
    { month: '2026-05', delta: 361_000, percent: 3.1 },
    { month: '2026-06', delta: 142_000, percent: 1.2 },
    { month: '2026-07', delta: 218_400, percent: 1.8 },
  ],
};

function NetWorthCardOption({
  choice,
  isSelected,
  strip,
}: {
  choice: NetWorthCardChoice;
  isSelected: boolean;
  strip: NetWorthStripChoice;
}) {
  return (
    <div className={`glass-panel style-lab-net-worth-choice${isSelected ? ' is-selected' : ''}`}>
      <div className="style-lab-net-worth-head">
        <div className="style-lab-choice-copy">
          <strong>{netWorthCardCopy[choice].title}</strong>
          <small>{netWorthCardCopy[choice].hint}</small>
        </div>
        <button
          type="button"
          className={`btn${isSelected ? ' btn-primary' : ''}`}
          role="radio"
          aria-checked={isSelected}
          onClick={() => selectNetWorthCard(choice)}
        >
          {isSelected ? <><Check size={14} /> Selected</> : 'Use this'}
        </button>
      </div>
      <div className="style-lab-net-worth-preview">
        <DashboardNetWorthPanel variant={choice} strip={strip} data={netWorthSample} />
      </div>
    </div>
  );
}

function NetWorthStripOption({
  choice,
  isSelected,
}: {
  choice: NetWorthStripChoice;
  isSelected: boolean;
}) {
  return (
    <div className={`glass-panel style-lab-net-worth-choice${isSelected ? ' is-selected' : ''}`}>
      <div className="style-lab-net-worth-head">
        <div className="style-lab-choice-copy">
          <strong>{netWorthStripCopy[choice].title}</strong>
          <small>{netWorthStripCopy[choice].hint}</small>
        </div>
        <button
          type="button"
          className={`btn${isSelected ? ' btn-primary' : ''}`}
          role="radio"
          aria-checked={isSelected}
          onClick={() => selectNetWorthStrip(choice)}
        >
          {isSelected ? <><Check size={14} /> Selected</> : 'Use this'}
        </button>
      </div>
      <div className="style-lab-net-worth-preview">
        <DashboardNetWorthPanel variant="split" strip={choice} data={netWorthSample} />
      </div>
    </div>
  );
}

export default function StyleLab() {
  const navigate = useNavigate();
  const preferences = useVisualPreferences();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.key !== 'Escape'
        || isTextInputTarget(event.target)
        || document.querySelector('[data-escape-guard="true"]')
      ) return;

      event.preventDefault();
      event.stopPropagation();
      navigate('/settings');
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [navigate]);

  const chooseLoader = (loader: LoaderChoice) => selectLoader(loader);
  const chooseLogo = (logo: LogoChoice) => selectLogo(logo);

  return (
    <div className="style-lab-page">
      <StickyPageHeader marginBottom="0" compactTop>
        <div className="flex items-center gap-4">
          <Link className="btn" title="Back to Settings" to="/settings"><ArrowLeft size={18} /></Link>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Style Lab</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              {loaderChoices.length} loaders · {logoChoices.length} logos · {netWorthCardChoices.length} net worth cards · saved on this device
            </div>
          </div>
        </div>
        <div className="style-lab-save-status">
          <CheckCircle2 size={15} /> Changes save automatically
        </div>
      </StickyPageHeader>

      <section className="style-lab-section">
        <div className="style-lab-section-heading">
          <h3>LOADERS</h3>
          <p>Select the character used while pages and tools are loading.</p>
        </div>

        <div className="style-lab-loader-grid">
          <button
            type="button"
            className={`glass-panel style-lab-choice style-lab-loader-choice${preferences.loader === 'standard' ? ' is-selected' : ''}`}
            aria-pressed={preferences.loader === 'standard'}
            onClick={() => chooseLoader('standard')}
          >
            {preferences.loader === 'standard' && (
              <span className="style-lab-selected"><Check size={12} /> Selected</span>
            )}
            <span className="style-lab-loader-preview">
              <Spinner character="standard" label="Standard loader preview" size={176} />
            </span>
            <span className="style-lab-choice-copy">
              <strong>Standard</strong>
              <small>Simple rotating ring</small>
            </span>
          </button>

          <button
            type="button"
            className={`glass-panel style-lab-choice style-lab-loader-choice${preferences.loader === 'marceline' ? ' is-selected' : ''}`}
            aria-pressed={preferences.loader === 'marceline'}
            onClick={() => chooseLoader('marceline')}
          >
            {preferences.loader === 'marceline' && (
              <span className="style-lab-selected"><Check size={12} /> Selected</span>
            )}
            <span className="style-lab-loader-preview">
              <Spinner character="marceline" label="Marceline loader preview" size={176} />
            </span>
            <span className="style-lab-choice-copy">
              <strong>Marceline</strong>
              <small>Smooth money-counting loop</small>
            </span>
          </button>

          <button
            type="button"
            className={`glass-panel style-lab-choice style-lab-loader-choice${preferences.loader === 'bmo' ? ' is-selected' : ''}`}
            aria-pressed={preferences.loader === 'bmo'}
            onClick={() => chooseLoader('bmo')}
          >
            {preferences.loader === 'bmo' && (
              <span className="style-lab-selected"><Check size={12} /> Selected</span>
            )}
            <span className="style-lab-loader-preview">
              <Spinner character="bmo" label="BMO loader preview" size={176} />
            </span>
            <span className="style-lab-choice-copy">
              <strong>BMO</strong>
              <small>Pixel motion-trail loop</small>
            </span>
          </button>
        </div>

        <div className="glass-panel style-lab-live-preview">
          <div className="style-lab-live-copy">
            <strong>Compact preview</strong>
            <span>The 64 px loader shown while Finn opens a tool.</span>
          </div>
          <CompactLoader
            character={preferences.loader}
            className="style-lab-live-stage"
            label="Loading tool"
          />
        </div>
      </section>

      <section className="style-lab-section">
        <div className="style-lab-section-heading style-lab-section-heading--with-control">
          <div>
            <h3>LOGO</h3>
            <p>Select the version shown in the application header.</p>
          </div>
          <button
            type="button"
            className="style-lab-gradient-switch"
            role="switch"
            aria-checked={preferences.logoGradient}
            onClick={() => selectLogoGradient(!preferences.logoGradient)}
          >
            <span>Gradient</span>
            <span className="style-lab-gradient-switch__track" aria-hidden="true">
              <span />
            </span>
          </button>
        </div>

        <div className="style-lab-brand-grid">
          {logoChoices.map(choice => {
            const Mark = logoMarks[choice];
            const isSelected = preferences.logo === choice;

            return (
              <button
                key={choice}
                type="button"
                className={`glass-panel style-lab-choice style-lab-brand-choice${isSelected ? ' is-selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => chooseLogo(choice)}
              >
                {isSelected && (
                  <span className="style-lab-selected"><Check size={12} /> Selected</span>
                )}
                <span className="style-lab-brand-preview"><Mark /></span>
                <span className="style-lab-choice-copy">
                  <strong>{logoCopy[choice].title}</strong>
                  <small>{logoCopy[choice].hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="style-lab-section">
        <div className="style-lab-section-heading">
          <h3>NET WORTH CARDS</h3>
          <p>Choose the dashboard layout. Strip-based cards have their content setting grouped with them.</p>
        </div>

        <div className="style-lab-net-worth-groups">
          <div className="style-lab-net-worth-card-groups" role="radiogroup" aria-label="Net worth card layout">
            <div className="style-lab-net-worth-group" role="group" aria-labelledby="standalone-card-group-title">
              <div className="style-lab-net-worth-group-head">
                <div>
                  <h4 id="standalone-card-group-title">Standalone cards</h4>
                  <p>Complete layouts that do not use the strip setting.</p>
                </div>
                <span>{standaloneNetWorthCardChoices.length} layout</span>
              </div>
              <div className="style-lab-net-worth-grid">
                {standaloneNetWorthCardChoices.map(choice => (
                  <NetWorthCardOption
                    key={choice}
                    choice={choice}
                    isSelected={preferences.netWorthCard === choice}
                    strip={preferences.netWorthStrip}
                  />
                ))}
              </div>
            </div>

            <div className="style-lab-net-worth-group is-strip-based" role="group" aria-labelledby="strip-card-group-title">
              <div className="style-lab-net-worth-group-head">
                <div>
                  <h4 id="strip-card-group-title">Cards with a strip</h4>
                  <p>These layouts use the strip content selected directly below.</p>
                </div>
                <span>{stripNetWorthCardChoices.length} layout</span>
              </div>
              <div className="style-lab-net-worth-grid">
                {stripNetWorthCardChoices.map(choice => (
                  <NetWorthCardOption
                    key={choice}
                    choice={choice}
                    isSelected={preferences.netWorthCard === choice}
                    strip={preferences.netWorthStrip}
                  />
                ))}
              </div>

              <div className="style-lab-net-worth-strip-config">
                <div className="style-lab-net-worth-group-head">
                  <div>
                    <h4>Strip content</h4>
                    <p>Used by Overview.</p>
                  </div>
                  <span>{netWorthStripChoices.length} options</span>
                </div>
                <div className="style-lab-net-worth-grid" role="radiogroup" aria-label="Net worth strip content">
                  {netWorthStripChoices.map(choice => (
                    <NetWorthStripOption
                      key={choice}
                      choice={choice}
                      isSelected={preferences.netWorthStrip === choice}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
