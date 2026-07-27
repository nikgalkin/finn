import bmoMoneyLoader from '../../assets/bmo-money-loader-trail.png';
import marcelineMoneyLoader from '../../assets/marceline-money-loader-animated.png';
import { readVisualPreferences, type LoaderChoice } from '../../lib/visualPreferences';

type PageLoaderProps = {
  label?: string;
};

type SpinnerProps = {
  character?: LoaderChoice;
  label?: string;
  size?: number;
};

export function Spinner({ character, label = 'Loading', size = 18 }: SpinnerProps) {
  const selectedCharacter = character ?? readVisualPreferences().loader;
  const isLarge = size >= 48;
  const images = {
    bmo: bmoMoneyLoader,
    marceline: marcelineMoneyLoader,
  };

  return (
    <span
      className={`app-spinner app-spinner--${selectedCharacter} ${isLarge ? 'app-spinner--large' : 'app-spinner--compact'}`}
      role="status"
      aria-label={label}
      style={{ width: size, height: size, fontSize: size }}
    >
      <span className="app-spinner__scene" aria-hidden="true">
        <img
          className="app-spinner__character"
          src={images[selectedCharacter]}
          alt=""
          draggable={false}
        />
      </span>
    </span>
  );
}

export function PageLoader({ label = 'Loading' }: PageLoaderProps) {
  return (
    <div className="page-loader">
      <Spinner label={label} size={128} />
    </div>
  );
}
