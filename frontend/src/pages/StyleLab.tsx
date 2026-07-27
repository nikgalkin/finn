import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { isTextInputTarget } from '../lib/hotkeys';
import {
  readVisualPreferences,
  selectLoader,
  selectLogo,
  subscribeToVisualPreferences,
  type LoaderChoice,
  type LogoChoice,
} from '../lib/visualPreferences';
import {
  FinnHatLeftWordmark,
  FinnHatLetterWordmark,
  FinnHatWordmark,
} from './components/LogoConcepts';
import { Spinner } from './components/PageLoader';
import { StickyPageHeader } from './components/StickyPageHeader';

export default function StyleLab() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(readVisualPreferences);

  useEffect(
    () => subscribeToVisualPreferences(setPreferences),
    [],
  );

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
              2 loaders · 3 brand marks · saved on this device
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
          <div className="style-lab-live-stage">
            <Spinner character={preferences.loader} label="Loading tool" size={64} />
            <span>Loading tool…</span>
          </div>
        </div>
      </section>

      <section className="style-lab-section">
        <div className="style-lab-section-heading">
          <h3>LOGO</h3>
          <p>Select the version shown in the application header.</p>
        </div>

        <div className="style-lab-brand-grid">
          <button
            type="button"
            className={`glass-panel style-lab-choice style-lab-brand-choice${preferences.logo === 'hat-dot' ? ' is-selected' : ''}`}
            aria-pressed={preferences.logo === 'hat-dot'}
            onClick={() => chooseLogo('hat-dot')}
          >
            {preferences.logo === 'hat-dot' && (
              <span className="style-lab-selected"><Check size={12} /> Selected</span>
            )}
            <span className="style-lab-brand-preview"><FinnHatWordmark /></span>
            <span className="style-lab-choice-copy">
              <strong>Hat Dot</strong>
              <small>The Finn hat is tucked above the letter i.</small>
            </span>
          </button>

          <button
            type="button"
            className={`glass-panel style-lab-choice style-lab-brand-choice${preferences.logo === 'hat-left' ? ' is-selected' : ''}`}
            aria-pressed={preferences.logo === 'hat-left'}
            onClick={() => chooseLogo('hat-left')}
          >
            {preferences.logo === 'hat-left' && (
              <span className="style-lab-selected"><Check size={12} /> Selected</span>
            )}
            <span className="style-lab-brand-preview"><FinnHatLeftWordmark /></span>
            <span className="style-lab-choice-copy">
              <strong>Hat Left</strong>
              <small>The hat becomes a standalone mark beside the name.</small>
            </span>
          </button>

          <button
            type="button"
            className={`glass-panel style-lab-choice style-lab-brand-choice${preferences.logo === 'f-in-hat' ? ' is-selected' : ''}`}
            aria-pressed={preferences.logo === 'f-in-hat'}
            onClick={() => chooseLogo('f-in-hat')}
          >
            {preferences.logo === 'f-in-hat' && (
              <span className="style-lab-selected"><Check size={12} /> Selected</span>
            )}
            <span className="style-lab-brand-preview"><FinnHatLetterWordmark /></span>
            <span className="style-lab-choice-copy">
              <strong>F in Hat</strong>
              <small>The hat carries the first letter of Finn.</small>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
