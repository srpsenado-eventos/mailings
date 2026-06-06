import type { ConteudoFonte, ResultadoGrupo, Semaforo } from "@/lib/types";

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
 * Refina o veredito da Camada A para casos ambíguos (amarelo) usando Gemini,
 * incluindo pesquisa ampla complementar (§7.3). Degrada para o resultado da
 * Camada A se não houver chave ou se a chamada falhar.
 */
export async function refinarComGemini(
  grupo: ResultadoGrupo,
  fonte: ConteudoFonte,
  cliente?: GeminiCliente,
): Promise<ResultadoGrupo> {
  if (!geminiDisponivel()) return grupo;

  const ambiguos = grupo.contatos.filter((c) => c.semaforo === "amarelo");
  if (ambiguos.length === 0) return grupo;

  try {
    const gemini = cliente ?? (await criarClientePadrao());
    const prompt = montarPrompt(
      fonte,
      ambiguos.map((a) => a.contato.nome),
    );
    const resposta = await gemini.gerarJson(prompt);
    return aplicarRefinamento(grupo, resposta);
  } catch {
    // degradação graciosa — nunca derruba a análise
    return grupo;
  }
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
    const gemini = cliente ?? (await criarClientePadrao());
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

function montarPrompt(fonte: ConteudoFonte, nomes: string[]): string {
  // PII mínima: só nomes (dado público), sem telefone/e-mail no prompt.
  return [
    "Você confere se autoridades constam em uma lista oficial.",
    `Conteúdo oficial (fonte ${fonte.url}):`,
    fonte.textoLimpo.slice(0, 6000),
    "Para cada nome abaixo, responda em JSON {nome, presente: boolean, nomePolitico?: string}.",
    "Se não estiver no conteúdo oficial, use a busca para verificar em fontes públicas amplas.",
    `Nomes: ${nomes.join("; ")}`,
  ].join("\n\n");
}

interface RefinamentoItem {
  nome: string;
  presente: boolean;
  nomePolitico?: string;
}

function isRefinamentoItem(valor: unknown): valor is RefinamentoItem {
  if (typeof valor !== "object" || valor === null) return false;
  const item = valor as Record<string, unknown>;
  return typeof item.nome === "string" && typeof item.presente === "boolean";
}

function aplicarRefinamento(
  grupo: ResultadoGrupo,
  resposta: unknown,
): ResultadoGrupo {
  if (!Array.isArray(resposta)) return grupo;
  const itens = resposta.filter(isRefinamentoItem);
  const porNome = new Map(itens.map((i) => [i.nome, i]));

  return {
    ...grupo,
    contatos: grupo.contatos.map((c) => {
      const item = porNome.get(c.contato.nome);
      if (!item || c.semaforo !== "amarelo") return c;
      const semaforo: Semaforo = item.presente ? "verde" : "vermelho";
      return {
        ...c,
        semaforo,
        origem: "pesquisa_ampla",
        observacao: item.nomePolitico
          ? `Nome político detectado: ${item.nomePolitico}`
          : c.observacao,
      };
    }),
  };
}

async function criarClientePadrao(): Promise<GeminiCliente> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return {
    async gerarJson(prompt: string) {
      const resp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        // NÃO forçar responseMimeType junto com googleSearch: a API rejeita a
        // combinação grounding + JSON schema. Pedimos JSON no prompt e fazemos
        // parse tolerante do texto (que pode vir com cercas ```json).
        config: { tools: [{ googleSearch: {} }] },
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
