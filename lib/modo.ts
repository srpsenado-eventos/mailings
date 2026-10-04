/**
 * Único ponto de decisão entre o app local (varre e grava em .fiscal/) e o app publicado
 * (só exibe o retrato do Blob, atrás de senha). Spec 2026-10-02, §6.2.
 */
export type ModoApp = "local" | "web";

export function modoDoApp(env: Readonly<Record<string, string | undefined>> = process.env): ModoApp {
  return (env.FISCAL_MODO ?? "").trim().toLowerCase() === "web" ? "web" : "local";
}
