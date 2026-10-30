import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ehArquivoAusente, gravarArquivoAtomico } from "@/lib/armazem";
import { CAMINHO_DECISOES_BLOB, type ClienteBlob } from "@/lib/armazem-blob";
import {
  DecisaoInvalidaError, HISTORICO_VAZIO, registrar,
  type CasoDecidido, type HistoricoDecisoes, type PedidoDeDecisao, type Registro, type RegistroColeta, type RegistroManual,
  type SituacaoNoContatos, type TipoDecisao,
} from "@/lib/decisoes";

/**
 * Onde vivem as decisões do GT (spec 2026-10-30 §4.1.2): `.fiscal/decisoes.json`, fora do git,
 * com escrita atômica, como o retrato, mas nunca substituído pela coleta. Em modo web, a cópia
 * publicada no Blob, só para leitura. Guarda só nomes de autoridades, grupos e o texto do GT.
 */
export interface ArmazemDecisoes {
  /** Ausente vira `HISTORICO_VAZIO`. Lança `DecisoesIlegiveisError` se o arquivo existe e não serve. */
  ler(): Promise<HistoricoDecisoes>;
  gravar(h: HistoricoDecisoes): Promise<void>;
}

export { CAMINHO_DECISOES_BLOB };

/** Caminho relativo à raiz do projeto. A pasta está no .gitignore. */
export const CAMINHO_DECISOES_PADRAO = join(".fiscal", "decisoes.json");

/** O arquivo existe, mas não é um histórico de decisões (JSON quebrado ou estrutura errada). */
export class DecisoesIlegiveisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisoesIlegiveisError";
  }
}

const TIPOS: readonly TipoDecisao[] = ["mesma_pessoa", "pessoas_diferentes", "nao_recebe_convite", "ajustar_contatos"];
const SITUACOES: readonly SituacaoNoContatos[] = ["tratado", "pendente", "reaberto", "sem_efeito"];
const VALIDACOES: readonly RegistroManual["validacao"][] = ["validado", "a_validar"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** `AAAA-MM-DD` de um dia que existe ("2026-02-31" e "2026-13-45" não servem). */
function ehData(v: unknown): v is string {
  if (typeof v !== "string" || !DATA.test(v)) return false;
  const [ano, mes, dia] = v.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Resultado de uma leitura: o valor, ou o motivo (sem nomes de pessoas) por que não serve. */
type Leitura<T> = { ok: true; valor: T } | { ok: false; motivo: string };

const falha = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo });

function objeto(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function ehTextos(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function ehUm<T extends string>(opcoes: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (opcoes as readonly string[]).includes(v);
}

/**
 * Registro manual a partir de um valor externo (corpo da requisição ou arquivo). Devolve um objeto
 * novo só com os campos do registro: o que vier a mais (telefone, e-mail) não é guardado.
 */
export function lerRegistroManual(valor: unknown): Leitura<RegistroManual> {
  const o = objeto(valor);
  if (!o) return falha("o registro não é um objeto");
  if (!ehUm(TIPOS, o.tipo)) return falha(`registro sem tipo válido (${TIPOS.join(", ")})`);
  if (!ehData(o.data)) return falha("registro sem data válida no formato AAAA-MM-DD");
  // Como no formulário: quem decidiu é obrigatório, e só espaços não conta.
  if (typeof o.quem !== "string" || o.quem.trim() === "") return falha("registro sem quem (texto não vazio)");
  if (typeof o.observacao !== "string") return falha("registro sem observacao (texto)");
  if (!ehUm(VALIDACOES, o.validacao)) return falha(`registro sem validacao válida (${VALIDACOES.join(" ou ")})`);
  if (!ehTextos(o.grupos)) return falha("registro sem grupos (lista de textos)");
  if (o.convidaPor !== undefined && typeof o.convidaPor !== "string") return falha("convidaPor deve ser texto");
  if (o.outraPessoa !== undefined && !ehTextos(o.outraPessoa)) return falha("outraPessoa deve ser uma lista de textos");
  return {
    ok: true,
    valor: {
      tipo: o.tipo, data: o.data, quem: o.quem, observacao: o.observacao, validacao: o.validacao, grupos: [...o.grupos],
      ...(o.convidaPor !== undefined ? { convidaPor: o.convidaPor } : {}),
      ...(o.outraPessoa !== undefined ? { outraPessoa: [...o.outraPessoa] } : {}),
    },
  };
}

function lerRegistroColeta(o: Record<string, unknown>): Leitura<RegistroColeta> {
  if (!ehData(o.data)) return falha("coleta sem data válida no formato AAAA-MM-DD");
  if (!ehUm(SITUACOES, o.situacao)) return falha("coleta sem situação válida");
  if (!ehTextos(o.grupos)) return falha("coleta sem grupos (lista de textos)");
  return { ok: true, valor: { tipo: "coleta", data: o.data, situacao: o.situacao, grupos: [...o.grupos] } };
}

function lerRegistro(valor: unknown): Leitura<Registro> {
  const o = objeto(valor);
  if (o?.tipo === "coleta") return lerRegistroColeta(o);
  return lerRegistroManual(valor);
}

function lerCaso(valor: unknown): Leitura<CasoDecidido> {
  const o = objeto(valor);
  if (!o) return falha("caso não é um objeto");
  if (typeof o.id !== "string" || typeof o.nome !== "string") return falha("caso sem id ou nome");
  if (!ehTextos(o.chaves)) return falha("caso sem chaves (lista de textos)");
  if (!Array.isArray(o.registros)) return falha("caso sem registros");
  const registros: Registro[] = [];
  for (const [i, r] of o.registros.entries()) {
    const lido = lerRegistro(r);
    if (!lido.ok) return falha(`registro ${i + 1}: ${lido.motivo}`);
    registros.push(lido.valor);
  }
  return { ok: true, valor: { id: o.id, nome: o.nome, chaves: [...o.chaves], registros } };
}

/** Confere a estrutura inteira e devolve uma cópia só com os campos conhecidos. */
export function validarHistorico(valor: unknown): HistoricoDecisoes {
  const o = objeto(valor);
  if (!o) throw new DecisoesIlegiveisError("decisões: o conteúdo não é um objeto");
  if (o.versao !== 1) throw new DecisoesIlegiveisError("decisões: versão desconhecida");
  if (!Array.isArray(o.casos)) throw new DecisoesIlegiveisError("decisões: sem a lista de casos");
  const casos: CasoDecidido[] = [];
  for (const [i, c] of o.casos.entries()) {
    const lido = lerCaso(c);
    // Só a posição: o motivo vai para o log e não leva nome de pessoa.
    if (!lido.ok) throw new DecisoesIlegiveisError(`decisões: caso ${i + 1}: ${lido.motivo}`);
    casos.push(lido.valor);
  }
  return { versao: 1, casos };
}

function historicoDoTexto(texto: string): HistoricoDecisoes {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new DecisoesIlegiveisError("decisões não são JSON válido");
  }
  return validarHistorico(json);
}

export function armazemDecisoesEmArquivo(caminho: string = join(process.cwd(), CAMINHO_DECISOES_PADRAO)): ArmazemDecisoes {
  return {
    async ler() {
      let texto: string;
      try {
        texto = await readFile(caminho, "utf8");
      } catch (err) {
        if (ehArquivoAusente(err)) return HISTORICO_VAZIO;
        throw err;
      }
      return historicoDoTexto(texto);
    },
    async gravar(h) {
      // Indentado: é um registro que o GT pode querer abrir à mão.
      await gravarArquivoAtomico(caminho, JSON.stringify(h, null, 2));
    },
  };
}

export function armazemDecisoesEmMemoria(inicial: HistoricoDecisoes = HISTORICO_VAZIO): ArmazemDecisoes {
  let atual = inicial;
  return {
    ler: async () => atual,
    gravar: async (h) => {
      atual = h;
    },
  };
}

/** Cópia publicada (modo web). Ausente vira `HISTORICO_VAZIO`; erro do cliente sobe como está. */
export function armazemDecisoesEmBlob(cliente: ClienteBlob): ArmazemDecisoes {
  return {
    async ler() {
      const texto = await cliente.ler(CAMINHO_DECISOES_BLOB);
      return texto === undefined ? HISTORICO_VAZIO : historicoDoTexto(texto);
    },
    async gravar(h) {
      await cliente.gravar(CAMINHO_DECISOES_BLOB, JSON.stringify(h));
    },
  };
}

// Uma atualização por vez neste processo: duas abas (ou a coleta e uma aba) nunca leem o mesmo
// histórico para gravar por cima uma da outra (spec §7, Ponto de atenção 5).
let fila: Promise<unknown> = Promise.resolve();

/**
 * Relê o histórico, aplica `alterar` e grava, em série com as outras atualizações. Quando `alterar`
 * devolve o mesmo objeto, nada é gravado. Erro de leitura (inclusive `DecisoesIlegiveisError`)
 * sobe sem gravar nada.
 */
export function atualizarDecisoes(
  armazem: ArmazemDecisoes,
  alterar: (h: HistoricoDecisoes) => HistoricoDecisoes,
): Promise<HistoricoDecisoes> {
  const vez = fila.then(async () => {
    const atual = await armazem.ler();
    const novo = alterar(atual);
    if (novo !== atual) await armazem.gravar(novo);
    return novo;
  });
  fila = vez.catch(() => undefined);
  return vez;
}

export interface RespostaDecisao {
  status: number;
  corpo: { ok: boolean; message?: string; historico?: HistoricoDecisoes };
}

function lerPedido(corpo: unknown): Leitura<PedidoDeDecisao> {
  const o = objeto(corpo);
  if (!o) return falha("Corpo inválido: esperado { nome, nomes, registro }.");
  if (typeof o.nome !== "string" || o.nome.trim() === "") return falha("Falta o nome da pessoa do caso.");
  if (!ehTextos(o.nomes)) return falha("nomes deve ser uma lista de textos.");
  const registro = lerRegistroManual(o.registro);
  if (!registro.ok) return falha(`Registro inválido: ${registro.motivo}.`);
  if (registro.valor.grupos.every((g) => g.trim() === "")) {
    return falha("Registro inválido: grupos vazio (informe os grupos do caso).");
  }
  if (registro.valor.tipo === "mesma_pessoa" && !registro.valor.convidaPor?.trim()) {
    return falha("Registro inválido: mesma_pessoa exige convidaPor (o grupo do convite).");
  }
  return { ok: true, valor: { nome: o.nome, nomes: [...o.nomes], registro: registro.valor } };
}

const MENSAGEM_ILEGIVEL =
  "O arquivo .fiscal/decisoes.json existe, mas não pôde ser lido. Nada foi gravado: corrija ou guarde o arquivo antes de registrar.";

/**
 * `POST /api/decisoes` sem o HTTP: valida o corpo, relê o histórico, registra e grava. Erro que não
 * é do pedido nem do arquivo sobe para a rota.
 */
export async function tratarRegistroDeDecisao(corpo: unknown, armazem: ArmazemDecisoes): Promise<RespostaDecisao> {
  const pedido = lerPedido(corpo);
  if (!pedido.ok) return { status: 400, corpo: { ok: false, message: pedido.motivo } };
  const { nome, nomes, registro } = pedido.valor;
  try {
    const historico = await atualizarDecisoes(armazem, (h) => registrar(h, nome, nomes, registro));
    return { status: 200, corpo: { ok: true, historico } };
  } catch (err) {
    if (err instanceof DecisaoInvalidaError) return { status: 400, corpo: { ok: false, message: err.message } };
    if (err instanceof DecisoesIlegiveisError) return { status: 500, corpo: { ok: false, message: MENSAGEM_ILEGIVEL } };
    throw err;
  }
}

/** O armazém que o app local usa: arquivo na raiz do projeto em que o `npm run dev` roda. */
export function armazemDecisoesPadrao(): ArmazemDecisoes {
  return armazemDecisoesEmArquivo();
}
