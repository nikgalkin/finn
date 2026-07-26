import bubblegumMoneyLoader from '../../assets/bubblegum-money-loader-animated.png';
import marcelineMoneyLoader from '../../assets/marceline-money-loader-animated.png';

type PageLoaderProps = {
  label?: string;
};

type SpinnerProps = {
  character?: 'bubblegum' | 'marceline';
  label?: string;
  size?: number;
};

export function Spinner({ character = 'marceline', label = 'Loading', size = 18 }: SpinnerProps) {
  const isLarge = size >= 48;
  const image = character === 'bubblegum' ? bubblegumMoneyLoader : marcelineMoneyLoader;

  return (
    <span
      className={`app-spinner ${isLarge ? 'app-spinner--large' : 'app-spinner--compact'}`}
      role="status"
      aria-label={label}
      style={{ width: size, height: size, fontSize: size }}
    >
      <span className="app-spinner__scene" aria-hidden="true">
        <img
          className="app-spinner__character"
          src={image}
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
