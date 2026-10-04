import { describe, expect, test } from "vitest";
import { origemPermitida } from "@/lib/origem";

const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });

describe("origemPermitida", () => {
  test("sem cabeçalhos (curl) passa", () => expect(origemPermitida(h({}))).toBe(true));
  test("sec-fetch-site same-origin passa", () => expect(origemPermitida(h({ "sec-fetch-site": "same-origin" }))).toBe(true));
  test("sec-fetch-site none passa", () => expect(origemPermitida(h({ "sec-fetch-site": "none" }))).toBe(true));
  test("sec-fetch-site cross-site não passa", () => expect(origemPermitida(h({ "sec-fetch-site": "cross-site" }))).toBe(false));
  test("sec-fetch-site same-site não passa", () => expect(origemPermitida(h({ "sec-fetch-site": "same-site" }))).toBe(false));
  test("origin com o mesmo host e porta passa", () =>
    expect(origemPermitida(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true));
  test("origin de outro host não passa", () =>
    expect(origemPermitida(h({ origin: "https://outro.com", host: "localhost:3000" }))).toBe(false));
  test("origin null não passa", () => expect(origemPermitida(h({ origin: "null", host: "localhost:3000" }))).toBe(false));
  test("origin malformado não passa", () => expect(origemPermitida(h({ origin: "::::", host: "localhost:3000" }))).toBe(false));
  test("origin sem host não passa", () => expect(origemPermitida(h({ origin: "http://localhost:3000" }))).toBe(false));
});
