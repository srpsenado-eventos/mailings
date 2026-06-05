import type { ConteudoFonte, ResultadoGrupo, Semaforo } from "@/lib/types";

export function geminiDisponivel(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

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
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
        },
      });
      const txt = resp.text ?? "[]";
      return JSON.parse(txt);
    },
  };
}
