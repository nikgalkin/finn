import { LoaderCircle } from 'lucide-react';

type PageLoaderProps = {
  label?: string;
};

type SpinnerProps = {
  label?: string;
  size?: number;
};

export function Spinner({ label = 'Loading', size = 18 }: SpinnerProps) {
  return (
    <span className="app-spinner" role="status" aria-label={label} style={{ width: size, height: size }}>
      <LoaderCircle size={size} aria-hidden="true" />
    </span>
  );
}

export function PageLoader({ label = 'Loading' }: PageLoaderProps) {
  return (
    <div className="page-loader">
      <Spinner label={label} size={32} />
    </div>
  );
}
