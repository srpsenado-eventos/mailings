import { normalizarTexto } from "@/lib/normalize";
import type { ContatoPlanilha } from "@/lib/types";

/**
 * Passo 1 — alternativas separadas por "ou" numa linha isolada.
 * Ex.: "Eminentíssimo Senhor Cardeal\nou\nEminentíssimo e Reverendíssimo Senhor Cardeal".
 */
function porOu(padrao: string): string[] {
  return padrao.split(/\r?\n\s*ou\s*\r?\n/i);
}

/**
 * Passo 2 — alternativas separadas por " / ". A barra troca só o final: em
 * "Senhor(a) Ministro(a) / Conselheiro(a)" a segunda forma é "Senhor(a) Conselheiro(a)",
 * não "Conselheiro(a)" solto. Por isso o prefixo da primeira alternativa é herdado.
 * A forma curta também entra, pelo viés permissivo declarado no spec.
 */
function porBarra(forma: string): string[] {
  const partes = forma.split(" / ").map((p) => p.trim()).filter((p) => p.length > 0);
  if (partes.length <= 1) return [forma];
  const [primeira, ...resto] = partes;
  const palavras = primeira.split(" ");
  const prefixo = palavras.slice(0, -1).join(" ");
  return [primeira, ...resto.flatMap((p) => (prefixo ? [`${prefixo} ${p}`, p] : [p]))];
}

/**
 * Passo 3 — marcador de gênero colado à palavra: `Senhor(a)`, `Ministro(a)`.
 * Palavra terminada em "o" troca o "o" por "a" (Ministro→Ministra); caso contrário
 * acrescenta (Senhor→Senhora). Irregularidades como Juiz(a)→"Juíza" são absorvidas
 * pela normalização, que remove acentos.
 */
function porGenero(forma: string): string[] {
  const i = forma.indexOf("(a)");
  if (i === -1) return [forma];
  const antes = forma.slice(0, i);
  const depois = forma.slice(i + 3);
  const m = antes.match(/(\S+)$/);
  if (!m) return porGenero(antes + depois); // "(a)" solto: descarta o marcador
  const palavra = m[1];
  const base = antes.slice(0, antes.length - palavra.length);
  const feminino = palavra.endsWith("o") ? `${palavra.slice(0, -1)}a` : `${palavra}a`;
  return [
    ...porGenero(base + palavra + depois),
    ...porGenero(base + feminino + depois),
  ];
}

/**
 * Passo 4 — feminino por extenso: ` (Consulesa)` precedido de espaço, com palavra
 * inteira dentro dos parênteses. Distingue-se do passo 3 porque o marcador `(a)` vem
 * colado à palavra, sem espaço.
 */
function porParenteses(forma: string): string[] {
  const m = forma.match(/(\S+) \(([^)]+)\)/);
  if (!m) return [forma];
  const [inteiro, palavra, alternativa] = m;
  return [
    ...porParenteses(forma.replace(inteiro, palavra)),
    ...porParenteses(forma.replace(inteiro, alternativa)),
  ];
}

/**
 * Passo 5 — placeholders vindos do próprio contato. `[Cargo]` e `[Patente]` usam o campo
 * `cargo`; `[Nome]`, o campo `nome`. Placeholder sem dado correspondente devolve
 * `undefined`: o caso é **não auditável**, e vira `sem_regra` — nunca divergente.
 */
function substituirMarcadores(forma: string, contato: ContatoPlanilha): string | undefined {
  let resultado = forma;
  if (/\[(Cargo|Patente)\]/.test(resultado)) {
    if (!contato.cargo) return undefined;
    resultado = resultado.replace(/\[(Cargo|Patente)\]/g, contato.cargo);
  }
  if (resultado.includes("[Nome]")) {
    resultado = resultado.replace(/\[Nome\]/g, contato.nome);
  }
  return resultado;
}

/**
 * Expande um padrão da tabela de protocolo no conjunto de formas aceitas, normalizadas.
 * Lista vazia significa **não expansível** (padrão vazio, ou placeholder sem dado no
 * contato) — o chamador deve tratar como `sem_regra`, não como divergência.
 */
export function expandirFormas(padrao: string, contato: ContatoPlanilha): string[] {
  const formas = porOu(padrao)
    .flatMap(porBarra)
    .flatMap(porGenero)
    .flatMap(porParenteses)
    .map((f) => substituirMarcadores(f, contato))
    .filter((f): f is string => f !== undefined)
    .map(normalizarTexto)
    .filter((f) => f.length > 0);
  return [...new Set(formas)];
}
