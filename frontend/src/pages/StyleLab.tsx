import { useEffect } from 'react';
import { ArrowLeft, Check, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { isTextInputTarget } from '../lib/hotkeys';
import {
  logoChoices,
  selectLoader,
  selectLogo,
  selectLogoGradient,
  type LoaderChoice,
  type LogoChoice,
} from '../lib/visualPreferences';
import { useVisualPreferences } from '../hooks/useVisualPreferences';
import { logoMarks } from './components/logoMarks';
import { CompactLoader, Spinner } from './components/PageLoader';
import { StickyPageHeader } from './components/StickyPageHeader';

const logoCopy: Record<LogoChoice, { title: string; hint: string }> = {
  'plain': { title: 'Plain', hint: 'Just Finn Tracker, clean and quiet.' },
  'hat-dot': { title: 'Hat Dot', hint: 'The Finn hat is tucked above the letter i.' },
  'mark': { title: 'Mark', hint: 'Badge only — the same shape as the favicon.' },
  'face': { title: 'Face', hint: 'Chibi Finn looks back at you, tongue out.' },
  'candle': { title: 'Candle', hint: 'A candlestick in the hood: the hat that tracks.' },
};

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
              2 loaders · {logoChoices.length} logos · saved on this device
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
    </div>
  );
}
