import type {
  AchadoEndereco,
  AuditoriaEndereco,
  ContatoPlanilha,
  EnderecoEstruturado,
} from "@/lib/types";
import { normalizarNome } from "@/lib/normalize";
import { classificarCep, formatarCep } from "@/lib/cep";

/**
 * Índice da base de endereços. `porId` é a junção exata; `porNome` existe só para o
 * caso de a planilha de contatos não trazer `Id`, e guarda o CONJUNTO de ids de cada
 * nome — nome que aponta para mais de um id é ambíguo e não recebe endereço.
 */
export interface IndiceEnderecos {
  porId: Map<string, EnderecoEstruturado[]>;
  porNome: Map<string, Set<string>>;
}

export function indexarEnderecos(linhas: EnderecoEstruturado[]): IndiceEnderecos {
  const porId = new Map<string, EnderecoEstruturado[]>();
  const porNome = new Map<string, Set<string>>();
  for (const linha of linhas) {
    porId.set(linha.contatoId, [...(porId.get(linha.contatoId) ?? []), linha]);
    const chave = normalizarNome(linha.nome ?? "");
    if (!chave) continue;
    const ids = porNome.get(chave) ?? new Set<string>();
    ids.add(linha.contatoId);
    porNome.set(chave, ids);
  }
  return { porId, porNome };
}

/** Monta o endereço no formato que o Sistema Contatos usa no campo `Endereço`. */
export function formatarEnderecoContatos(e: EnderecoEstruturado): string {
  const primeira = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const comComplemento = e.complemento ? `${primeira} - ${e.complemento}` : primeira;
  const cep = classificarCep(e.cep, e.uf);
  const digitos = cep.digitos ?? cep.proposto;
  const ultima = [digitos ? formatarCep(digitos) : "", [e.cidade, e.uf].filter(Boolean).join(" - ")]
    .filter((p) => p.length > 0)
    .join(" ");
  return [comComplemento, e.bairro ?? "", ultima].filter((l) => l.trim().length > 0).join("\n");
}

const ROTULOS: Record<AchadoEndereco, string> = {
  sem_linha: "sem endereço cadastrado",
  sem_logradouro: "sem logradouro",
  sem_numero: "sem número",
  sem_bairro: "sem bairro (sai do CEP)",
  cep_ausente: "sem CEP",
  cep_invalido: "CEP inválido",
  cep_recuperavel: "CEP com dígito faltando (proposta pronta)",
  nome_ambiguo: "nome casa mais de um contato — endereço não atribuído",
  sem_prioritario: "vários endereços, nenhum prioritário",
  varios_prioritarios: "vários endereços marcados como prioritários",
};

export function rotuloAchadoEndereco(achado: AchadoEndereco): string {
  return ROTULOS[achado];
}

/** Achados que exigem pessoa: ninguém completa isso sozinho. */
const PENDENCIAS: readonly AchadoEndereco[] = [
  "sem_linha",
  "sem_logradouro",
  "sem_numero",
  "cep_ausente",
  "cep_invalido",
  "sem_prioritario",
  "varios_prioritarios",
];

function escolher(linhas: EnderecoEstruturado[]): { escolhido?: EnderecoEstruturado; achado?: AchadoEndereco } {
  if (linhas.length === 1) return { escolhido: linhas[0] };
  const prioritarios = linhas.filter((l) => l.prioritario);
  if (prioritarios.length === 1) return { escolhido: prioritarios[0] };
  return { achado: prioritarios.length === 0 ? "sem_prioritario" : "varios_prioritarios" };
}

function achadosDe(e: EnderecoEstruturado): AchadoEndereco[] {
  const achados: AchadoEndereco[] = [];
  if (!e.logradouro) achados.push("sem_logradouro");
  if (!e.numero) achados.push("sem_numero");
  const cep = classificarCep(e.cep, e.uf);
  if (cep.situacao === "ausente") achados.push("cep_ausente");
  if (cep.situacao === "invalido") achados.push("cep_invalido");
  if (cep.situacao === "recuperavel") achados.push("cep_recuperavel");
  // Bairro só é "completável" quando há CEP de onde tirá-lo; sem CEP, a pendência é o CEP.
  if (!e.bairro && cep.situacao !== "ausente" && cep.situacao !== "invalido") achados.push("sem_bairro");
  return achados;
}

/**
 * Auditoria de endereço de um contato (Camada D). Eixo separado do semáforo: o
 * resultado nunca entra em `camposDivergentes` nem produz "possível saída". Ver
 * docs/superpowers/specs/2026-10-01-auditoria-de-endereco-camada-d.md
 */
export function auditarEndereco(
  contato: ContatoPlanilha,
  indice?: IndiceEnderecos,
): AuditoriaEndereco {
  if (!indice) return { situacao: "sem_base", achados: [] };

  let linhas: EnderecoEstruturado[] | undefined;
  if (contato.id) {
    linhas = indice.porId.get(contato.id);
  } else {
    const ids = indice.porNome.get(normalizarNome(contato.nome));
    // Nome que casa mais de um contato não recebe endereço: endereço de outra
    // pessoa é pior que endereço ausente (26 de 418 ambíguos, medido em 2026-10-01).
    if (ids && ids.size > 1) return { situacao: "nao_verificado", achados: ["nome_ambiguo"] };
    if (ids && ids.size === 1) linhas = indice.porId.get([...ids][0]);
  }

  if (!linhas || linhas.length === 0) return { situacao: "pendente", achados: ["sem_linha"] };

  const { escolhido, achado } = escolher(linhas);
  if (!escolhido) return { situacao: "pendente", achados: achado ? [achado] : [], linhas: linhas.length };

  const achados = achadosDe(escolhido);
  const situacao = achados.some((a) => PENDENCIAS.includes(a))
    ? "pendente"
    : achados.length > 0
      ? "a_completar"
      : "completo";
  return {
    situacao,
    achados,
    endereco: escolhido,
    formatado: formatarEnderecoContatos(escolhido),
    linhas: linhas.length,
  };
}
