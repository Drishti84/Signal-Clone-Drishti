import { describe, expect, it } from "vitest";

import { composePhone } from "@/lib/format";

describe("composePhone", () => {
  it("adds the chosen country code to a plain number", () => {
    expect(composePhone("+91", "98765 43210")).toBe("+919876543210");
  });

  it("keeps a number typed with its own country code", () => {
    expect(composePhone("+91", "+44 7700 900123")).toBe("+447700900123");
  });

  it("does not double the country code when it was typed or pasted", () => {
    expect(composePhone("+91", "91 98765 43210")).toBe("+919876543210");
    expect(composePhone("+91", "+91 98765 43210")).toBe("+919876543210");
  });

  it("drops the leading zero people write for domestic calls", () => {
    expect(composePhone("+91", "098765 43210")).toBe("+919876543210");
  });

  it("leaves a 10-digit number that merely starts with the country code alone", () => {
    expect(composePhone("+91", "9198765432")).toBe("+919198765432");
  });
});
