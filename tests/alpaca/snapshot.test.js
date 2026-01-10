import test from "node:test";
import assert from "node:assert/strict";
import { mapAlpacaToSnapshot } from "../../packages/alpaca/src/snapshot.js";

test("mapAlpacaToSnapshot: basic mapping", () => {
  const account = {
    cash: "1234.56",
    equity: "5678.90",
  };

  const positions = [
    {
      symbol: "VTI",
      qty: "10",
      market_value: "2500.00",
    },
    {
      symbol: "VXUS",
      qty: "5",
      market_value: "300.00",
    },
  ];

  const prices = {
    VTI: { p: 250.0 },
    VXUS: { p: 60.0 },
  };

  const snapshot = mapAlpacaToSnapshot(account, positions, prices);

  assert.equal(snapshot.cashUsd, 1234.56);
  assert.equal(snapshot.positions.length, 2);
  assert.equal(snapshot.positions[0].symbol, "VTI");
  assert.equal(snapshot.positions[0].quantity, 10);
  assert.equal(snapshot.positions[0].marketValueUsd, 2500.0);
  assert.equal(snapshot.positions[1].symbol, "VXUS");
  assert.equal(snapshot.positions[1].quantity, 5);
  assert.equal(snapshot.positions[1].marketValueUsd, 300.0);
  assert.equal(snapshot.pricesUsd.VTI, 250.0);
  assert.equal(snapshot.pricesUsd.VXUS, 60.0);
  assert.ok(snapshot.asOfIso);
});

test("mapAlpacaToSnapshot: handles ask price (ap) format", () => {
  const account = { cash: "100.00" };
  const positions = [];
  const prices = {
    SPY: { ap: 450.25 },
  };

  const snapshot = mapAlpacaToSnapshot(account, positions, prices);

  assert.equal(snapshot.pricesUsd.SPY, 450.25);
});

test("mapAlpacaToSnapshot: handles empty positions", () => {
  const account = { cash: "5000.00" };
  const positions = [];
  const prices = {
    VTI: { p: 250.0 },
  };

  const snapshot = mapAlpacaToSnapshot(account, positions, prices);

  assert.equal(snapshot.cashUsd, 5000.0);
  assert.equal(snapshot.positions.length, 0);
  assert.equal(snapshot.pricesUsd.VTI, 250.0);
});

test("mapAlpacaToSnapshot: throws if account missing", () => {
  assert.throws(
    () => mapAlpacaToSnapshot(null, [], {}),
    /Account is required/
  );
});

test("mapAlpacaToSnapshot: throws if positions not array", () => {
  assert.throws(
    () => mapAlpacaToSnapshot({ cash: "100" }, null, {}),
    /Positions must be an array/
  );
});

test("mapAlpacaToSnapshot: throws if prices not object", () => {
  assert.throws(
    () => mapAlpacaToSnapshot({ cash: "100" }, [], null),
    /Prices must be an object/
  );
});
