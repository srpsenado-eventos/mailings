import { describe, expect, test } from "vitest";
import { cargoDeMinistroDoConvocado } from "@/lib/cargo-convocado";

describe("cargoDeMinistroDoConvocado", () => {
  test("desembargadora convocada do STJ vira ministro do STJ", () => {
    expect(cargoDeMinistroDoConvocado("Desembargadora convocada do Superior Tribunal de Justiça")).toBe(
      "Ministro do Superior Tribunal de Justiça",
    );
  });

  test("desembargador convocado do TST vira ministro do TST", () => {
    expect(cargoDeMinistroDoConvocado("Desembargador convocado do Tribunal Superior do Trabalho")).toBe(
      "Ministro do Tribunal Superior do Trabalho",
    );
  });

  test("cargo que não é de convocado devolve undefined", () => {
    expect(cargoDeMinistroDoConvocado("Ministra do Superior Tribunal de Justiça")).toBeUndefined();
    expect(cargoDeMinistroDoConvocado("Desembargador do Tribunal de Justiça")).toBeUndefined();
    expect(cargoDeMinistroDoConvocado("")).toBeUndefined();
  });
});
