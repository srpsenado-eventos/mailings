import { expect, test } from "vitest";

// Arquivo próprio: o cache de módulos do Vitest é por arquivo, então aqui o `match` é mesmo o primeiro a carregar.
test("carregar match primeiro deixa o rótulo neutro do agrupador definido (sem ciclo de import)", async () => {
  // Act
  await import("@/lib/match");
  const { ROTULO_FISCALIZACAO } = await import("@/lib/agrupador");

  // Assert
  expect(ROTULO_FISCALIZACAO.neutro).toBeTruthy();
});
