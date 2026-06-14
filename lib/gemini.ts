import type { ConteudoFonte, PessoaSite } from "@/lib/types";

/** True quando há chave de IA configurada (Camada B opcional, via Anthropic). */
export function iaDisponivel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** URL sentinela para conteúdo obtido por pesquisa ampla (não é uma fonte oficial). */
export const URL_PESQUISA_AMPLA = "pesquisa-ampla://anthropic-haiku";

/** Abstração mínima do cliente de IA — facilita teste e troca de modelo/provedor. */
export interface GeminiCliente {
  gerarJson(prompt: string): Promise<unknown>;
}

/**
 * 2ª etapa (§7.3): quando a fonte oficial está inacessível/ausente, busca a
 * composição ATUAL do grupo em fontes públicas amplas via grounding (Google
 * Search) e devolve como `ConteudoFonte` para o matcher determinístico comparar.
 *
 * PII: envia apenas o nome do grupo (dado público) — nunca os contatos da
 * planilha. Degrada para `undefined` (sem chave ou falha), e o orquestrador cai
 * para "fonte inacessível".
 */
export async function pesquisarFonteAmpla(
  grupoCanonico: string,
  cliente?: GeminiCliente,
): Promise<ConteudoFonte | undefined> {
  if (!iaDisponivel() && !cliente) return undefined;
  try {
    const ia = cliente ?? (await criarCliente());
    const resposta = await ia.gerarJson(montarPromptComposicao(grupoCanonico));
    const pessoas = parsePessoas(resposta);
    if (pessoas.length === 0) return undefined;
    return {
      url: URL_PESQUISA_AMPLA,
      textoLimpo: pessoas
        .map((p) => `${p.nome}${p.cargo ? `, ${p.cargo}` : ""}.`)
        .join(" "),
      destaques: pessoas.map((p) => p.nome),
      pessoas: pessoas.map((p) => ({ nome: p.nome, cargo: p.cargo })),
    };
  } catch {
    return undefined;
  }
}

function promptComposicao(textoLimpo: string): string {
  return [
    "Extraia a composição atual (pessoas e cargos) a partir do texto a seguir.",
    "Ignore itens de menu/navegação e seções; inclua apenas pessoas reais.",
    'Responda APENAS um array JSON [{"nome": string, "cargo": string}], sem texto extra.',
    textoLimpo.slice(0, 8000),
  ].join("\n\n");
}

async function extrairComposicaoCore(
  textoLimpo: string,
  cliente?: GeminiCliente,
): Promise<PessoaSite[]> {
  const ia = cliente ?? (await criarCliente());
  const resposta = await ia.gerarJson(promptComposicao(textoLimpo));
  return parsePessoas(resposta).map((p) => ({ nome: p.nome, cargo: p.cargo }));
}

/**
 * Camada B (Fase 2): extrai pessoas estruturadas e limpas a partir do texto já
 * raspado, em qualquer layout. Substitui as `pessoas` determinísticas (que
 * chutam cargo por proximidade) por uma composição correta. Sem chave → `[]`.
 */
export async function extrairComposicaoGemini(
  textoLimpo: string,
  cliente?: GeminiCliente,
): Promise<PessoaSite[]> {
  if (!iaDisponivel() && !cliente) return [];
  try {
    return await extrairComposicaoCore(textoLimpo, cliente);
  } catch {
    return [];
  }
}

function montarPromptComposicao(grupoCanonico: string): string {
  return [
    "Você lista a composição atual conhecida de órgãos e cargos públicos brasileiros.",
    `Liste os membros atuais de: ${grupoCanonico}.`,
    "Use apenas pessoas reais; se não souber com confiança, devolva uma lista vazia.",
    'Responda APENAS um array JSON no formato [{"nome": string, "cargo": string}], sem texto extra.',
  ].join("\n\n");
}

interface PessoaComposicao {
  nome: string;
  cargo?: string;
}

function parsePessoas(resposta: unknown): PessoaComposicao[] {
  if (!Array.isArray(resposta)) return [];
  const pessoas: PessoaComposicao[] = [];
  for (const item of resposta) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.nome !== "string" || o.nome.trim().length === 0) continue;
    pessoas.push({
      nome: o.nome.trim(),
      cargo: typeof o.cargo === "string" && o.cargo.length > 0 ? o.cargo : undefined,
    });
  }
  return pessoas;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODELO_IA = "claude-haiku-4-5";

interface RespostaAnthropic {
  content?: { type: string; text?: string }[];
}

/**
 * Cliente de IA (Anthropic Claude Haiku via Messages API, sem SDK — só `fetch`).
 * `gerarJson` devolve o conteúdo já parseado com tolerância (`extrairJson`).
 * Lança em falta de chave ou HTTP não-OK; os chamadores degradam graciosamente.
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
