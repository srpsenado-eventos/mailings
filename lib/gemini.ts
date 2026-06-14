import type { ConteudoFonte, PessoaSite } from "@/lib/types";

export function geminiDisponivel(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** URL sentinela para conteúdo obtido por pesquisa ampla (não é uma fonte oficial). */
export const URL_PESQUISA_AMPLA = "pesquisa-ampla://gemini+google-search";

/** Abstração mínima do cliente — facilita teste e troca de modelo. */
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
  if (!geminiDisponivel() && !cliente) return undefined;
  try {
    const gemini = cliente ?? (await criarCliente(true));
    const resposta = await gemini.gerarJson(montarPromptComposicao(grupoCanonico));
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
  const gemini = cliente ?? (await criarCliente(false));
  const resposta = await gemini.gerarJson(promptComposicao(textoLimpo));
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
  if (!geminiDisponivel() && !cliente) return [];
  try {
    return await extrairComposicaoCore(textoLimpo, cliente);
  } catch {
    return [];
  }
}

function montarPromptComposicao(grupoCanonico: string): string {
  return [
    "Você lista a composição ATUAL de órgãos e cargos públicos brasileiros.",
    `Liste os membros atuais de: ${grupoCanonico}.`,
    "Use a busca para garantir que a informação está atualizada hoje.",
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

/**
 * Cliente Gemini. `comBusca=true` ativa o grounding (Google Search) — usado
 * quando precisamos ir à web (refino e pesquisa ampla). `comBusca=false` pede
 * JSON puro (responseMimeType) — usado na extração a partir de texto já raspado,
 * onde o grounding atrapalharia. As duas configs são exclusivas: a API rejeita
 * googleSearch + responseMimeType juntos.
 */
async function criarCliente(comBusca: boolean): Promise<GeminiCliente> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return {
    async gerarJson(prompt: string) {
      const config = comBusca
        ? { tools: [{ googleSearch: {} }] }
        : { responseMimeType: "application/json" };
      const resp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config,
      });
      return extrairJson(resp.text ?? "[]");
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
