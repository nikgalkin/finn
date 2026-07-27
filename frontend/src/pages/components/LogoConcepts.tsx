const finnHatHoodPath = 'M6.8 39C4.4 32.1 7.2 22.2 5.8 6.4 5.4 2 8.3.8 10.4 4.1c.9 1.5 1.2 3.4 1.2 5.6 8.6-5.3 20.1-5.4 28.7-.7.6-2.7 1.9-5.2 4.2-6 2.1-.7 3.4 1 3 3.5-.8 5.2-2.7 8.5-1.2 14.4 1.4 5.6 1.7 10.6 1.2 14.6 1.7-.9 2.6 0 2.5 1.5-.1 3.5-5.2 5.2-10.7 5.7-9.5.9-17.1-2.7-24.2-3.4-3.3-.3-5.7 2.5-8.3-.3Z';
const finnHatOpeningPath = 'M14.5 14.3C20.2 7.2 31.9 7.3 39.6 13.5c7.3 5.9 9 16 3.4 21.9-5.5 5.8-15.4 4.8-22.3-.2-7.8-5.8-11.2-14.8-6.2-20.9Z';

function OrganicFinnHat({
  className,
  showLetter = false,
}: {
  className: string;
  showLetter?: boolean;
}) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 50 44">
      <path
        className="finn-hat-wordmark__cap-hood"
        d={finnHatHoodPath}
        transform={showLetter ? 'translate(0.2 0)' : undefined}
      />
      <path
        className="finn-hat-wordmark__cap-opening"
        d={finnHatOpeningPath}
        transform={showLetter ? 'translate(0.2 0)' : undefined}
      />
      <path
        className="finn-hat-wordmark__cap-shade"
        d="M15.5 15.3c5.8-6.1 16.1-5.8 23.1-.1 5 4 7.2 10 6 15.2-1.8-5.3-5.7-10.4-11.2-13.6-5.9-3.5-12.4-4.2-17.9-1.5Z"
        transform={showLetter ? 'translate(0.2 0)' : undefined}
      />
      {showLetter && (
        <>
          <path
            className="finn-hat-wordmark__cap-letter"
            d="M16.2 10.4h21.6v6.3H24.2v5h10.7v6.1H24.2v12h-8V10.4Z"
            transform="translate(3 0)"
          />
          <path
            className="finn-hat-wordmark__cap-foreground"
            clipRule="evenodd"
            d={`${finnHatHoodPath} ${finnHatOpeningPath}`}
            fillRule="evenodd"
            transform="translate(0.2 0)"
          />
          <path
            className="finn-hat-wordmark__cap-opening-rim"
            d={finnHatOpeningPath}
            transform="translate(0.2 0)"
          />
        </>
      )}
      <path
        className="finn-hat-wordmark__cap-seam"
        d="M8.7 36.5c7.4-2.5 14.9-.6 21.7.7 5 1 9.4.9 13.3-.9"
        transform={showLetter ? 'translate(0.2 0)' : undefined}
      />
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

export function FinnHatLeftWordmark() {
  return (
    <span aria-label="Finn Tracker" className="finn-hat-left-wordmark" role="img">
      <OrganicFinnHat className="finn-hat-left-wordmark__hat" />
      <span aria-hidden="true">
        Finn <span className="finn-hat-wordmark__tracker">Tracker</span>
      </span>
    </span>
  );
}

export function FinnHatLetterWordmark() {
  return (
    <span
      aria-label="Finn Tracker"
      className="finn-hat-left-wordmark finn-hat-letter-wordmark"
      role="img"
    >
      <OrganicFinnHat
        className="finn-hat-left-wordmark__hat finn-hat-letter-wordmark__hat"
        showLetter
      />
      <span aria-hidden="true">inn <span className="finn-hat-wordmark__tracker">Tracker</span>
      </span>
    </span>
  );
}
