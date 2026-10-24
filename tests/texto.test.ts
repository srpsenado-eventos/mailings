import { describe, expect, test } from "vitest";
import { juntarMensagens, listarEntreAspas } from "@/lib/texto";

describe("listarEntreAspas", () => {
  test("zero, um, dois e três nomes", () => {
    expect(listarEntreAspas([])).toBe("");
    expect(listarEntreAspas(["a"])).toBe('"a"');
    expect(listarEntreAspas(["a", "b"])).toBe('"a" e "b"');
    expect(listarEntreAspas(["a", "b", "c"])).toBe('"a", "b" e "c"');
  });
});

describe("juntarMensagens", () => {
  test("ignora nulos e vazios; sem nada, devolve null", () => {
    expect(juntarMensagens([null, "", null])).toBeNull();
    expect(juntarMensagens([])).toBeNull();
  });

  test("junta as presentes com ' | ', na ordem", () => {
    expect(juntarMensagens(["aviso", null, "erro"])).toBe("aviso | erro");
    expect(juntarMensagens([null, "só uma"])).toBe("só uma");
  });
});
