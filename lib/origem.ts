/** Mesma origem: curl (sem Origin nem Sec-Fetch-Site) passa; página de outro site, não. */
export function origemPermitida(cabecalhos: { get(nome: string): string | null }): boolean {
  const site = cabecalhos.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origem = cabecalhos.get("origin");
  if (!origem) return true;
  try {
    return new URL(origem).host === cabecalhos.get("host");
  } catch {
    return false;
  }
}
