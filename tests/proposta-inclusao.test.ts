import { describe, expect, test } from "vitest";
import { ehItemInstitucional } from "@/lib/proposta-inclusao";

describe("ehItemInstitucional", () => {
  test.each([
    "Incidentes de Assunção de Competência",
    "Câmara de Direito Público",
    "Composição da Corte",
    "SECRETARIA DE GESTÃO",
    "Turma Recursal",
    "Plenário",
    "Conselho Nacional",
  ])("reconhece %s como rótulo institucional", (nome) => {
    expect(ehItemInstitucional(nome)).toBe(true);
  });

  test.each(["Ana Câmara", "Maria Turma Silva", "João Corte Real", "Corregedor Silva", "Luís Carlos Balbino Gambogi"])(
    "não confunde a pessoa %s com rótulo",
    (nome) => {
      expect(ehItemInstitucional(nome)).toBe(false);
    },
  );
});
