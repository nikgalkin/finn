import type { ReactNode } from 'react';

const finnHatHoodPath = 'M6.8 39C4.4 32.1 7.2 22.2 5.8 6.4 5.4 2 8.3.8 10.4 4.1c.9 1.5 1.2 3.4 1.2 5.6 8.6-5.3 20.1-5.4 28.7-.7.6-2.7 1.9-5.2 4.2-6 2.1-.7 3.4 1 3 3.5-.8 5.2-2.7 8.5-1.2 14.4 1.4 5.6 1.7 10.6 1.2 14.6 1.7-.9 2.6 0 2.5 1.5-.1 3.5-5.2 5.2-10.7 5.7-9.5.9-17.1-2.7-24.2-3.4-3.3-.3-5.7 2.5-8.3-.3Z';
const finnHatOpeningPath = 'M14.5 14.3C20.2 7.2 31.9 7.3 39.6 13.5c7.3 5.9 9 16 3.4 21.9-5.5 5.8-15.4 4.8-22.3-.2-7.8-5.8-11.2-14.8-6.2-20.9Z';

const faceHoodPath = 'M4.2 51.4C2 43.7 2.3 33.8 2.8 22.2c.3-6.2 2.1-10.5 5.5-11.8 4.2-1.6 7.1 1.4 7.8 8.6 10-2.2 22-2.8 33.5-2.1-.1-6.7 1.9-10.6 4.9-10.6 4.4 0 6.1 5.7 6.8 14.1.8 10 2.4 23.8.5 30.7-2.3 8.2-14.2 10.6-28.3 10.8-15.4.2-26.5-.8-29.3-10.5Z';
const faceSkinPath = 'M9.1 37.3c.1-10.5 10.7-17.6 23.7-18 13.7-.4 24.7 6.7 25.2 17.1.6 10.7-9.8 18.7-24.6 19.3-14.5.6-24.4-7.2-24.3-18.4Z';

type HatOpening = 'hollow' | 'candle';

function HatCandle() {
  return (
    <g>
      <path className="finn-hat-wordmark__candle-wick" d="M29.3 10.2v5.1m0 14.6v5.1" />
      <rect
        className="finn-hat-wordmark__candle-body"
        x="23.6"
        y="15.3"
        width="11.4"
        height="14.6"
        rx="2.4"
      />
    </g>
  );
}

function OrganicFinnHat({
  className,
  opening = 'hollow',
}: {
  className: string;
  opening?: HatOpening;
}) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 50 44">
      <path className="finn-hat-wordmark__cap-hood" d={finnHatHoodPath} />
      <path className="finn-hat-wordmark__cap-opening" d={finnHatOpeningPath} />
      <path
        className="finn-hat-wordmark__cap-shade"
        d="M15.5 15.3c5.8-6.1 16.1-5.8 23.1-.1 5 4 7.2 10 6 15.2-1.8-5.3-5.7-10.4-11.2-13.6-5.9-3.5-12.4-4.2-17.9-1.5Z"
      />
      {opening === 'candle' && <HatCandle />}
      <path
        className="finn-hat-wordmark__cap-seam"
        d="M8.7 36.5c7.4-2.5 14.9-.6 21.7.7 5 1 9.4.9 13.3-.9"
      />
    </svg>
  );
}

function FinnFaceMark({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 64 64">
      <path className="finn-face__hood" d={faceHoodPath} />
      <g transform="translate(2.68 5.51) scale(0.92)">
        <path className="finn-face__skin" d={faceSkinPath} />
        <ellipse className="finn-face__eye" cx="20.2" cy="31.7" rx="1.35" ry="1.75" />
        <ellipse className="finn-face__eye" cx="47" cy="29.7" rx="1.35" ry="1.75" />
        <path
          className="finn-face__tongue"
          d="M30 40.35c2.4.5 5.1.45 7.5-.15-.35 5.8-7.1 5.9-7.5.15Z"
        />
        <path className="finn-face__tongue-line" d="M30.2 40.65c.45 5.35 6.5 5.45 7.05-.1" />
        <path
          className="finn-face__smile"
          d="M24.9 37.8c2.8 2 6.1 2.9 9.5 2.8 3.2-.1 5.9-1 8-2.9"
        />
      </g>
    </svg>
  );
}

export function FinnPlainWordmark() {
  return (
    <span aria-label="Finn Tracker" className="finn-plain-wordmark" role="img">
      <span aria-hidden="true">
        Finn <span className="finn-hat-wordmark__tracker">Tracker</span>
      </span>
    </span>
  );
}

export function FinnHatWordmark() {
  return (
    <span aria-label="Finn Tracker" className="finn-hat-wordmark" role="img">
      <span aria-hidden="true">
        F
        <span className="finn-hat-wordmark__i">
          <OrganicFinnHat className="finn-hat-wordmark__cap" />
        </span>
        nn <span className="finn-hat-wordmark__tracker">Tracker</span>
      </span>
    </span>
  );
}

function FinnSideWordmark({ mark }: { mark: ReactNode }) {
  return (
    <span aria-label="Finn Tracker" className="finn-hat-left-wordmark" role="img">
      {mark}
      <span aria-hidden="true">
        Finn <span className="finn-hat-wordmark__tracker">Tracker</span>
      </span>
    </span>
  );
}

export function FinnHatLeftWordmark() {
  return <FinnSideWordmark mark={<OrganicFinnHat className="finn-hat-left-wordmark__hat" />} />;
}

export function FinnCandleWordmark() {
  return (
    <FinnSideWordmark
      mark={<OrganicFinnHat className="finn-hat-left-wordmark__hat" opening="candle" />}
    />
  );
}

export function FinnFaceWordmark() {
  return <FinnSideWordmark mark={<FinnFaceMark className="finn-face-wordmark__face" />} />;
}

export function FinnMark() {
  return (
    <span aria-label="Finn Tracker" className="finn-mark" role="img">
      <FinnFaceMark className="finn-mark__face" />
    </span>
  );
}
