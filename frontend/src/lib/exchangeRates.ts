import type { FxQuoteDirection } from './financialCalculators';

type CurrencyRateResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type CurrencyRateFetcher = (url: string) => Promise<CurrencyRateResponse>;

export type FetchedCurrencyQuote = {
  rate: number;
  direction: FxQuoteDirection;
};

const apiCurrency = (currency: string) => currency.trim().toLowerCase();

export const fetchLatestCurrencyRates = async (
  baseCurrency: string,
  fetcher: CurrencyRateFetcher = fetch
): Promise<Record<string, number>> => {
  const base = apiCurrency(baseCurrency);
  if (!base) throw new Error('A base currency is required');
  const encodedBase = encodeURIComponent(base);

  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${encodedBase}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${encodedBase}.json`
  ];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(`Exchange rate request failed with status ${response.status}`);

      const responseData = await response.json();
      if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
        throw new Error('Exchange rate response is invalid');
      }

      const rates = (responseData as Record<string, unknown>)[base];
      if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
        throw new Error('Exchange rate response does not contain rates');
      }

      return rates as Record<string, number>;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All exchange rate sources failed');
};

export const getFetchedCurrencyRate = (
  rates: Record<string, number>,
  currency: string
): number | null => {
  const target = apiCurrency(currency);
  const directRate = rates[target] ?? rates[target.toUpperCase()];
  const fallbackRate = target === 'usdt' ? rates.usd ?? rates.USD : undefined;
  const rate = Number(directRate ?? fallbackRate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

export const getFetchedCurrencyQuote = (
  rates: Record<string, number>,
  buyCurrency: string,
  preferredDirection?: FxQuoteDirection,
): FetchedCurrencyQuote | null => {
  const buyPerSpend = getFetchedCurrencyRate(rates, buyCurrency);
  if (buyPerSpend === null) return null;

  const spendPerBuy = 1 / buyPerSpend;
  const direction = preferredDirection
    ?? (spendPerBuy >= 1 ? 'spend-per-buy' : 'buy-per-spend');
  return {
    direction,
    rate: direction === 'spend-per-buy' ? spendPerBuy : buyPerSpend,
  };
};
