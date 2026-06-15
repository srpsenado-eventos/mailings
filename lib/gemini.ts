import type { OrigemDado, PessoaSite } from "@/lib/types";

/** True quando há chave de IA configurada (Camada B opcional, via Anthropic). */
export function iaDisponivel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** URL sentinela para composição obtida sem página oficial (proveniência não-oficial). */
export const URL_PESQUISA_AMPLA = "pesquisa-ampla://anthropic-haiku";

/** Abstração mínima do cliente de IA — facilita teste e troca de modelo/provedor. */
export interface GeminiCliente {
  gerarJson(prompt: string): Promise<unknown>;
}

function promptComposicao(grupoCanonico: string, textoLimpo: string): string {
  return [
    `Você audita a composição ATUAL de "${grupoCanonico}" (órgão/cargo público brasileiro).`,
    "Texto da página oficial (pode estar vazio/incompleto se a página usa JavaScript):",
    textoLimpo.slice(0, 8000) || "(a página não retornou conteúdo legível)",
    "Liste APENAS pessoas reais (ignore menus, seções e links). Para cada uma devolva:",
    "- nome (como aparece no site/oficial), cargo, endereco (institucional, se souber), origem.",
    'origem = "pagina" se o dado veio do texto acima; "conhecimento" se veio do seu conhecimento.',
    "Se não souber a composição com confiança, devolva [].",
    'Responda APENAS JSON: [{"nome":string,"cargo":string,"endereco":string,"origem":"pagina"|"conhecimento"}].',
  ].join("\n\n");
}

function parsePessoasComposicao(resposta: unknown): PessoaSite[] {
  if (!Array.isArray(resposta)) return [];
  const pessoas: PessoaSite[] = [];
  for (const item of resposta) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.nome !== "string" || o.nome.trim().length === 0) continue;
    const origem: OrigemDado = o.origem === "pagina" ? "pagina" : "conhecimento";
    pessoas.push({
      nome: o.nome.trim(),
      cargo: typeof o.cargo === "string" && o.cargo.length > 0 ? o.cargo : undefined,
      endereco: typeof o.endereco === "string" && o.endereco.length > 0 ? o.endereco : undefined,
      origem,
    });
  }
  return pessoas;
}

/**
 * Camada B: composição atual do grupo em UMA chamada. Extrai do texto raspado e
 * completa pelo conhecimento do modelo quando o texto é vazio/insuficiente
 * (páginas JS). Cada pessoa traz `origem`. Sem chave/erro/lista vazia → [].
 * PII: envia só o texto público + nome do grupo — nunca os contatos da planilha.
 */
export async function extrairComposicao(
  grupoCanonico: string,
  textoLimpo: string,
  cliente?: GeminiCliente,
): Promise<PessoaSite[]> {
  if (!iaDisponivel() && !cliente) return [];
  try {
    const ia = cliente ?? (await criarCliente());
    const resposta = await ia.gerarJson(promptComposicao(grupoCanonico, textoLimpo));
    return parsePessoasComposicao(resposta);
  } catch {
    return [];
  }
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODELO_IA = "claude-haiku-4-5";

interface RespostaAnthropic {
  content?: { type: string; text?: string }[];
}

/**
 * Cliente de IA (Anthropic Claude Haiku via Messages API, sem SDK — só `fetch`).
 * `gerarJson` devolve o conteúdo já parseado com tolerância (`extrairJson`).
 */
async function criarCliente(): Promise<GeminiCliente> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");
  return {
    async gerarJson(prompt: string) {
      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODELO_IA,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
      const data = (await resp.json()) as RespostaAnthropic;
      const texto = data.content?.find((b) => b.type === "text")?.text ?? "[]";
      return extrairJson(texto);
    },
  };
}

/** Parse tolerante: remove cercas de código e, se preciso, recorta o 1º array/objeto JSON. */
export function extrairJson(txt: string): unknown {
  const semCercas = txt.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(semCercas);
  } catch {
    const inicio = semCercas.search(/[[{]/);
    const fim = Math.max(semCercas.lastIndexOf("]"), semCercas.lastIndexOf("}"));
    if (inicio >= 0 && fim > inicio) {
      try {
        return JSON.parse(semCercas.slice(inicio, fim + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}
