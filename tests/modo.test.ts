import { describe, expect, test } from "vitest";
import { modoDoApp } from "@/lib/modo";

describe("modoDoApp", () => {
  test("sem a variável é local", () => {
    expect(modoDoApp({})).toBe("local");
    expect(modoDoApp({ FISCAL_MODO: "" })).toBe("local");
  });
  test("web só com o valor exato, ignorando caixa e espaços", () => {
    expect(modoDoApp({ FISCAL_MODO: "web" })).toBe("web");
    expect(modoDoApp({ FISCAL_MODO: " WEB " })).toBe("web");
    expect(modoDoApp({ FISCAL_MODO: "producao" })).toBe("local");
  });
  test("na Vercel é sempre web, mesmo sem FISCAL_MODO ou com local", () => {
    expect(modoDoApp({ VERCEL: "1" })).toBe("web");
    expect(modoDoApp({ VERCEL: "1", FISCAL_MODO: "local" })).toBe("web");
  });
  test("sem Vercel e sem variável continua local", () => {
    expect(modoDoApp({})).toBe("local");
  });
});
