import type { ContatoPlanilha } from "@/lib/types";

/** Corpo JSON do `/api/analise` inválido (estrutura inesperada vinda do cliente). */
export class PayloadInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadInvalidoError";
  }
}

export interface PayloadAnalise {
  arquivoNome: string;
  contatos: ContatoPlanilha[];
}

/** Teto defensivo contra abuso/erro — não é o limite real de uso (uma base tem dezenas/centenas). */
const MAX_CONTATOS = 50_000;

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function textoOpcional(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Converte um item desconhecido vindo do JSON em um ContatoPlanilha seguro (sem `any`). */
function narrowContato(v: unknown): ContatoPlanilha {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    nome: texto(o.nome),
    grupo: texto(o.grupo),
    foto: textoOpcional(o.foto),
    tratamento: textoOpcional(o.tratamento),
    enderecamento: textoOpcional(o.enderecamento),
    telefone: textoOpcional(o.telefone),
    email: textoOpcional(o.email),
    redeSocial: textoOpcional(o.redeSocial),
    endereco: textoOpcional(o.endereco),
    orgao: textoOpcional(o.orgao),
    cargo: textoOpcional(o.cargo),
    departamento: textoOpcional(o.departamento),
  };
}

/**
 * Valida e normaliza o corpo JSON enviado pelo cliente (que faz o parse da planilha no navegador).
 * Lança `PayloadInvalidoError` para qualquer formato inesperado — o route devolve 422 com a mensagem.
 */
export function parsePayloadAnalise(corpo: unknown): PayloadAnalise {
  if (typeof corpo !== "object" || corpo === null) {
    throw new PayloadInvalidoError("Payload ausente ou inválido.");
  }
  const { arquivoNome, contatos } = corpo as Record<string, unknown>;
  if (typeof arquivoNome !== "string" || arquivoNome.length === 0) {
    throw new PayloadInvalidoError("Nome do arquivo ausente.");
  }
  if (!Array.isArray(contatos)) {
    throw new PayloadInvalidoError("Lista de contatos ausente.");
  }
  if (contatos.length > MAX_CONTATOS) {
    throw new PayloadInvalidoError(`Planilha muito grande (máximo ${MAX_CONTATOS} linhas).`);
  }
  return { arquivoNome, contatos: contatos.map(narrowContato) };
}
