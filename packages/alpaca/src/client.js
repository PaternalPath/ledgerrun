/**
 * Alpaca Paper Trading API Client
 * Minimal implementation using built-in fetch (Node 18+)
 */

const PAPER_BASE_URL = "https://paper-api.alpaca.markets";
const DATA_BASE_URL = "https://data.alpaca.markets";

export class AlpacaClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.ALPACA_API_KEY;
    this.apiSecret = config.apiSecret || process.env.ALPACA_API_SECRET;
    this.baseUrl = config.paper !== false ? PAPER_BASE_URL : PAPER_BASE_URL;

    if (!this.apiKey || !this.apiSecret) {
      throw new Error("ALPACA_API_KEY and ALPACA_API_SECRET are required");
    }
  }

  _headers() {
    return {
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.apiSecret,
      "Content-Type": "application/json",
    };
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this._headers(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alpaca API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  async _fetchData(path, options = {}) {
    const url = `${DATA_BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this._headers(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alpaca Data API error (${response.status}): ${text}`);
    }

    return response.json();
  }

  /**
   * Get account information
   * @returns {Promise<Object>} Account details including cash, equity, etc.
   */
  async getAccount() {
    return this._fetch("/v2/account");
  }

  /**
   * Get all open positions
   * @returns {Promise<Array>} Array of position objects
   */
  async getPositions() {
    return this._fetch("/v2/positions");
  }

  /**
   * Get latest trades for symbols
   * @param {string[]} symbols - Array of symbols to fetch prices for
   * @returns {Promise<Object>} Map of symbol -> latest trade data
   */
  async getLatestTrades(symbols) {
    if (!symbols || symbols.length === 0) {
      return {};
    }

    const symbolsParam = symbols.join(",");
    const data = await this._fetchData(
      `/v2/stocks/trades/latest?symbols=${symbolsParam}&feed=iex`
    );

    return data.trades || {};
  }

  /**
   * Get latest quotes for symbols
   * @param {string[]} symbols - Array of symbols to fetch quotes for
   * @returns {Promise<Object>} Map of symbol -> latest quote data
   */
  async getLatestQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return {};
    }

    const symbolsParam = symbols.join(",");
    const data = await this._fetchData(
      `/v2/stocks/quotes/latest?symbols=${symbolsParam}&feed=iex`
    );

    return data.quotes || {};
  }
}
