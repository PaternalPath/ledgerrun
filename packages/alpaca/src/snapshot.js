/**
 * Snapshot mapper: Alpaca API format -> LedgerRun snapshot format
 */

/**
 * Convert Alpaca account + positions + prices to LedgerRun snapshot
 * @param {Object} account - Alpaca account object
 * @param {Array} positions - Alpaca positions array
 * @param {Object} prices - Map of symbol -> price (from latest trades or quotes)
 * @returns {Object} LedgerRun snapshot
 */
export function mapAlpacaToSnapshot(account, positions, prices) {
  if (!account || typeof account !== "object") {
    throw new Error("Account is required");
  }
  if (!Array.isArray(positions)) {
    throw new Error("Positions must be an array");
  }
  if (!prices || typeof prices !== "object") {
    throw new Error("Prices must be an object");
  }

  const cashUsd = parseFloat(account.cash) || 0;

  const snapshotPositions = positions.map((pos) => {
    const symbol = pos.symbol;
    const quantity = parseFloat(pos.qty) || 0;
    const marketValueUsd = parseFloat(pos.market_value) || 0;

    return {
      symbol,
      quantity,
      marketValueUsd,
    };
  });

  const pricesUsd = {};
  for (const [symbol, priceData] of Object.entries(prices)) {
    if (priceData && typeof priceData === "object") {
      const price = priceData.p || priceData.ap || priceData.price || 0;
      pricesUsd[symbol] = parseFloat(price) || 0;
    } else {
      pricesUsd[symbol] = parseFloat(priceData) || 0;
    }
  }

  return {
    asOfIso: new Date().toISOString(),
    cashUsd: Number(cashUsd.toFixed(2)),
    positions: snapshotPositions,
    pricesUsd,
  };
}

/**
 * Fetch snapshot from Alpaca API
 * @param {AlpacaClient} client - Alpaca client instance
 * @param {string[]} symbols - Symbols to fetch prices for (in addition to positions)
 * @returns {Promise<Object>} LedgerRun snapshot
 */
export async function fetchSnapshot(client, symbols = []) {
  const [account, positions] = await Promise.all([
    client.getAccount(),
    client.getPositions(),
  ]);

  const allSymbols = new Set(symbols);
  for (const pos of positions) {
    allSymbols.add(pos.symbol);
  }

  const symbolsArray = Array.from(allSymbols);
  let prices = {};

  if (symbolsArray.length > 0) {
    try {
      const trades = await client.getLatestTrades(symbolsArray);
      prices = trades;
    } catch (err) {
      console.warn("Failed to fetch latest trades, trying quotes:", err.message);
      try {
        const quotes = await client.getLatestQuotes(symbolsArray);
        prices = quotes;
      } catch (err2) {
        console.warn("Failed to fetch quotes:", err2.message);
      }
    }
  }

  return mapAlpacaToSnapshot(account, positions, prices);
}
