import type { MouseEventHandler } from 'react';
import bmoMoneyLoader from '../../assets/bmo-money-loader-trail.png';
import marcelineMoneyLoader from '../../assets/marceline-money-loader-animated.png';
import { useVisualPreferences } from '../../hooks/useVisualPreferences';
import type { LoaderChoice } from '../../lib/visualPreferences';

type PageLoaderProps = {
  label?: string;
};

type SpinnerProps = {
  character?: LoaderChoice;
  label?: string;
  size?: number;
};

type CompactLoaderProps = {
  character?: LoaderChoice;
  className?: string;
  label?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

export function Spinner({ character, label = 'Loading', size = 18 }: SpinnerProps) {
  const preferences = useVisualPreferences();
  const selectedCharacter = character ?? preferences.loader;
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

export function CompactLoader({
  character,
  className = '',
  label = 'Loading',
  onClick,
}: CompactLoaderProps) {
  return (
    <div className={`compact-loader${className ? ` ${className}` : ''}`} onClick={onClick}>
      <Spinner character={character} label={label} size={64} />
      <span>{label}…</span>
    </div>
  );
}

export function PageLoader({ label = 'Loading' }: PageLoaderProps) {
  return (
    <div className="page-loader">
      <Spinner label={label} size={128} />
    </div>
  );
}
