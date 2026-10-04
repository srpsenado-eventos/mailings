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
});
