import { strict as assert } from "node:assert";
import { test } from "node:test";
import { gramsFor, valueOf, totalValue } from "../src/lib/prices";

test("reads an explicit weight rather than guessing", () => {
  assert.equal(Math.round(gramsFor("Spinach", "1 large bag (about 10 oz)")), 283);
  assert.equal(gramsFor("Carrots", "450 g"), 450);
  assert.equal(Math.round(gramsFor("Potatoes", "1.5 lb")), 680);
});

test("counts pieces when the user gives a number", () => {
  // The old code priced 1 avocado and 6 avocados identically.
  assert.equal(gramsFor("Avocados", "3"), 510);
  assert.equal(gramsFor("Avocados", "1"), 170);
  assert.ok(valueOf("Avocados", "6").usd > valueOf("Avocados", "1").usd);
});

test("understands bunches, bags, heads and punnets", () => {
  assert.equal(gramsFor("Cilantro", "1 bunch"), 60);
  assert.equal(gramsFor("Mushrooms", "1 punnet"), 230);
  assert.equal(gramsFor("Broccoli", "1 head"), 350);
  assert.equal(gramsFor("Spinach", "2 bags"), 560);
});

test("every estimate rounds down, never up", () => {
  // A family should never be told they saved more than they did.
  for (const [name, qty] of [["Carrots", "3"], ["Spinach", "1 bag"], ["Peaches", "4"]] as const) {
    const v = valueOf(name, qty);
    const exact = (v.grams / 1000) * 100;
    assert.ok(v.usd * 100 <= exact * 100, `${name} rounded up`);
  }
});

test("unknown produce still yields a cautious number, flagged as unrecognised", () => {
  const v = valueOf("Dragonfruit", "2");
  assert.equal(v.recognised, false);
  assert.ok(v.usd > 0 && v.usd < 5, "fallback should stay modest");
});

test("a basket totals to the sum of its parts", () => {
  const basket = [
    { name: "Avocados", quantity: "3" },
    { name: "Peaches", quantity: "4" },
    { name: "Oranges", quantity: "5" },
  ];
  const total = totalValue(basket);
  const parts = basket.reduce((n, i) => n + valueOf(i.name, i.quantity).usd, 0);
  assert.equal(total.usd, Math.round(parts * 100) / 100);
  assert.ok(total.grams > 1000, "three kinds of fruit should be over a kilo");
});

test("'3 in a net bag' counts the avocados, not the bags", () => {
  // From a real scan. Reading the number as a container count tripled the
  // estimate, which is exactly the kind of confident wrong number to avoid.
  assert.equal(gramsFor("Avocado", "about 3 in a net bag"), 510);
  assert.equal(gramsFor("Mushrooms", "2 in a punnet"), 300);

  // The other shape still works: here the number really does count containers.
  assert.equal(gramsFor("Spinach", "2 bags"), 560);
  assert.equal(gramsFor("Mushrooms", "1 punnet"), 230);
  assert.equal(gramsFor("Broccoli", "1 large head"), 350);
});
