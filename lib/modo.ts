/**
 * Único ponto de decisão entre o app local (varre e grava em .fiscal/) e o app publicado
 * (só exibe o retrato do Blob, atrás de senha). Spec 2026-10-02, §6.2.
 */
export type ModoApp = "local" | "web";

export function modoDoApp(env: Readonly<Record<string, string | undefined>> = process.env): ModoApp {
  // Na Vercel o app nunca varre: um deploy sem FISCAL_MODO não pode virar ferramenta de
  // varredura pública (spec 2026-10-02, §6.5). Falha fechada.
  if ((env.VERCEL ?? "").trim() !== "") return "web";
  return (env.FISCAL_MODO ?? "").trim().toLowerCase() === "web" ? "web" : "local";
}
