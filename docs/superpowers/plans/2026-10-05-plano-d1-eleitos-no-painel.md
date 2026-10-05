# Plano D1: Eleitos 2026 no painel. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ler as planilhas de eleitos de 04/10/2026 na Nova varredura, classificar cada eleito (reeleito, troca de Casa, mandato novo, a conferir) contra o Contatos e mostrar isso no painel com a chave "Eleição 2026", seções "a cadastrar"/"a conferir", filtros e export.

**Architecture:** As planilhas são lidas no navegador (`lib/planilha-eleitos.ts`) e viajam no JSON de `/api/analise`. Depois de `analisar`, a rota chama `aplicarEleicao` (`lib/eleitos.ts`, função pura), que classifica pelo `Status do mandato`, casa com os contatos dos grupos de parlamentares e anexa `ResultadoContato.eleicao`; o resultado inteiro vai em `retrato.eleicao`. A apresentação é função pura em `lib/painel-eleicao.ts`; os componentes só renderizam. A eleição não pinta o semáforo.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind, SheetJS (`xlsx`), Vitest, string-similarity (via `pontuarPessoa`).

**Spec:** `docs/superpowers/specs/2026-10-05-eleitos-2026-e-ajustes-prodasen-design.md` (§2 a §5, §7.3 e §10). A tela `/prodasen` (§6) é o Plano D2, fora daqui.

## Global Constraints

- `lib/*.ts` são funções puras: sem JSX, sem hooks, sem `window`; nunca mutam a entrada.
- Sem `any`: `unknown` + narrowing, ou tipo definido.
- Nenhum nome, telefone ou e-mail vai para `console.*` nem para a IA.
- A eleição **não** pinta o semáforo, **não** entra em `comparacoes` nem em `camposDivergentes` e **nunca** cria `possivelSaida`.
- Testes em português, padrão AAA, sem nomes reais (fixtures fictícias), sem internet.
- Gerenciador de pacotes: **npm**. Não commitar `pnpm-lock.yaml` nem `pnpm-workspace.yaml`.
- Texto de observação do nome: `"Nome de urna (TSE): aguarda aprovação do nome político"` (constante `OBSERVACAO_NOME_URNA`).
- Orientação da troca de Casa: `"Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)"` (constante `ORIENTACAO_OUTRA_CASA`).
- O retrato publicado na web vai **sem** `eleicao.deputadosAtuais` (traz e-mail e telefone de gabinete).
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes do PR: `npm test`, `npm run typecheck`, `npm run build`.

## Review Focus

1. Nome curto de urna ("Camilo") casando um senador homônimo de outra UF: o `Departamento` do contato traz a UF por extenso, e UF diferente nunca casa. Teste na Task 2.
2. A mesma pessoa em dois grupos de senadores ("Senadores" e "Presidente do Senado Federal; Senadores"), com o mesmo `Id`: não é ambiguidade; as duas linhas recebem a marca. Teste na Task 2.
3. `Status do mandato` com caixa ou espaço diferente do previsto: normalizado antes de classificar; valor desconhecido vira "a conferir", nunca destino silencioso. Teste na Task 2.
4. Retrato gravado antes desta feature (sem `eleicao`): o painel não mostra a chave nem seções, e nada quebra. Teste na Task 4.
5. A mesma planilha (ou duas de senadores) enviada duas vezes na Nova varredura: vale a última por tipo, sem somar em dobro. Teste na Task 1.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/types.ts` (modificar) | Tipos `CasaLegislativa`, `EleitoPlanilha`, `DeputadoAtual`, `DestinoEleito`, `ContatoDoEleito`, `EleitoClassificado`, `EleicaoContato`, `ResultadoEleicao`; campos `ResultadoContato.eleicao` e `ResultadoAnalise.eleicao` |
| `lib/uf.ts` (criar) | Siglas e nomes por extenso das 27 UFs; `siglaDaUf` |
| `lib/planilha-eleitos.ts` (criar) | Leitura das três planilhas no navegador; `juntarArquivosEleicao`, `resumoArquivoEleicao` |
| `lib/eleitos.ts` (criar) | Classificação e anexação ao resultado (`classificarEleitos`, `aplicarEleicao`) |
| `lib/analise-payload.ts` (modificar) | Narrowing de `eleitos`, `deputadosAtuais`, `arquivosEleicao` |
| `app/api/analise/route.ts` (modificar) | Chama `aplicarEleicao` depois de `analisar` |
| `lib/publicar.ts` (modificar) | Tira `eleicao.deputadosAtuais` do retrato publicado |
| `components/nova-varredura-form.tsx` (modificar) | Passo 3 opcional "Eleição 2026", aceita vários arquivos |
| `lib/painel-eleicao.ts` (criar) | Etiquetas, destaque, detalhe, filtros e seções da eleição |
| `lib/painel.ts` (modificar) | `Filtro` aceita os filtros da eleição; `CampoEtiqueta` ganha `"eleicao"` |
| `lib/export-eleitos.ts` (criar) | `gerarXlsxEleitos` com três abas |
| `components/painel.tsx`, `components/linha-contato.tsx`, `components/secao-eleitos.tsx` (criar), `components/export-buttons.tsx` | Chave, filtros, seções, marca na linha, bloco no detalhe, botão de export |

---

### Task 1: Tipos, UFs e leitura das planilhas de eleição

**Files:**
- Modify: `lib/types.ts` (fim do arquivo e interfaces `ResultadoContato`, `ResultadoAnalise`)
- Create: `lib/uf.ts`, `lib/planilha-eleitos.ts`
- Test: `tests/uf.test.ts`, `tests/planilha-eleitos.test.ts`

**Interfaces:**
- Consumes: `normalizarTexto` (`lib/normalize.ts`), `ColunaFaltanteError` (`lib/planilha.ts`).
- Produces:
  - tipos de `lib/types.ts` abaixo (usados por todas as tasks);
  - `siglaDaUf(texto: string | undefined): string | undefined`, `UF_POR_EXTENSO: Readonly<Record<string, string>>`;
  - `type ArquivoEleicao = { tipo: "senado"; eleitos: EleitoPlanilha[] } | { tipo: "camara"; eleitos: EleitoPlanilha[] } | { tipo: "atuais"; deputados: DeputadoAtual[] }`;
  - `lerPlanilhaEleicao(buffer: ArrayBuffer): ArquivoEleicao`;
  - `class PlanilhaEleicaoDesconhecidaError extends Error`;
  - `interface ArquivoEleicaoLido { nome: string; arquivo: ArquivoEleicao }`;
  - `juntarArquivosEleicao(lidos: readonly ArquivoEleicaoLido[]): { eleitos: EleitoPlanilha[]; deputadosAtuais?: DeputadoAtual[]; arquivosEleicao: string[] }`;
  - `resumoArquivoEleicao(a: ArquivoEleicao): string`.

- [ ] **Step 1: Acrescentar os tipos em `lib/types.ts`**

No fim de `lib/types.ts`:

```ts
/** Casa legislativa de um eleito ou de um grupo de parlamentares. */
export type CasaLegislativa = "senado" | "camara";

/**
 * Uma linha das planilhas `Senadores Eleitos 2026.xlsx` ou `Deputados Federais Eleitos 2026.xlsx`
 * (aba `Eleitos`, geradas na pasta `GT Posse/Eleitos 2026`). Dado público do TSE.
 * Spec 2026-10-05 §2.
 */
export interface EleitoPlanilha {
  casa: CasaLegislativa;
  /** Sigla da UF, como na planilha ("AC"). */
  uf: string;
  nomeUrna: string;
  nomeCompleto: string;
  partido?: string;
  /** Coluna `Situação (TSE)`: "Eleito", "Eleito por QP", "PROJEÇÃO da imprensa (...)". */
  situacaoTse: string;
  /** Coluna `Status do mandato`: base da classificação (spec §4). */
  statusMandato: string;
  baseStatus?: string;
  genero?: string;
  nascimento?: string;
}

/** Uma linha de `Deputados Federais Atuais (57a legislatura).xlsx`, aba `Em exercício`. */
export interface DeputadoAtual {
  uf: string;
  nomeParlamentar: string;
  nomeCivil: string;
  partido?: string;
  sexo?: string;
  condicao?: string;
  eleicao2026?: string;
  email?: string;
  predio?: string;
  sala?: string;
  telefone?: string;
  idCamara?: string;
}

/**
 * Para onde vai cada eleito no cadastro (spec §4): fica no grupo atual (`reeleito`, `outra_casa`),
 * entra no grupo novo (`novo`) ou fica fora do lote até decisão (`conferir`).
 */
export type DestinoEleito = "reeleito" | "outra_casa" | "novo" | "conferir";

/** Linha do Contatos que casou com o eleito. */
export interface ContatoDoEleito {
  grupo: string;
  nome: string;
  id?: string;
}

export interface EleitoClassificado {
  eleito: EleitoPlanilha;
  destino: DestinoEleito;
  /** `Situação (TSE)` começa com "PROJEÇÃO": eleito ainda não homologado pelo TSE. */
  projecao: boolean;
  /** Por que está em `conferir`. */
  motivo?: string;
  /** Linhas do Contatos da pessoa (pode estar em mais de um grupo). Vazio = não está no Contatos. */
  contatos: ContatoDoEleito[];
  /** Mandato novo que já está cadastrado no grupo novo ("Senadores Eleitos" etc.). */
  jaCadastrado?: boolean;
}

/** O que o painel mostra na linha de um contato que é eleito. Não pinta o semáforo. */
export interface EleicaoContato {
  casa: CasaLegislativa;
  destino: DestinoEleito;
  projecao: boolean;
  uf: string;
  partido?: string;
  situacaoTse: string;
  statusMandato: string;
  baseStatus?: string;
  nomeUrna: string;
  motivo?: string;
}

/** Eleição 2026 no retrato. `deputadosAtuais` nunca vai para a web (lib/publicar.ts). */
export interface ResultadoEleicao {
  arquivos: string[];
  eleitos: EleitoClassificado[];
  deputadosAtuais?: DeputadoAtual[];
  /** O grupo "Deputados Federais" existe no Contatos? Sem ele, deputados valem pela planilha. */
  camaraNoContatos: boolean;
}
```

Em `ResultadoContato`, depois de `endereco?: AuditoriaEndereco;`:

```ts
  /** Eleição 2026 (spec 2026-10-05). Eixo próprio: não muda `semaforo`. */
  eleicao?: EleicaoContato;
```

Em `ResultadoAnalise`, depois de `resumo: ResumoAnalise;`:

```ts
  /** Presente só quando a varredura recebeu as planilhas de eleitos. */
  eleicao?: ResultadoEleicao;
```

- [ ] **Step 2: Escrever o teste de `lib/uf.ts`**

`tests/uf.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { siglaDaUf, UF_POR_EXTENSO } from "@/lib/uf";

describe("siglaDaUf", () => {
  test("reconhece o nome por extenso do Departamento, com ou sem acento e caixa", () => {
    expect(siglaDaUf("MARANHÃO")).toBe("MA");
    expect(siglaDaUf("maranhao")).toBe("MA");
    expect(siglaDaUf("Distrito Federal")).toBe("DF");
  });

  test("aceita a própria sigla", () => {
    expect(siglaDaUf("sp")).toBe("SP");
  });

  test("devolve undefined para vazio ou texto que não é UF", () => {
    expect(siglaDaUf(undefined)).toBeUndefined();
    expect(siglaDaUf("")).toBeUndefined();
    expect(siglaDaUf("Senado Federal")).toBeUndefined();
  });

  test("tem as 27 UFs", () => {
    expect(Object.keys(UF_POR_EXTENSO)).toHaveLength(27);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/uf.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/uf"".

- [ ] **Step 4: Implementar `lib/uf.ts`**

```ts
import { normalizarTexto } from "@/lib/normalize";

/** Nome por extenso em maiúsculas, como o Contatos grava no `Departamento` dos senadores. */
export const UF_POR_EXTENSO: Readonly<Record<string, string>> = {
  AC: "ACRE", AL: "ALAGOAS", AP: "AMAPÁ", AM: "AMAZONAS", BA: "BAHIA", CE: "CEARÁ",
  DF: "DISTRITO FEDERAL", ES: "ESPÍRITO SANTO", GO: "GOIÁS", MA: "MARANHÃO", MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL", MG: "MINAS GERAIS", PA: "PARÁ", PB: "PARAÍBA", PR: "PARANÁ",
  PE: "PERNAMBUCO", PI: "PIAUÍ", RJ: "RIO DE JANEIRO", RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL", RO: "RONDÔNIA", RR: "RORAIMA", SC: "SANTA CATARINA", SP: "SÃO PAULO",
  SE: "SERGIPE", TO: "TOCANTINS",
};

const SIGLA_POR_NOME = new Map(Object.entries(UF_POR_EXTENSO).map(([sigla, nome]) => [normalizarTexto(nome), sigla]));

/** Sigla da UF a partir do nome por extenso ou da própria sigla; `undefined` quando não é UF. */
export function siglaDaUf(texto: string | undefined): string | undefined {
  const t = (texto ?? "").trim();
  if (!t) return undefined;
  const sigla = t.toUpperCase();
  if (sigla in UF_POR_EXTENSO) return sigla;
  return SIGLA_POR_NOME.get(normalizarTexto(t));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/uf.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Escrever o teste da leitura das planilhas**

`tests/planilha-eleitos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { ColunaFaltanteError } from "@/lib/planilha";
import {
  juntarArquivosEleicao,
  lerPlanilhaEleicao,
  PlanilhaEleicaoDesconhecidaError,
  resumoArquivoEleicao,
  type ArquivoEleicaoLido,
} from "@/lib/planilha-eleitos";

function montar(abas: Record<string, Record<string, string | number>[]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const eleitoBase = {
  UF: "AC", "Nome de urna": "Fulana Teste", "Nome completo": "Fulana de Tal Teste", "Nome social": "",
  Partido: "PXX", "Situação (TSE)": "Eleito", "Status do mandato": "Reeleição",
  "Base do status": "Eleita em 2018", "Gênero (TSE)": "Feminino", Nascimento: "01/01/1970",
};

describe("lerPlanilhaEleicao", () => {
  test("planilha de senadores eleitos é reconhecida pela coluna '1º suplente'", () => {
    const buf = montar({ Eleitos: [{ ...eleitoBase, "1º suplente": "Suplente Um" }], "Leia-me": [{ a: "x" }] });
    const r = lerPlanilhaEleicao(buf);
    expect(r.tipo).toBe("senado");
    if (r.tipo !== "senado") throw new Error("tipo");
    expect(r.eleitos[0]).toEqual({
      casa: "senado", uf: "AC", nomeUrna: "Fulana Teste", nomeCompleto: "Fulana de Tal Teste", partido: "PXX",
      situacaoTse: "Eleito", statusMandato: "Reeleição", baseStatus: "Eleita em 2018", genero: "Feminino", nascimento: "01/01/1970",
    });
  });

  test("planilha de deputados eleitos não tem '1º suplente'", () => {
    const r = lerPlanilhaEleicao(montar({ Eleitos: [eleitoBase] }));
    expect(r.tipo).toBe("camara");
    if (r.tipo !== "camara") throw new Error("tipo");
    expect(r.eleitos[0].casa).toBe("camara");
  });

  test("planilha de deputados atuais é reconhecida pela aba 'Em exercício'; número vira texto", () => {
    const r = lerPlanilhaEleicao(montar({
      "Em exercício": [{
        UF: "AC", "Nome parlamentar": "Dep Teste", "Nome civil": "Deputado de Teste", Partido: "PXX", Sexo: "Masculino",
        "Condição eleitoral": "Titular", "Eleição 2026 (resumo)": "Eleito senador", "E-mail": "dep.teste@camara.leg.br",
        "Prédio": "4", Sala: "544", Telefone: "3215-5544", "ID Câmara": 123,
      }],
    }));
    expect(r.tipo).toBe("atuais");
    if (r.tipo !== "atuais") throw new Error("tipo");
    expect(r.deputados[0]).toMatchObject({ nomeParlamentar: "Dep Teste", nomeCivil: "Deputado de Teste", predio: "4", sala: "544", idCamara: "123", eleicao2026: "Eleito senador" });
  });

  test("linha sem nome nenhum é ignorada", () => {
    const r = lerPlanilhaEleicao(montar({ Eleitos: [eleitoBase, { ...eleitoBase, "Nome de urna": "", "Nome completo": "" }] }));
    if (r.tipo === "atuais") throw new Error("tipo");
    expect(r.eleitos).toHaveLength(1);
  });

  test("coluna obrigatória ausente é erro claro", () => {
    const { ["Status do mandato"]: _fora, ...semStatus } = eleitoBase;
    expect(() => lerPlanilhaEleicao(montar({ Eleitos: [semStatus] }))).toThrow(ColunaFaltanteError);
  });

  test("planilha sem as abas esperadas é recusada", () => {
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(PlanilhaEleicaoDesconhecidaError);
  });
});

describe("juntarArquivosEleicao", () => {
  const senado = (n: number): ArquivoEleicaoLido => ({
    nome: `senado-${n}.xlsx`,
    arquivo: { tipo: "senado", eleitos: Array.from({ length: n }, () => ({ casa: "senado" as const, uf: "AC", nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Reeleição" })) },
  });

  test("vale o último arquivo de cada tipo, sem somar em dobro", () => {
    const r = juntarArquivosEleicao([senado(2), senado(3)]);
    expect(r.eleitos).toHaveLength(3);
    expect(r.arquivosEleicao).toEqual(["senado-3.xlsx"]);
    expect(r.deputadosAtuais).toBeUndefined();
  });

  test("junta senado, câmara e atuais", () => {
    const r = juntarArquivosEleicao([
      senado(1),
      { nome: "camara.xlsx", arquivo: { tipo: "camara", eleitos: [] } },
      { nome: "atuais.xlsx", arquivo: { tipo: "atuais", deputados: [] } },
    ]);
    expect(r.arquivosEleicao).toEqual(["senado-1.xlsx", "camara.xlsx", "atuais.xlsx"]);
    expect(r.deputadosAtuais).toEqual([]);
  });
});

describe("resumoArquivoEleicao", () => {
  test("descreve cada tipo com a contagem", () => {
    expect(resumoArquivoEleicao({ tipo: "senado", eleitos: [] })).toBe("0 senadores eleitos");
    expect(resumoArquivoEleicao({ tipo: "camara", eleitos: [] })).toBe("0 deputados federais eleitos");
    expect(resumoArquivoEleicao({ tipo: "atuais", deputados: [] })).toBe("0 deputados federais em exercício");
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx vitest run tests/planilha-eleitos.test.ts`
Expected: FAIL, import de `@/lib/planilha-eleitos` não resolvido.

- [ ] **Step 8: Implementar `lib/planilha-eleitos.ts`**

```ts
import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";
import type { CasaLegislativa, DeputadoAtual, EleitoPlanilha } from "@/lib/types";

/**
 * Leitura, no navegador, das planilhas de `GT Posse/Eleitos 2026` (spec 2026-10-05 §2).
 * Mesmo padrão de `lib/planilha-enderecos.ts`: cabeçalho casado normalizado e coluna
 * ausente como erro claro. O tipo é reconhecido pela aba e pelas colunas, não pelo nome do arquivo.
 */
export type ArquivoEleicao =
  | { tipo: "senado"; eleitos: EleitoPlanilha[] }
  | { tipo: "camara"; eleitos: EleitoPlanilha[] }
  | { tipo: "atuais"; deputados: DeputadoAtual[] };

export interface ArquivoEleicaoLido {
  nome: string;
  arquivo: ArquivoEleicao;
}

export class PlanilhaEleicaoDesconhecidaError extends Error {
  constructor() {
    super("Planilha não reconhecida: esperada a aba \"Eleitos\" (senadores ou deputados eleitos) ou \"Em exercício\" (deputados atuais).");
    this.name = "PlanilhaEleicaoDesconhecidaError";
  }
}

const COLUNAS_ELEITOS = {
  uf: "uf", nomeUrna: "nome de urna", nomeCompleto: "nome completo", partido: "partido",
  situacaoTse: "situacao (tse)", statusMandato: "status do mandato", baseStatus: "base do status",
  genero: "genero (tse)", nascimento: "nascimento",
} as const;
const OBRIGATORIAS_ELEITOS = ["uf", "nomeUrna", "nomeCompleto", "situacaoTse", "statusMandato"] as const;

const COLUNAS_ATUAIS = {
  uf: "uf", nomeParlamentar: "nome parlamentar", nomeCivil: "nome civil", partido: "partido", sexo: "sexo",
  condicao: "condicao eleitoral", eleicao2026: "eleicao 2026 (resumo)", email: "e-mail", predio: "predio",
  sala: "sala", telefone: "telefone", idCamara: "id camara",
} as const;
const OBRIGATORIAS_ATUAIS = ["uf", "nomeParlamentar", "nomeCivil"] as const;

/** Coluna que só a planilha de senadores tem. */
const MARCA_SENADO = normalizarTexto("1º suplente");

function cabecalhos(ws: XLSX.WorkSheet): Map<string, number> {
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const primeira = (linhas[0] ?? []).map((c) => String(c ?? ""));
  return new Map(primeira.map((c, i) => [normalizarTexto(c), i]));
}

function lerTabela<K extends string>(ws: XLSX.WorkSheet, mapa: Record<K, string>, obrigatorias: readonly K[]): Record<K, string>[] {
  const idx = cabecalhos(ws);
  const faltantes = obrigatorias.filter((c) => !idx.has(mapa[c])).map((c) => mapa[c]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);
  const brutas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }).slice(1);
  const chaves = Object.keys(mapa) as K[];
  return brutas.map((linha) =>
    Object.fromEntries(
      chaves.map((c) => {
        const i = idx.get(mapa[c]);
        return [c, i === undefined ? "" : String(linha[i] ?? "").trim()];
      }),
    ) as Record<K, string>,
  );
}

const opcional = (v: string): string | undefined => (v.length > 0 ? v : undefined);

function aba(wb: XLSX.WorkBook, alvo: string): XLSX.WorkSheet | undefined {
  const nome = wb.SheetNames.find((n) => normalizarTexto(n) === alvo);
  return nome ? wb.Sheets[nome] : undefined;
}

export function lerPlanilhaEleicao(buffer: ArrayBuffer): ArquivoEleicao {
  const wb = XLSX.read(buffer, { type: "array" });

  const atuais = aba(wb, "em exercicio");
  if (atuais) {
    const deputados = lerTabela(atuais, COLUNAS_ATUAIS, OBRIGATORIAS_ATUAIS)
      .filter((l) => l.nomeParlamentar || l.nomeCivil)
      .map((l): DeputadoAtual => ({
        uf: l.uf.toUpperCase(), nomeParlamentar: l.nomeParlamentar, nomeCivil: l.nomeCivil,
        partido: opcional(l.partido), sexo: opcional(l.sexo), condicao: opcional(l.condicao),
        eleicao2026: opcional(l.eleicao2026), email: opcional(l.email), predio: opcional(l.predio),
        sala: opcional(l.sala), telefone: opcional(l.telefone), idCamara: opcional(l.idCamara),
      }));
    return { tipo: "atuais", deputados };
  }

  const eleitosAba = aba(wb, "eleitos");
  if (!eleitosAba) throw new PlanilhaEleicaoDesconhecidaError();
  const casa: CasaLegislativa = cabecalhos(eleitosAba).has(MARCA_SENADO) ? "senado" : "camara";
  const eleitos = lerTabela(eleitosAba, COLUNAS_ELEITOS, OBRIGATORIAS_ELEITOS)
    .filter((l) => l.nomeUrna || l.nomeCompleto)
    .map((l): EleitoPlanilha => ({
      casa, uf: l.uf.toUpperCase(), nomeUrna: l.nomeUrna, nomeCompleto: l.nomeCompleto,
      partido: opcional(l.partido), situacaoTse: l.situacaoTse, statusMandato: l.statusMandato,
      baseStatus: opcional(l.baseStatus), genero: opcional(l.genero), nascimento: opcional(l.nascimento),
    }));
  return casa === "senado" ? { tipo: "senado", eleitos } : { tipo: "camara", eleitos };
}

/** Junta os arquivos lidos; vale o último de cada tipo (trocar o arquivo não soma em dobro). */
export function juntarArquivosEleicao(lidos: readonly ArquivoEleicaoLido[]): {
  eleitos: EleitoPlanilha[];
  deputadosAtuais?: DeputadoAtual[];
  arquivosEleicao: string[];
} {
  const ultimo = new Map<ArquivoEleicao["tipo"], ArquivoEleicaoLido>();
  for (const l of lidos) ultimo.set(l.arquivo.tipo, l);
  const escolhidos = [...ultimo.values()];
  const eleitos = escolhidos.flatMap((l) => (l.arquivo.tipo === "atuais" ? [] : l.arquivo.eleitos));
  const atuais = ultimo.get("atuais");
  return {
    eleitos,
    ...(atuais && atuais.arquivo.tipo === "atuais" ? { deputadosAtuais: atuais.arquivo.deputados } : {}),
    arquivosEleicao: escolhidos.map((l) => l.nome),
  };
}

export function resumoArquivoEleicao(a: ArquivoEleicao): string {
  if (a.tipo === "senado") return `${a.eleitos.length} senadores eleitos`;
  if (a.tipo === "camara") return `${a.eleitos.length} deputados federais eleitos`;
  return `${a.deputados.length} deputados federais em exercício`;
}
```

Observação: o `Map` guarda a ordem da primeira inserção de cada tipo; `ultimo.set` sobre uma chave existente troca o valor sem mudar a posição, o que dá a ordem esperada no segundo teste de `juntarArquivosEleicao`.

- [ ] **Step 9: Rodar e ver passar; typecheck**

Run: `npx vitest run tests/uf.test.ts tests/planilha-eleitos.test.ts && npm run typecheck`
Expected: PASS em todos; typecheck sem erro.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/uf.ts lib/planilha-eleitos.ts tests/uf.test.ts tests/planilha-eleitos.test.ts
git commit -m "feat: leitura das planilhas de eleitos 2026 e tipos da eleição

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Classificação dos eleitos (`lib/eleitos.ts`)

**Files:**
- Modify: `lib/match.ts` (exportar `pontuarPessoa`, já exportada; nada a mudar se já estiver)
- Create: `lib/eleitos.ts`
- Test: `tests/eleitos.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1; `siglaDaUf` (`lib/uf.ts`); `normalizarNome`, `normalizarTexto` (`lib/normalize.ts`); `pontuarPessoa` (`lib/match.ts`).
- Produces:
  - `OBSERVACAO_NOME_URNA: string`, `ORIENTACAO_OUTRA_CASA: string`;
  - `classificarEleitos(eleitos: readonly EleitoPlanilha[], grupos: readonly ResultadoGrupo[], deputadosAtuais?: readonly DeputadoAtual[]): EleitoClassificado[]`;
  - `aplicarEleicao(resultado: ResultadoAnalise, eleitos: readonly EleitoPlanilha[], arquivos: readonly string[], deputadosAtuais?: readonly DeputadoAtual[]): ResultadoAnalise`, que devolve o resultado com `eleicao` e com `ResultadoContato.eleicao` nas linhas casadas.

Regras (spec §4):

| `Status do mandato` normalizado | destino | casa onde a pessoa está hoje |
|---|---|---|
| `reeleicao`, `atual deputado (suplente em exercicio)`, `mandato novo (em exercicio como 1º suplente)` | `reeleito` | a própria casa do eleito |
| `mandato novo (atual deputado federal)`, `mandato novo (atual senador)` | `outra_casa` | a outra casa |
| `mandato novo` | `novo` | nenhuma |
| `mandato novo (verificar)` | `conferir` ("Planilha pede verificação: provável deputado estadual ou distrital") | |
| qualquer outro | `conferir` (`Status do mandato não previsto: "<valor>"`) | |

Grupos do Contatos por casa: `normalizarTexto(grupo)` começando com `ex-` ou `ex ` não conta; contendo `eleit` é grupo novo (casa `senado` se tem `senador`, `camara` se tem `deputad`); senão, contendo `senadores` é `senado`; contendo `deputados federais` é `camara`.

Casamento contato × eleito: se a UF do `Departamento` do contato é reconhecida e difere da UF do eleito, não casa. Senão casa se `normalizarNome` do contato é igual ao de `nomeUrna` ou `nomeCompleto`, ou se `pontuarPessoa(contato.nome, nome) >= 1` para um dos dois.

Pessoas distintas casadas (chave `id` do contato ou, sem id, `normalizarNome`) maiores que 1 → `conferir` ("Nome casa mais de um contato do Contatos").

- [ ] **Step 1: Escrever os testes**

`tests/eleitos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { aplicarEleicao, classificarEleitos, ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import type { ContatoPlanilha, DeputadoAtual, EleitoPlanilha, ResultadoAnalise, ResultadoContato, ResultadoGrupo } from "@/lib/types";

const eleito = (over: Partial<EleitoPlanilha> = {}): EleitoPlanilha => ({
  casa: "senado", uf: "MA", nomeUrna: "Joana Fictícia", nomeCompleto: "Joana Maria Fictícia Souza",
  situacaoTse: "Eleito", statusMandato: "Reeleição", ...over,
});
const linha = (contato: ContatoPlanilha): ResultadoContato => ({
  contato, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, contatos: ContatoPlanilha[]): ResultadoGrupo => ({
  grupo: nome, semFonte: false, contatos: contatos.map(linha), novos: [],
});
const senadores = (...cs: ContatoPlanilha[]) => grupo("Senadores", cs);
const joana: ContatoPlanilha = { id: "10", nome: "Joana Fictícia", grupo: "Senadores", departamento: "MARANHÃO" };
const dest = (r: ReturnType<typeof classificarEleitos>) => r.map((x) => x.destino);

describe("classificarEleitos: destino pelo Status do mandato", () => {
  test("reeleição no grupo atual fica como reeleito e aponta a linha do Contatos", () => {
    const [r] = classificarEleitos([eleito()], [senadores(joana)]);
    expect(r.destino).toBe("reeleito");
    expect(r.contatos).toEqual([{ grupo: "Senadores", nome: "Joana Fictícia", id: "10" }]);
  });

  test("suplente em exercício conta como reeleito", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (em exercício como 1º suplente)" })], [senadores(joana)]);
    expect(r.destino).toBe("reeleito");
  });

  test("deputado atual eleito senador fica no grupo atual como outra_casa (Ata 14)", () => {
    const e = eleito({ statusMandato: "Mandato novo (atual deputado federal)" });
    const deputados = grupo("Deputados Federais", [{ id: "20", nome: "Joana Fictícia", grupo: "Deputados Federais", departamento: "MARANHÃO" }]);
    const [r] = classificarEleitos([e], [deputados]);
    expect(r.destino).toBe("outra_casa");
    expect(r.contatos[0].grupo).toBe("Deputados Federais");
  });

  test("mandato novo sem ninguém no Contatos vai para o grupo novo", () => {
    expect(dest(classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores()]))).toEqual(["novo"]);
  });

  test("mandato novo já cadastrado no grupo novo fica novo, marcado jaCadastrado", () => {
    const novos = grupo("Senadores Eleitos", [{ nome: "Joana Fictícia", grupo: "Senadores Eleitos" }]);
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [novos]);
    expect(r).toMatchObject({ destino: "novo", jaCadastrado: true });
  });

  test("'verificar' e status desconhecido vão para conferir, com motivo", () => {
    const r = classificarEleitos([eleito({ statusMandato: "Mandato novo (verificar)" }), eleito({ statusMandato: "Outra coisa" })], []);
    expect(dest(r)).toEqual(["conferir", "conferir"]);
    expect(r[0].motivo).toContain("verificação");
    expect(r[1].motivo).toBe('Status do mandato não previsto: "Outra coisa"');
  });

  test("status com caixa e espaços diferentes é normalizado", () => {
    expect(dest(classificarEleitos([eleito({ statusMandato: "  REELEIÇÃO " })], [senadores(joana)]))).toEqual(["reeleito"]);
  });

  test("projeção da imprensa é marcada sem mudar o destino", () => {
    const [r] = classificarEleitos([eleito({ situacaoTse: "PROJEÇÃO da imprensa (TSE ainda não homologou)" })], [senadores(joana)]);
    expect(r).toMatchObject({ destino: "reeleito", projecao: true });
  });
});

describe("classificarEleitos: contradições viram conferir", () => {
  test("reeleito que não está no grupo de senadores", () => {
    const [r] = classificarEleitos([eleito()], [senadores()]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("não está no grupo de senadores");
  });

  test("mandato novo que já está num grupo de parlamentar atual", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores(joana)]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("já está em \"Senadores\"");
  });

  test("planilha diz deputado atual, mas a pessoa não está na lista de deputados em exercício", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Outro Nome", nomeCivil: "Outra Pessoa" }];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [], atuais);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("deputados em exercício");
  });

  test("com a lista de atuais e a pessoa nela, sem grupo de deputados no Contatos, vale a planilha", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "Joana Maria Fictícia Souza" }];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [], atuais);
    expect(r.destino).toBe("outra_casa");
    expect(r.contatos).toEqual([]);
  });

  test("deputado reeleito sem o grupo Deputados Federais no Contatos vale pela planilha", () => {
    const [r] = classificarEleitos([eleito({ casa: "camara" })], [senadores(joana)]);
    expect(r.destino).toBe("reeleito");
  });

  test("nome que casa duas pessoas diferentes do Contatos vai para conferir", () => {
    const outra: ContatoPlanilha = { id: "11", nome: "Joana Fictícia", grupo: "Senadores", departamento: "MARANHÃO" };
    const [r] = classificarEleitos([eleito()], [senadores(joana, outra)]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe("Nome casa mais de um contato do Contatos");
  });
});

describe("classificarEleitos: casamento por nome", () => {
  test("nome de urna curto não casa senador homônimo de outra UF", () => {
    const camilo: ContatoPlanilha = { id: "30", nome: "Camilo Outro Sobrenome", grupo: "Senadores", departamento: "AMAPÁ" };
    const [r] = classificarEleitos([eleito({ uf: "CE", nomeUrna: "Camilo", nomeCompleto: "Camilo Fictício Santos" })], [senadores(camilo)]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("não está no grupo");
  });

  test("casa por token quando o Contatos tem o nome mais curto, na mesma UF", () => {
    const curto: ContatoPlanilha = { id: "31", nome: "Joana Souza", grupo: "Senadores", departamento: "MARANHÃO" };
    const [r] = classificarEleitos([eleito()], [senadores(curto)]);
    expect(r.destino).toBe("reeleito");
  });

  test("a mesma pessoa em dois grupos de senadores, com o mesmo Id, não é ambiguidade", () => {
    const presidente = grupo("Presidente do Senado Federal; Senadores", [{ ...joana, grupo: "Presidente do Senado Federal; Senadores" }]);
    const [r] = classificarEleitos([eleito()], [senadores(joana), presidente]);
    expect(r.destino).toBe("reeleito");
    expect(r.contatos.map((c) => c.grupo)).toEqual(["Senadores", "Presidente do Senado Federal; Senadores"]);
  });

  test("grupo de ex-senadores não conta como grupo atual", () => {
    const ex = grupo("Ex-Senadores", [{ ...joana, grupo: "Ex-Senadores" }]);
    expect(dest(classificarEleitos([eleito()], [ex]))).toEqual(["conferir"]);
  });
});

describe("aplicarEleicao", () => {
  const resultado: ResultadoAnalise = {
    arquivoNome: "base.xlsx",
    grupos: [senadores(joana, { id: "12", nome: "Pedro Ficticio", grupo: "Senadores", departamento: "PIAUÍ" })],
    resumo: { total: 2, verde: 2, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0 },
  };

  test("anexa a eleição só à linha casada, sem mudar semáforo nem resumo, e guarda o resultado", () => {
    const r = aplicarEleicao(resultado, [eleito({ partido: "PXX" })], ["senado.xlsx"]);
    const [c1, c2] = r.grupos[0].contatos;
    expect(c1.eleicao).toMatchObject({ casa: "senado", destino: "reeleito", uf: "MA", partido: "PXX", nomeUrna: "Joana Fictícia" });
    expect(c1.semaforo).toBe("verde");
    expect(c2.eleicao).toBeUndefined();
    expect(r.resumo).toEqual(resultado.resumo);
    expect(r.eleicao).toMatchObject({ arquivos: ["senado.xlsx"], camaraNoContatos: false });
    expect(r.eleicao?.eleitos).toHaveLength(1);
  });

  test("não muta a entrada", () => {
    const antes = JSON.stringify(resultado);
    aplicarEleicao(resultado, [eleito()], ["x.xlsx"]);
    expect(JSON.stringify(resultado)).toBe(antes);
  });

  test("guarda a lista de deputados atuais quando enviada", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "X", nomeCivil: "Y" }];
    expect(aplicarEleicao(resultado, [], [], atuais).eleicao?.deputadosAtuais).toEqual(atuais);
  });

  test("a orientação da troca de Casa cita a Ata 14", () => {
    expect(ORIENTACAO_OUTRA_CASA).toBe("Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/eleitos.test.ts`
Expected: FAIL, import de `@/lib/eleitos` não resolvido.

- [ ] **Step 3: Implementar `lib/eleitos.ts`**

```ts
import { pontuarPessoa } from "@/lib/match";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { siglaDaUf } from "@/lib/uf";
import type {
  CasaLegislativa,
  ContatoDoEleito,
  ContatoPlanilha,
  DeputadoAtual,
  DestinoEleito,
  EleicaoContato,
  EleitoClassificado,
  EleitoPlanilha,
  ResultadoAnalise,
  ResultadoGrupo,
} from "@/lib/types";

/**
 * Classificação dos eleitos de 04/10/2026 contra o Contatos. Spec 2026-10-05 §4.
 * O `Status do mandato` (TSE cruzado por CPF) decide o destino; o Contatos acha a linha
 * da pessoa e pega contradições, que nunca viram decisão automática: vão para `conferir`.
 * Eixo próprio: não toca semáforo, comparações nem possível saída.
 */

export const OBSERVACAO_NOME_URNA = "Nome de urna (TSE): aguarda aprovação do nome político";
export const ORIENTACAO_OUTRA_CASA = "Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)";

const MOTIVO_AMBIGUO = "Nome casa mais de um contato do Contatos";
const MOTIVO_VERIFICAR = "Planilha pede verificação: provável deputado estadual ou distrital";

type Regra =
  | { destino: "reeleito" | "outra_casa"; casaAtual: CasaLegislativa }
  | { destino: "novo" }
  | { destino: "conferir"; motivo: string };

const outra = (c: CasaLegislativa): CasaLegislativa => (c === "senado" ? "camara" : "senado");

function regraDoStatus(e: EleitoPlanilha): Regra {
  const s = normalizarTexto(e.statusMandato);
  switch (s) {
    case "reeleicao":
    case "atual deputado (suplente em exercicio)":
    case "mandato novo (em exercicio como 1º suplente)":
      return { destino: "reeleito", casaAtual: e.casa };
    case "mandato novo (atual deputado federal)":
    case "mandato novo (atual senador)":
      return { destino: "outra_casa", casaAtual: outra(e.casa) };
    case "mandato novo":
      return { destino: "novo" };
    case "mandato novo (verificar)":
      return { destino: "conferir", motivo: MOTIVO_VERIFICAR };
    default:
      return { destino: "conferir", motivo: `Status do mandato não previsto: "${e.statusMandato.trim()}"` };
  }
}

interface Candidato {
  contato: ContatoPlanilha;
  grupo: string;
  casa: CasaLegislativa;
  /** Grupo novo ("Senadores Eleitos", "Deputados Federais Eleitos"). */
  eleitos: boolean;
}

function casaDoGrupo(grupo: string): { casa: CasaLegislativa; eleitos: boolean } | undefined {
  const g = normalizarTexto(grupo);
  if (g.startsWith("ex-") || g.startsWith("ex ")) return undefined;
  if (g.includes("eleit")) {
    if (g.includes("senador")) return { casa: "senado", eleitos: true };
    if (g.includes("deputad")) return { casa: "camara", eleitos: true };
    return undefined;
  }
  if (g.includes("senadores")) return { casa: "senado", eleitos: false };
  if (g.includes("deputados federais")) return { casa: "camara", eleitos: false };
  return undefined;
}

function candidatos(grupos: readonly ResultadoGrupo[]): Candidato[] {
  return grupos.flatMap((g) => {
    const casa = casaDoGrupo(g.grupo);
    return casa ? g.contatos.map((c) => ({ contato: c.contato, grupo: g.grupo, ...casa })) : [];
  });
}

function casaPessoa(contato: ContatoPlanilha, e: EleitoPlanilha): boolean {
  const uf = siglaDaUf(contato.departamento);
  if (uf && uf !== e.uf.toUpperCase()) return false;
  const nomes = [e.nomeUrna, e.nomeCompleto].filter((n) => n.trim().length > 0);
  const alvo = normalizarNome(contato.nome);
  return nomes.some((n) => normalizarNome(n) === alvo || pontuarPessoa(contato.nome, n) >= 1);
}

function constaEntreAtuais(e: EleitoPlanilha, atuais: readonly DeputadoAtual[]): boolean {
  const civil = normalizarNome(e.nomeCompleto);
  const urna = normalizarNome(e.nomeUrna);
  return atuais.some(
    (d) => d.uf.toUpperCase() === e.uf.toUpperCase()
      && (normalizarNome(d.nomeCivil) === civil || normalizarNome(d.nomeParlamentar) === urna),
  );
}

const chavePessoa = (c: ContatoPlanilha): string => c.id ?? normalizarNome(c.nome);

const referencia = (a: Candidato): ContatoDoEleito => ({ grupo: a.grupo, nome: a.contato.nome, ...(a.contato.id ? { id: a.contato.id } : {}) });

const ROTULO_CASA_GRUPO: Record<CasaLegislativa, string> = { senado: "senadores", camara: "deputados federais" };

function classificarUm(
  e: EleitoPlanilha,
  cands: readonly Candidato[],
  camaraNoContatos: boolean,
  atuais?: readonly DeputadoAtual[],
): EleitoClassificado {
  const base = { eleito: e, projecao: normalizarTexto(e.situacaoTse).startsWith("projecao") };
  const regra = regraDoStatus(e);
  if (regra.destino === "conferir") return { ...base, destino: "conferir", motivo: regra.motivo, contatos: [] };

  const achados = cands.filter((c) => casaPessoa(c.contato, e));
  if (new Set(achados.map((a) => chavePessoa(a.contato))).size > 1) {
    return { ...base, destino: "conferir", motivo: MOTIVO_AMBIGUO, contatos: achados.map(referencia) };
  }

  if (regra.destino === "novo") {
    const atual = achados.find((a) => !a.eleitos);
    if (atual) {
      return { ...base, destino: "conferir", motivo: `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, contatos: [referencia(atual)] };
    }
    const noGrupoNovo = achados.filter((a) => a.eleitos && a.casa === e.casa);
    return { ...base, destino: "novo", contatos: noGrupoNovo.map(referencia), ...(noGrupoNovo.length > 0 ? { jaCadastrado: true } : {}) };
  }

  if (regra.casaAtual === "camara" && atuais && !constaEntreAtuais(e, atuais)) {
    return { ...base, destino: "conferir", motivo: "Planilha diz deputado federal atual, mas a pessoa não está na lista de deputados em exercício", contatos: [] };
  }
  const noGrupo = achados.filter((a) => !a.eleitos && a.casa === regra.casaAtual);
  const confereContatos = regra.casaAtual === "senado" || camaraNoContatos;
  if (confereContatos && noGrupo.length === 0) {
    return {
      ...base,
      destino: "conferir",
      motivo: `Planilha diz ${regra.destino === "reeleito" ? "reeleito" : "parlamentar da outra Casa"}, mas a pessoa não está no grupo de ${ROTULO_CASA_GRUPO[regra.casaAtual]} do Contatos`,
      contatos: [],
    };
  }
  return { ...base, destino: regra.destino, contatos: noGrupo.map(referencia) };
}

export function classificarEleitos(
  eleitos: readonly EleitoPlanilha[],
  grupos: readonly ResultadoGrupo[],
  deputadosAtuais?: readonly DeputadoAtual[],
): EleitoClassificado[] {
  const cands = candidatos(grupos);
  const camaraNoContatos = cands.some((c) => c.casa === "camara" && !c.eleitos);
  return eleitos.map((e) => classificarUm(e, cands, camaraNoContatos, deputadosAtuais));
}

function paraContato(x: EleitoClassificado): EleicaoContato {
  const e = x.eleito;
  return {
    casa: e.casa, destino: x.destino, projecao: x.projecao, uf: e.uf, situacaoTse: e.situacaoTse,
    statusMandato: e.statusMandato, nomeUrna: e.nomeUrna,
    ...(e.partido ? { partido: e.partido } : {}),
    ...(e.baseStatus ? { baseStatus: e.baseStatus } : {}),
    ...(x.motivo ? { motivo: x.motivo } : {}),
  };
}

const chaveLinha = (grupo: string, c: { nome: string; id?: string }): string => `${grupo}|${c.id ?? normalizarNome(c.nome)}`;

/** Classifica e anexa a eleição às linhas do Contatos. Não muta a entrada; não mexe no resumo. */
export function aplicarEleicao(
  resultado: ResultadoAnalise,
  eleitos: readonly EleitoPlanilha[],
  arquivos: readonly string[],
  deputadosAtuais?: readonly DeputadoAtual[],
): ResultadoAnalise {
  const classificados = classificarEleitos(eleitos, resultado.grupos, deputadosAtuais);
  const porLinha = new Map<string, EleicaoContato>();
  for (const x of classificados) for (const c of x.contatos) porLinha.set(chaveLinha(c.grupo, c), paraContato(x));
  const camaraNoContatos = candidatos(resultado.grupos).some((c) => c.casa === "camara" && !c.eleitos);
  return {
    ...resultado,
    grupos: resultado.grupos.map((g) => ({
      ...g,
      contatos: g.contatos.map((c) => {
        const eleicao = porLinha.get(chaveLinha(g.grupo, c.contato));
        return eleicao ? { ...c, eleicao } : c;
      }),
    })),
    eleicao: {
      arquivos: [...arquivos],
      eleitos: classificados,
      ...(deputadosAtuais ? { deputadosAtuais: [...deputadosAtuais] } : {}),
      camaraNoContatos,
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/eleitos.test.ts`
Expected: PASS (todos). Se o teste "casa por token" falhar, conferir `tokensNome` em `lib/match.ts:52` (descarta tokens de 1 letra) antes de mexer no limiar: o critério do plano é `pontuarPessoa >= 1`, e ele não deve baixar (é a guarda contra homônimo).

- [ ] **Step 5: Typecheck e commit**

```bash
npm run typecheck
git add lib/eleitos.ts tests/eleitos.test.ts
git commit -m "feat: classificação dos eleitos 2026 contra o Contatos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Entrada ponta a ponta (payload, rota, publicação e Nova varredura)

**Files:**
- Modify: `lib/analise-payload.ts`, `app/api/analise/route.ts`, `lib/publicar.ts`, `components/nova-varredura-form.tsx`
- Test: `tests/analise-payload.test.ts`, `tests/publicar.test.ts`

**Interfaces:**
- Consumes: `aplicarEleicao` (Task 2); `lerPlanilhaEleicao`, `juntarArquivosEleicao`, `resumoArquivoEleicao`, `ArquivoEleicaoLido`, `PlanilhaEleicaoDesconhecidaError` (Task 1).
- Produces: `PayloadAnalise` com `eleitos?: EleitoPlanilha[]`, `deputadosAtuais?: DeputadoAtual[]`, `arquivosEleicao?: string[]`; retrato com `eleicao` quando as planilhas vierem; retrato publicado sem `eleicao.deputadosAtuais`.

- [ ] **Step 1: Testes do payload**

Acrescentar em `tests/analise-payload.test.ts` (o arquivo já importa `parsePayloadAnalise` e `PayloadInvalidoError`; se não importar este último, acrescentar ao import):

```ts
describe("payload da eleição 2026", () => {
  const base = { arquivoNome: "base.xlsx", contatos: [] };

  test("aceita eleitos, deputados atuais e nomes dos arquivos", () => {
    const p = parsePayloadAnalise({
      ...base,
      eleitos: [{ casa: "senado", uf: "MA", nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Reeleição", partido: "PXX", extra: 1 }],
      deputadosAtuais: [{ uf: "MA", nomeParlamentar: "C", nomeCivil: "C D", email: "c@camara.leg.br" }],
      arquivosEleicao: ["senado.xlsx", 7],
    });
    expect(p.eleitos).toEqual([{ casa: "senado", uf: "MA", nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Reeleição", partido: "PXX" }]);
    expect(p.deputadosAtuais?.[0]).toMatchObject({ nomeParlamentar: "C", email: "c@camara.leg.br" });
    expect(p.arquivosEleicao).toEqual(["senado.xlsx"]);
  });

  test("sem os campos da eleição, nada muda", () => {
    const p = parsePayloadAnalise(base);
    expect(p.eleitos).toBeUndefined();
    expect(p.deputadosAtuais).toBeUndefined();
  });

  test("casa desconhecida é recusada", () => {
    expect(() => parsePayloadAnalise({ ...base, eleitos: [{ casa: "assembleia" }] })).toThrow(PayloadInvalidoError);
  });

  test("lista de eleitos que não é array é recusada", () => {
    expect(() => parsePayloadAnalise({ ...base, eleitos: "x" })).toThrow(PayloadInvalidoError);
  });
});
```

- [ ] **Step 2: Teste da publicação**

Acrescentar em `tests/publicar.test.ts` (usar a fixture de retrato que o arquivo já tem; aqui chamada `retrato`; se o nome for outro, usar o existente):

```ts
test("o retrato publicado leva a eleição, mas sem a lista de deputados atuais (e-mail e telefone de gabinete)", () => {
  const comEleicao = {
    ...retrato,
    eleicao: {
      arquivos: ["atuais.xlsx"], eleitos: [], camaraNoContatos: false,
      deputadosAtuais: [{ uf: "MA", nomeParlamentar: "C", nomeCivil: "C D", email: "c@camara.leg.br", telefone: "3215-0000" }],
    },
  };
  const pub = enxugarParaPublicar(comEleicao, "2026-10-05T12:00:00.000Z");
  expect(pub.eleicao?.arquivos).toEqual(["atuais.xlsx"]);
  expect(pub.eleicao?.deputadosAtuais).toBeUndefined();
  expect(JSON.stringify(pub)).not.toContain("camara.leg.br");
  expect(comEleicao.eleicao.deputadosAtuais).toHaveLength(1);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/analise-payload.test.ts tests/publicar.test.ts`
Expected: FAIL nos testes novos (`p.eleitos` undefined; `deputadosAtuais` presente).

- [ ] **Step 4: Implementar o payload**

Em `lib/analise-payload.ts`:

1. Import: `import type { CasaLegislativa, ContatoPlanilha, DeputadoAtual, EleitoPlanilha, EnderecoEstruturado } from "@/lib/types";`
2. Em `PayloadAnalise`, depois de `enderecos?`:

```ts
  /** Planilhas de eleitos (spec 2026-10-05 §2). Ausente = a eleição não roda. */
  eleitos?: EleitoPlanilha[];
  deputadosAtuais?: DeputadoAtual[];
  arquivosEleicao?: string[];
```

3. Funções, depois de `narrowEndereco`:

```ts
const CASAS: readonly CasaLegislativa[] = ["senado", "camara"];

function objeto(v: unknown): Record<string, unknown> {
  return (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
}

function narrowEleito(v: unknown): EleitoPlanilha {
  const o = objeto(v);
  const casa = CASAS.find((c) => c === o.casa);
  if (!casa) throw new PayloadInvalidoError("Eleito com casa legislativa inválida.");
  const opcionais = { partido: textoOpcional(o.partido), baseStatus: textoOpcional(o.baseStatus), genero: textoOpcional(o.genero), nascimento: textoOpcional(o.nascimento) };
  return {
    casa, uf: texto(o.uf), nomeUrna: texto(o.nomeUrna), nomeCompleto: texto(o.nomeCompleto),
    situacaoTse: texto(o.situacaoTse), statusMandato: texto(o.statusMandato),
    ...Object.fromEntries(Object.entries(opcionais).filter(([, x]) => x !== undefined)),
  };
}

const CAMPOS_DEPUTADO_OPCIONAIS = ["partido", "sexo", "condicao", "eleicao2026", "email", "predio", "sala", "telefone", "idCamara"] as const;

function narrowDeputado(v: unknown): DeputadoAtual {
  const o = objeto(v);
  const opcionais = Object.fromEntries(
    CAMPOS_DEPUTADO_OPCIONAIS.map((c) => [c, textoOpcional(o[c])] as const).filter(([, x]) => x !== undefined),
  );
  return { uf: texto(o.uf), nomeParlamentar: texto(o.nomeParlamentar), nomeCivil: texto(o.nomeCivil), ...opcionais };
}

function listaOpcional<T>(valor: unknown, rotulo: string, narrow: (v: unknown) => T): T[] | undefined {
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor)) throw new PayloadInvalidoError(`Lista de ${rotulo} inválida.`);
  if (valor.length > MAX_CONTATOS) throw new PayloadInvalidoError(`Lista de ${rotulo} muito grande (máximo ${MAX_CONTATOS} linhas).`);
  return valor.map(narrow);
}
```

4. No fim de `parsePayloadAnalise`, antes do `return`:

```ts
  const extra = corpo as Record<string, unknown>;
  const eleitos = listaOpcional(extra.eleitos, "eleitos", narrowEleito);
  const deputadosAtuais = listaOpcional(extra.deputadosAtuais, "deputados atuais", narrowDeputado);
  const arquivosEleicao = Array.isArray(extra.arquivosEleicao)
    ? extra.arquivosEleicao.filter((x): x is string => typeof x === "string" && x.length > 0)
    : undefined;
```

e no objeto devolvido, depois do spread de `enderecos`:

```ts
    ...(eleitos ? { eleitos } : {}),
    ...(deputadosAtuais ? { deputadosAtuais } : {}),
    ...(arquivosEleicao ? { arquivosEleicao } : {}),
```

- [ ] **Step 5: Implementar a publicação**

Em `lib/publicar.ts`, no objeto devolvido por `enxugarParaPublicar`, depois de `publicadoEm,`:

```ts
    // A lista de deputados atuais traz e-mail e telefone de gabinete: fica nesta máquina.
    ...(retrato.eleicao ? { eleicao: { ...retrato.eleicao, deputadosAtuais: undefined } } : {}),
```

E acrescentar ao comentário da função: "A eleição vai sem `deputadosAtuais`."

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/analise-payload.test.ts tests/publicar.test.ts`
Expected: PASS.

- [ ] **Step 7: Ligar a rota**

Em `app/api/analise/route.ts`:

1. Import: `import { aplicarEleicao } from "@/lib/eleitos";`
2. Trocar a desestruturação e a chamada de `analisar`:

```ts
    const { arquivoNome, contatos, arquivoEnderecosNome, enderecos, eleitos, deputadosAtuais, arquivosEleicao } = parsePayloadAnalise(corpo);
```

```ts
    const analisado = await analisar(arquivoNome, contatos, deps, enderecos);
    // Eleição 2026: passada posterior, eixo próprio (spec 2026-10-05 §4.3).
    const resultado = eleitos || deputadosAtuais
      ? aplicarEleicao(analisado, eleitos ?? [], arquivosEleicao ?? [], deputadosAtuais)
      : analisado;
```

(`montarRetrato(resultado, …)` continua igual: ele espalha `resultado`, então `eleicao` entra no retrato.)

- [ ] **Step 8: Passo 3 na Nova varredura**

Em `components/nova-varredura-form.tsx`:

1. Imports:

```ts
import { juntarArquivosEleicao, lerPlanilhaEleicao, PlanilhaEleicaoDesconhecidaError, resumoArquivoEleicao, type ArquivoEleicaoLido } from "@/lib/planilha-eleitos";
```

2. Em `mensagemDeLeitura`, primeira linha:

```ts
  if (err instanceof PlanilhaEleicaoDesconhecidaError) return err.message;
```

3. Estado, depois de `erroEnderecos`:

```ts
  const [eleicao, setEleicao] = useState<ArquivoEleicaoLido[]>([]);
  const [erroEleicao, setErroEleicao] = useState<string | null>(null);
```

4. Leitura (aceita vários arquivos; o mesmo tipo de novo substitui o anterior):

```ts
  async function lerEleicao(arquivos: File[]) {
    setErroEleicao(null);
    setErroVarredura(null);
    try {
      const lidos: ArquivoEleicaoLido[] = [];
      for (const f of arquivos) lidos.push({ nome: f.name, arquivo: lerPlanilhaEleicao(await f.arrayBuffer()) });
      setEleicao((atual) => {
        const tipos = new Set(lidos.map((l) => l.arquivo.tipo));
        return [...atual.filter((a) => !tipos.has(a.arquivo.tipo)), ...lidos];
      });
    } catch (err) {
      setErroEleicao(mensagemDeLeitura(err));
    }
  }
```

5. No corpo do `fetch`, depois do spread de `enderecos`:

```ts
          ...(eleicao.length > 0 ? juntarArquivosEleicao(eleicao) : {}),
```

6. `SeletorDeArquivo` ganha `multiplo?: boolean` e `onArquivos?: (fs: File[]) => void`: no `input`, `multiple={multiplo}`; no `onChange`:

```tsx
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          if (onArquivos && lista.length > 0) onArquivos(lista);
          else if (lista[0]) onArquivo?.(lista[0]);
          e.target.value = "";
        }}
```

com `onArquivo?: (f: File) => void` passando a opcional na assinatura.

7. Terceira seção, logo depois da seção do relatório de endereços, dentro do mesmo grid:

```tsx
        <section className="rounded-xl border border-borda-forte bg-cartao p-6 md:col-span-2">
          <div className="flex items-center gap-2.5">
            <Passo numero={3} ativo={eleicao.length > 0} />
            <h2 className="text-lg font-semibold">Eleição 2026</h2>
            <span className="rounded-full bg-neutro-fundo px-2 py-0.5 text-[11px] text-cinza">opcional</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-cinza">
            As planilhas da pasta <strong className="font-medium">Eleitos 2026</strong>: senadores eleitos, deputados federais eleitos e deputados atuais. Pode escolher as três de uma vez.
          </p>
          {eleicao.map((l) => (
            <ArquivoLido
              key={l.arquivo.tipo}
              nome={l.nome}
              resumo={resumoArquivoEleicao(l.arquivo)}
              onTrocar={() => { setEleicao((atual) => atual.filter((a) => a.arquivo.tipo !== l.arquivo.tipo)); setErroVarredura(null); }}
              desabilitado={varrendo}
            />
          ))}
          <SeletorDeArquivo id="planilhas-eleicao" rotulo={eleicao.length > 0 ? "Acrescentar ou trocar" : "Escolher arquivos"} desabilitado={varrendo} multiplo onArquivos={lerEleicao} />
          {erroEleicao && <p className="mt-2 text-sm text-ruim">{erroEleicao}</p>}
        </section>
```

(O botão de cada arquivo lido diz "Trocar" e remove o arquivo; o seletor abaixo acrescenta outro.)

- [ ] **Step 9: Suíte, typecheck e commit**

Run: `npx vitest run && npm run typecheck`
Expected: tudo verde.

```bash
git add lib/analise-payload.ts app/api/analise/route.ts lib/publicar.ts components/nova-varredura-form.tsx tests/analise-payload.test.ts tests/publicar.test.ts
git commit -m "feat: planilhas de eleitos na Nova varredura e eleição no retrato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Apresentação da eleição (`lib/painel-eleicao.ts`)

**Files:**
- Create: `lib/painel-eleicao.ts`
- Modify: `lib/painel.ts` (tipos `CampoEtiqueta` e `Filtro`, função `passaFiltro`)
- Test: `tests/painel-eleicao.test.ts`, `tests/painel.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1; `ORIENTACAO_OUTRA_CASA` (Task 2); `Etiqueta`, `Tom` (`lib/painel.ts`); `normalizarTexto`.
- Produces:
  - `type FiltroEleicao = "reeleitos" | "outra_casa" | "a_cadastrar" | "a_conferir"`;
  - `FILTROS_ELEICAO: readonly { id: FiltroEleicao; rotulo: string }[]`;
  - `ehFiltroEleicao(f: string): f is FiltroEleicao`;
  - `etiquetasDeEleicao(e: EleicaoContato | undefined): Etiqueta[]`;
  - `destacaLinha(e: EleicaoContato | undefined): boolean`;
  - `detalheDaEleicao(e: EleicaoContato): { linhas: { rotulo: string; valor: string }[]; orientacao?: string }`;
  - `passaFiltroEleicao(c: ResultadoContato, f: FiltroEleicao): boolean`;
  - `interface SecaoEleicao { id: "senado_novos" | "camara_novos" | "conferir"; titulo: string; linhas: EleitoClassificado[] }`;
  - `secoesDeEleicao(eleicao: ResultadoEleicao | undefined, filtro: string, busca: string): SecaoEleicao[]`;
  - `avisoDaEleicao(eleicao: ResultadoEleicao | undefined): string | undefined`;
  - em `lib/painel.ts`: `Filtro = "tudo" | "ressalva" | "endereco" | "numero" | "saida" | "inclusao" | FiltroEleicao`; `CampoEtiqueta` inclui `"eleicao"`.

- [ ] **Step 1: Testes**

`tests/painel-eleicao.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  avisoDaEleicao,
  destacaLinha,
  detalheDaEleicao,
  ehFiltroEleicao,
  etiquetasDeEleicao,
  passaFiltroEleicao,
  secoesDeEleicao,
} from "@/lib/painel-eleicao";
import type { EleicaoContato, EleitoClassificado, ResultadoContato, ResultadoEleicao } from "@/lib/types";

const ec = (over: Partial<EleicaoContato> = {}): EleicaoContato => ({
  casa: "senado", destino: "reeleito", projecao: false, uf: "MA", situacaoTse: "Eleito",
  statusMandato: "Reeleição", nomeUrna: "Joana Fictícia", ...over,
});
const classificado = (over: Partial<EleitoClassificado> & { nome?: string; casa?: "senado" | "camara" } = {}): EleitoClassificado => ({
  eleito: { casa: over.casa ?? "senado", uf: "MA", nomeUrna: over.nome ?? "Joana Fictícia", nomeCompleto: `${over.nome ?? "Joana Fictícia"} Souza`, situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", projecao: false, contatos: [], ...over,
});
const eleicao = (eleitos: EleitoClassificado[], camaraNoContatos = false): ResultadoEleicao => ({ arquivos: ["x.xlsx"], eleitos, camaraNoContatos });
const linha = (eleicaoContato?: EleicaoContato): ResultadoContato => ({
  contato: { nome: "Joana Fictícia", grupo: "Senadores" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
  ...(eleicaoContato ? { eleicao: eleicaoContato } : {}),
});

describe("etiquetasDeEleicao", () => {
  test("reeleito é verde", () => {
    expect(etiquetasDeEleicao(ec())).toEqual([expect.objectContaining({ campo: "eleicao", texto: "Reeleito", tom: "ok" })]);
  });

  test("troca de Casa é atenção, com a orientação da Ata 14, e a linha ganha destaque", () => {
    const e = ec({ destino: "outra_casa", casa: "senado" });
    expect(etiquetasDeEleicao(e)[0]).toMatchObject({ texto: "Eleito senador — atenção", tom: "atencao" });
    expect(etiquetasDeEleicao(e)[0].explicacao).toContain("Ata 14");
    expect(etiquetasDeEleicao(ec({ destino: "outra_casa", casa: "camara" }))[0].texto).toBe("Eleito deputado — atenção");
    expect(destacaLinha(e)).toBe(true);
    expect(destacaLinha(ec())).toBe(false);
    expect(destacaLinha(undefined)).toBe(false);
  });

  test("projeção ganha etiqueta neutra própria", () => {
    expect(etiquetasDeEleicao(ec({ projecao: true })).map((x) => x.texto)).toEqual(["Reeleito", "Projeção — aguarda TSE"]);
  });

  test("sem eleição, nenhuma etiqueta", () => {
    expect(etiquetasDeEleicao(undefined)).toEqual([]);
  });
});

describe("detalheDaEleicao", () => {
  test("lista cargo, UF, partido, situação e base; orientação só na troca de Casa", () => {
    const d = detalheDaEleicao(ec({ partido: "PXX", baseStatus: "Eleita em 2018" }));
    expect(d.linhas).toEqual([
      { rotulo: "Eleito para", valor: "Senado Federal" },
      { rotulo: "UF", valor: "MA" },
      { rotulo: "Partido", valor: "PXX" },
      { rotulo: "Situação no TSE", valor: "Eleito" },
      { rotulo: "Status do mandato", valor: "Reeleição" },
      { rotulo: "Base do status", valor: "Eleita em 2018" },
    ]);
    expect(d.orientacao).toBeUndefined();
    expect(detalheDaEleicao(ec({ destino: "outra_casa", casa: "camara" })).orientacao).toContain("Ata 14");
  });
});

describe("filtros da eleição", () => {
  test("reeleitos e outra_casa filtram linhas; a_cadastrar e a_conferir não trazem linha", () => {
    expect(passaFiltroEleicao(linha(ec()), "reeleitos")).toBe(true);
    expect(passaFiltroEleicao(linha(ec()), "outra_casa")).toBe(false);
    expect(passaFiltroEleicao(linha(ec({ destino: "outra_casa" })), "outra_casa")).toBe(true);
    expect(passaFiltroEleicao(linha(), "reeleitos")).toBe(false);
    expect(passaFiltroEleicao(linha(ec()), "a_cadastrar")).toBe(false);
  });

  test("ehFiltroEleicao reconhece só os quatro", () => {
    expect(ehFiltroEleicao("a_conferir")).toBe(true);
    expect(ehFiltroEleicao("tudo")).toBe(false);
  });
});

describe("secoesDeEleicao", () => {
  const e = eleicao([
    classificado({ nome: "Ana Nova" }),
    classificado({ nome: "Bia Nova", casa: "camara" }),
    classificado({ nome: "Caio Ja Cadastrado", jaCadastrado: true }),
    classificado({ nome: "Davi Duvida", destino: "conferir", motivo: "Planilha pede verificação" }),
    classificado({ nome: "Eva Reeleita", destino: "reeleito" }),
  ]);
  const nomes = (s: ReturnType<typeof secoesDeEleicao>) => s.map((x) => [x.id, x.linhas.map((l) => l.eleito.nomeUrna)]);

  test("tudo: as duas listas a cadastrar (sem quem já está cadastrado) e a de conferir", () => {
    expect(nomes(secoesDeEleicao(e, "tudo", ""))).toEqual([
      ["senado_novos", ["Ana Nova"]],
      ["camara_novos", ["Bia Nova"]],
      ["conferir", ["Davi Duvida"]],
    ]);
    expect(secoesDeEleicao(e, "tudo", "")[0].titulo).toBe("Senadores Eleitos — a cadastrar (1)");
  });

  test("a_cadastrar e a_conferir mostram só as suas; outros filtros, nenhuma", () => {
    expect(secoesDeEleicao(e, "a_cadastrar", "").map((s) => s.id)).toEqual(["senado_novos", "camara_novos"]);
    expect(secoesDeEleicao(e, "a_conferir", "").map((s) => s.id)).toEqual(["conferir"]);
    expect(secoesDeEleicao(e, "saida", "")).toEqual([]);
  });

  test("busca por nome ignora acento e caixa; seção vazia some", () => {
    expect(nomes(secoesDeEleicao(e, "tudo", "BIA"))).toEqual([["camara_novos", ["Bia Nova"]]]);
  });

  test("retrato sem eleição não tem seção nem aviso", () => {
    expect(secoesDeEleicao(undefined, "tudo", "")).toEqual([]);
    expect(avisoDaEleicao(undefined)).toBeUndefined();
  });

  test("aviso quando há deputados e o grupo ainda não está no Contatos", () => {
    expect(avisoDaEleicao(eleicao([classificado({ casa: "camara" })]))).toBe("Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.");
    expect(avisoDaEleicao(eleicao([classificado({ casa: "camara" })], true))).toBeUndefined();
    expect(avisoDaEleicao(eleicao([classificado()]))).toBeUndefined();
  });
});
```

E em `tests/painel.test.ts`, no `describe("filtrarGrupos")`, um teste da integração:

```ts
  test("filtro da eleição 'reeleitos' passa por filtrarGrupos e não traz novos", () => {
    const reeleita = contato({ contato: { nome: "Reeleita Teste", grupo: "ORG" }, eleicao: { casa: "senado", destino: "reeleito", projecao: false, uf: "MA", situacaoTse: "Eleito", statusMandato: "Reeleição", nomeUrna: "Reeleita Teste" } });
    const gs: ResultadoGrupo[] = [{ ...grupoComFonte, contatos: [reeleita, verde], novos: [{ nome: "Nova", cargo: "Ministra", origem: "pagina" }] }];
    const r = filtrarGrupos(gs, "reeleitos", "");
    expect(nomes(r)).toEqual(["Reeleita Teste"]);
    expect(r[0].novos).toEqual([]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/painel-eleicao.test.ts tests/painel.test.ts`
Expected: FAIL (módulo inexistente; `"reeleitos"` não é `Filtro`).

- [ ] **Step 3: Implementar `lib/painel-eleicao.ts`**

```ts
import { ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import { normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { CasaLegislativa, EleicaoContato, EleitoClassificado, ResultadoContato, ResultadoEleicao } from "@/lib/types";

/**
 * O que o painel mostra da Eleição 2026 (spec 2026-10-05 §5), decidido fora do JSX.
 * Nada aqui muda a situação da linha: a eleição é eixo próprio.
 */

export type FiltroEleicao = "reeleitos" | "outra_casa" | "a_cadastrar" | "a_conferir";

export const FILTROS_ELEICAO: readonly { id: FiltroEleicao; rotulo: string }[] = [
  { id: "reeleitos", rotulo: "Reeleitos" },
  { id: "outra_casa", rotulo: "Eleitos para a outra Casa" },
  { id: "a_cadastrar", rotulo: "A cadastrar" },
  { id: "a_conferir", rotulo: "A conferir" },
];

const IDS = new Set<string>(FILTROS_ELEICAO.map((f) => f.id));

export function ehFiltroEleicao(f: string): f is FiltroEleicao {
  return IDS.has(f);
}

const NOME_CASA: Record<CasaLegislativa, string> = { senado: "Senado Federal", camara: "Câmara dos Deputados" };

function etiquetaDoDestino(e: EleicaoContato): Etiqueta {
  switch (e.destino) {
    case "reeleito":
      return { campo: "eleicao", texto: "Reeleito", tom: "ok", explicacao: "Reeleito em 04/10/2026: fica neste grupo" };
    case "outra_casa":
      return { campo: "eleicao", texto: e.casa === "senado" ? "Eleito senador — atenção" : "Eleito deputado — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA };
    case "novo":
      return { campo: "eleicao", texto: "Eleito — grupo novo", tom: "neutro", explicacao: "Mandato novo, já cadastrado no grupo dos eleitos" };
    case "conferir":
      return { campo: "eleicao", texto: "Eleição: a conferir", tom: "atencao", explicacao: e.motivo ?? "Caso a conferir antes do cadastro" };
  }
}

export function etiquetasDeEleicao(e: EleicaoContato | undefined): Etiqueta[] {
  if (!e) return [];
  const lista = [etiquetaDoDestino(e)];
  if (e.projecao) lista.push({ campo: "eleicao", texto: "Projeção — aguarda TSE", tom: "neutro", explicacao: "O TSE ainda não homologou os eleitos desta UF; a lista segue a projeção da imprensa" });
  return lista;
}

export function destacaLinha(e: EleicaoContato | undefined): boolean {
  return e?.destino === "outra_casa";
}

export function detalheDaEleicao(e: EleicaoContato): { linhas: { rotulo: string; valor: string }[]; orientacao?: string } {
  const linhas = [
    { rotulo: "Eleito para", valor: NOME_CASA[e.casa] },
    { rotulo: "UF", valor: e.uf },
    ...(e.partido ? [{ rotulo: "Partido", valor: e.partido }] : []),
    { rotulo: "Situação no TSE", valor: e.situacaoTse },
    { rotulo: "Status do mandato", valor: e.statusMandato },
    ...(e.baseStatus ? [{ rotulo: "Base do status", valor: e.baseStatus }] : []),
    ...(e.motivo ? [{ rotulo: "A conferir", valor: e.motivo }] : []),
  ];
  return { linhas, ...(e.destino === "outra_casa" ? { orientacao: ORIENTACAO_OUTRA_CASA } : {}) };
}

export function passaFiltroEleicao(c: ResultadoContato, f: FiltroEleicao): boolean {
  if (f === "reeleitos") return c.eleicao?.destino === "reeleito";
  if (f === "outra_casa") return c.eleicao?.destino === "outra_casa";
  return false; // a_cadastrar e a_conferir são seções, não linhas do Contatos
}

export interface SecaoEleicao {
  id: "senado_novos" | "camara_novos" | "conferir";
  titulo: string;
  linhas: EleitoClassificado[];
}

function casaBusca(x: EleitoClassificado, busca: string): boolean {
  if (busca === "") return true;
  const e = x.eleito;
  return [e.nomeUrna, e.nomeCompleto, e.partido ?? "", e.uf].some((v) => normalizarTexto(v).includes(busca));
}

const SECOES_POR_FILTRO: Record<string, readonly SecaoEleicao["id"][]> = {
  tudo: ["senado_novos", "camara_novos", "conferir"],
  a_cadastrar: ["senado_novos", "camara_novos"],
  a_conferir: ["conferir"],
};

export function secoesDeEleicao(eleicao: ResultadoEleicao | undefined, filtro: string, busca: string): SecaoEleicao[] {
  if (!eleicao) return [];
  const b = normalizarTexto(busca.trim());
  const ids = SECOES_POR_FILTRO[filtro] ?? [];
  const visiveis = eleicao.eleitos.filter((x) => casaBusca(x, b));
  const novos = (casa: CasaLegislativa) => visiveis.filter((x) => x.destino === "novo" && !x.jaCadastrado && x.eleito.casa === casa);
  const todas: SecaoEleicao[] = [
    { id: "senado_novos", titulo: "Senadores Eleitos — a cadastrar", linhas: novos("senado") },
    { id: "camara_novos", titulo: "Deputados Federais Eleitos — a cadastrar", linhas: novos("camara") },
    { id: "conferir", titulo: "Eleitos — a conferir", linhas: visiveis.filter((x) => x.destino === "conferir") },
  ];
  return todas
    .filter((s) => ids.includes(s.id) && s.linhas.length > 0)
    .map((s) => ({ ...s, titulo: `${s.titulo} (${s.linhas.length})` }));
}

export function avisoDaEleicao(eleicao: ResultadoEleicao | undefined): string | undefined {
  if (!eleicao || eleicao.camaraNoContatos) return undefined;
  if (!eleicao.eleitos.some((x) => x.eleito.casa === "camara")) return undefined;
  return "Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.";
}
```

- [ ] **Step 4: Integrar em `lib/painel.ts`**

1. `export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte" | "eleicao";`
2. Import no topo: `import { ehFiltroEleicao, passaFiltroEleicao, type FiltroEleicao } from "@/lib/painel-eleicao";`
3. `export type Filtro = "tudo" | "ressalva" | "endereco" | "numero" | "saida" | "inclusao" | FiltroEleicao;`
4. Em `passaFiltro`, antes do `switch`:

```ts
  if (ehFiltroEleicao(filtro)) return passaFiltroEleicao(c, filtro);
```

(O `switch` continua exaustivo para os filtros antigos; o TypeScript estreita `filtro` depois do `if`.)

`FILTROS` não muda: os filtros da eleição só aparecem com a chave ligada (Task 5).

- [ ] **Step 5: Rodar e ver passar; suíte e typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: tudo verde. (A importação circular `painel.ts` ↔ `painel-eleicao.ts` é só de tipo de um lado, `import type { Etiqueta }`, e por isso é apagada na compilação.)

- [ ] **Step 6: Commit**

```bash
git add lib/painel-eleicao.ts lib/painel.ts tests/painel-eleicao.test.ts tests/painel.test.ts
git commit -m "feat: etiquetas, filtros e seções da eleição 2026 no painel (lógica)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Export dos eleitos e telas do painel

**Files:**
- Create: `lib/export-eleitos.ts`, `components/secao-eleitos.tsx`
- Modify: `components/export-buttons.tsx`, `components/painel.tsx`, `components/linha-contato.tsx`
- Test: `tests/export-eleitos.test.ts`

**Interfaces:**
- Consumes: tudo de `lib/painel-eleicao.ts` (Task 4); tipos da Task 1.
- Produces: `CABECALHO_ELEITOS: readonly string[]`, `linhasEleitos(lista: readonly EleitoClassificado[]): Record<string, string>[]`, `gerarXlsxEleitos(eleicao: ResultadoEleicao): ArrayBuffer`; componente `ExportEleitosButton({ eleicao })`; componente `SecaoEleitos({ secao, abertoInicial })`.

- [ ] **Step 1: Teste do export**

`tests/export-eleitos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_ELEITOS, gerarXlsxEleitos, linhasEleitos } from "@/lib/export-eleitos";
import type { EleitoClassificado, ResultadoEleicao } from "@/lib/types";

const x = (nome: string, destino: EleitoClassificado["destino"], casa: "senado" | "camara", uf = "MA", over: Partial<EleitoClassificado> = {}): EleitoClassificado => ({
  eleito: { casa, uf, nomeUrna: nome, nomeCompleto: `${nome} Completo`, partido: "PXX", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino, projecao: false, contatos: [], ...over,
});

describe("linhasEleitos", () => {
  test("uma linha por eleito, com Casa, destino por extenso, grupo no Contatos e motivo", () => {
    const [l] = linhasEleitos([x("Ana", "reeleito", "senado", "MA", { contatos: [{ grupo: "Senadores", nome: "Ana" }] })]);
    expect(Object.keys(l)).toEqual([...CABECALHO_ELEITOS]);
    expect(l).toMatchObject({ Casa: "Senado Federal", UF: "MA", "Nome de urna": "Ana", Destino: "Reeleito — fica no grupo atual", "Grupo no Contatos": "Senadores", Motivo: "" });
  });

  test("ordena por Casa (Senado primeiro), UF e nome de urna", () => {
    const r = linhasEleitos([x("Zeca", "novo", "camara", "AC"), x("Bia", "novo", "senado", "SP"), x("Ana", "novo", "senado", "SP"), x("Caio", "novo", "senado", "AC")]);
    expect(r.map((l) => l["Nome de urna"])).toEqual(["Caio", "Ana", "Bia", "Zeca"]);
  });
});

describe("gerarXlsxEleitos", () => {
  test("três abas com o cabeçalho mesmo vazias, e cada destino na sua aba", () => {
    const e: ResultadoEleicao = { arquivos: [], camaraNoContatos: false, eleitos: [x("Ana", "reeleito", "senado"), x("Davi", "outra_casa", "senado"), x("Bia", "novo", "camara")] };
    const wb = XLSX.read(gerarXlsxEleitos(e), { type: "array" });
    expect(wb.SheetNames).toEqual(["Fica no grupo atual", "Grupo novo", "A conferir"]);
    const ler = (aba: string) => XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[aba]);
    expect(ler("Fica no grupo atual").map((l) => l["Nome de urna"])).toEqual(["Ana", "Davi"]);
    expect(ler("Grupo novo").map((l) => l["Nome de urna"])).toEqual(["Bia"]);
    const cabecalho = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["A conferir"], { header: 1 })[0];
    expect(cabecalho).toEqual([...CABECALHO_ELEITOS]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/export-eleitos.test.ts`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar `lib/export-eleitos.ts`**

```ts
import * as XLSX from "xlsx";
import type { CasaLegislativa, DestinoEleito, EleitoClassificado, ResultadoEleicao } from "@/lib/types";

/** Planilha "Eleitos 2026" do painel (spec 2026-10-05 §5): a lista para o cadastro, por destino. */
export const CABECALHO_ELEITOS = [
  "Casa", "UF", "Nome de urna", "Nome completo", "Partido", "Status do mandato", "Situação (TSE)", "Destino", "Grupo no Contatos", "Motivo",
] as const;

const NOME_CASA: Record<CasaLegislativa, string> = { senado: "Senado Federal", camara: "Câmara dos Deputados" };
const ORDEM_CASA: Record<CasaLegislativa, number> = { senado: 0, camara: 1 };

const ROTULO_DESTINO: Record<DestinoEleito, string> = {
  reeleito: "Reeleito — fica no grupo atual",
  outra_casa: "Eleito para a outra Casa — fica no grupo atual (Ata 14)",
  novo: "Mandato novo — grupo novo",
  conferir: "A conferir",
};

function ordenar(lista: readonly EleitoClassificado[]): EleitoClassificado[] {
  return [...lista].sort((a, b) =>
    ORDEM_CASA[a.eleito.casa] - ORDEM_CASA[b.eleito.casa]
    || a.eleito.uf.localeCompare(b.eleito.uf, "pt-BR")
    || a.eleito.nomeUrna.localeCompare(b.eleito.nomeUrna, "pt-BR"));
}

export function linhasEleitos(lista: readonly EleitoClassificado[]): Record<string, string>[] {
  return ordenar(lista).map((x) => ({
    Casa: NOME_CASA[x.eleito.casa],
    UF: x.eleito.uf,
    "Nome de urna": x.eleito.nomeUrna,
    "Nome completo": x.eleito.nomeCompleto,
    Partido: x.eleito.partido ?? "",
    "Status do mandato": x.eleito.statusMandato,
    "Situação (TSE)": x.eleito.situacaoTse,
    Destino: ROTULO_DESTINO[x.destino],
    "Grupo no Contatos": x.contatos.map((c) => c.grupo).join("; "),
    Motivo: x.motivo ?? "",
  }));
}

const ABAS: readonly { nome: string; destinos: readonly DestinoEleito[] }[] = [
  { nome: "Fica no grupo atual", destinos: ["reeleito", "outra_casa"] },
  { nome: "Grupo novo", destinos: ["novo"] },
  { nome: "A conferir", destinos: ["conferir"] },
];

export function gerarXlsxEleitos(eleicao: ResultadoEleicao): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const aba of ABAS) {
    const linhas = linhasEleitos(eleicao.eleitos.filter((x) => aba.destinos.includes(x.destino)));
    // Aba vazia ainda leva o cabeçalho: quem abre o arquivo vê que a lista existe e está vazia.
    const ws = linhas.length > 0
      ? XLSX.utils.json_to_sheet(linhas, { header: [...CABECALHO_ELEITOS] })
      : XLSX.utils.aoa_to_sheet([[...CABECALHO_ELEITOS]]);
    XLSX.utils.book_append_sheet(wb, ws, aba.nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/export-eleitos.test.ts`
Expected: PASS.

- [ ] **Step 5: Botão de export**

Em `components/export-buttons.tsx`, acrescentar:

```tsx
import { gerarXlsxEleitos } from "@/lib/export-eleitos";
import type { ResultadoEleicao } from "@/lib/types";

export function ExportEleitosButton({ eleicao }: { eleicao: ResultadoEleicao }) {
  return (
    <button
      className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
      onClick={() => baixar("eleitos-2026.xlsx", gerarXlsxEleitos(eleicao),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
      Eleitos 2026 (.xlsx)
    </button>
  );
}
```

(juntar os imports aos que o arquivo já tem).

- [ ] **Step 6: Componente das seções**

`components/secao-eleitos.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Etiqueta } from "@/components/etiqueta";
import type { SecaoEleicao } from "@/lib/painel-eleicao";

/** Seção recolhível dos eleitos fora do Contatos (a cadastrar ou a conferir). Só renderiza. */
export function SecaoEleitos({ secao, abertoInicial }: { secao: SecaoEleicao; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{secao.titulo}</h2>
      </button>
      {aberto && (
        <div className="border-t border-separador">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4 py-2 text-xs text-cinza-claro">
            <div>Nome de urna</div><div>Nome completo</div><div>UF</div><div>Partido</div><div>{secao.id === "conferir" ? "Motivo" : "Gênero"}</div>
          </div>
          {secao.linhas.map((x, i) => (
            <div key={`${x.eleito.casa}-${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,2fr)] items-start gap-4 border-t border-separador px-4 py-2.5 text-sm">
              <div className="font-medium">
                {x.eleito.nomeUrna}
                {x.projecao && <span className="ml-2"><Etiqueta texto="Projeção — aguarda TSE" tom="neutro" /></span>}
              </div>
              <div className="text-cinza">{x.eleito.nomeCompleto}</div>
              <div>{x.eleito.uf}</div>
              <div className="text-cinza">{x.eleito.partido ?? "—"}</div>
              <div className={secao.id === "conferir" ? "text-xs text-atencao" : "text-cinza"}>
                {secao.id === "conferir" ? x.motivo : (x.eleito.genero ?? "—")}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Painel: chave, filtros, aviso, seções e export**

Em `components/painel.tsx`:

1. Imports:

```ts
import { ExportButtons, ExportEleitosButton } from "@/components/export-buttons";
import { SecaoEleitos } from "@/components/secao-eleitos";
import { avisoDaEleicao, ehFiltroEleicao, FILTROS_ELEICAO, secoesDeEleicao } from "@/lib/painel-eleicao";
```

(o import de `ExportButtons` existente vira esse.)

2. Estado, depois de `const [grupo, setGrupo] = useState("");`:

```ts
  const temEleicao = retrato.eleicao !== undefined;
  const [eleicaoLigada, setEleicaoLigada] = useState(false);
  const secoes = useMemo(() => (eleicaoLigada ? secoesDeEleicao(retrato.eleicao, filtro, busca) : []), [eleicaoLigada, retrato, filtro, busca]);
  const avisoEleicao = eleicaoLigada ? avisoDaEleicao(retrato.eleicao) : undefined;
  const alternarEleicao = () => {
    if (eleicaoLigada && ehFiltroEleicao(filtro)) mudarFiltro(() => setFiltro("tudo"));
    setEleicaoLigada((v) => !v);
  };
```

Atenção à ordem: `mudarFiltro` é declarado depois de `filtrando`; declarar `alternarEleicao` **depois** de `mudarFiltro`.

3. No cabeçalho, depois de `<ExportButtons analise={retrato} />`:

```tsx
          {temEleicao && retrato.eleicao && <ExportEleitosButton eleicao={retrato.eleicao} />}
```

4. Na barra de filtros, a lista de chips passa a ser `[...FILTROS, ...(eleicaoLigada ? FILTROS_ELEICAO : [])]`, e antes do `<label htmlFor="grupo"…>`:

```tsx
        {temEleicao && (
          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs">
            <input type="checkbox" role="switch" aria-checked={eleicaoLigada} checked={eleicaoLigada} onChange={alternarEleicao} className="accent-acao" />
            Eleição 2026
          </label>
        )}
```

5. Depois da linha com "Expandir todos"/"Recolher todos":

```tsx
      {avisoEleicao && <p className="mt-2 text-xs text-atencao">{avisoEleicao}</p>}
```

6. Passar `eleicaoLigada` para cada `LinhaContato`: `<LinhaContato … eleicaoLigada={eleicaoLigada} />`.

7. Depois do `grupos.map(...)`, antes da mensagem de vazio:

```tsx
        {secoes.map((s) => <SecaoEleitos key={`${s.id}-${filtrando}`} secao={s} abertoInicial={filtrando} />)}
```

e a mensagem de vazio passa a ser `{grupos.length === 0 && secoes.length === 0 && …}`.

- [ ] **Step 8: Linha do contato: etiqueta, destaque e bloco no detalhe**

Em `components/linha-contato.tsx`:

1. Import: `import { destacaLinha, detalheDaEleicao, etiquetasDeEleicao } from "@/lib/painel-eleicao";` e `EleicaoContato` no import de tipos.
2. Bloco novo:

```tsx
function BlocoEleicao({ e }: { e: EleicaoContato }) {
  const d = detalheDaEleicao(e);
  return (
    <div className={`rounded-lg border p-4 ${e.destino === "outra_casa" ? "border-atencao-borda bg-atencao-fundo/40" : "border-borda bg-cartao"}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Eleição 2026</span>
        {etiquetasDeEleicao(e).map((x) => <Etiqueta key={x.texto} texto={x.texto} tom={x.tom} explicacao={x.explicacao} />)}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {d.linhas.map((l) => (
          <div key={l.rotulo} className="contents">
            <dt className="text-xs leading-6 text-cinza-claro">{l.rotulo}</dt>
            <dd>{l.valor}</dd>
          </div>
        ))}
      </dl>
      {d.orientacao && <p className="mt-2 text-sm font-medium text-atencao">{d.orientacao}</p>}
    </div>
  );
}
```

3. `Detalhe` recebe `eleicaoLigada: boolean` e, depois de `<BlocoEndereco … />`: `{eleicaoLigada && c.eleicao && <BlocoEleicao e={c.eleicao} />}`.
4. `LinhaContato` recebe `eleicaoLigada = false` nas props; as etiquetas da linha ficam:

```ts
  const etiquetas = [...etiquetasDoContato(c, g), ...(eleicaoLigada ? etiquetasDeEleicao(c.eleicao) : [])];
```

(`situacaoDoContato` continua sem a eleição: ela não muda a situação.) O `div` externo ganha o destaque:

```tsx
    <div className={`border-t border-separador ${eleicaoLigada && destacaLinha(c.eleicao) ? "border-l-4 border-l-atencao" : ""}`}>
```

e o `Detalhe` recebe `eleicaoLigada={eleicaoLigada}`.

- [ ] **Step 9: Suíte, typecheck, build e commit**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: tudo verde; build conclui.

```bash
git add lib/export-eleitos.ts tests/export-eleitos.test.ts components/export-buttons.tsx components/secao-eleitos.tsx components/painel.tsx components/linha-contato.tsx
git commit -m "feat: chave Eleição 2026 no painel, seções a cadastrar e a conferir, export dos eleitos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Validação com os dados reais e documentação

**Files:**
- Create (fora do git): `.fiscal/validar-eleitos.ts` (`.fiscal/` está no `.gitignore`; dentro do projeto para resolver `@/` e `node_modules`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `lerPlanilhaEleicao`, `juntarArquivosEleicao` (Task 1), `aplicarEleicao` (Task 2), o retrato local `.fiscal/retrato.json`.
- Produces: contagens por destino × casa e por motivo de `conferir`, sem nomes, para o relatório ao Clovis.

- [ ] **Step 1: Script de validação (não versionado)**

Em `.fiscal/validar-eleitos.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerPlanilhaEleicao, juntarArquivosEleicao, type ArquivoEleicaoLido } from "@/lib/planilha-eleitos";
import { aplicarEleicao } from "@/lib/eleitos";
import type { Retrato } from "@/lib/types";

const PASTA = "C:/Users/Clovis Sabino/SF Claude/GT Posse/Eleitos 2026";
const ARQUIVOS = ["Senadores Eleitos 2026.xlsx", "Deputados Federais Eleitos 2026.xlsx", "Deputados Federais Atuais (57a legislatura).xlsx"];

const lidos: ArquivoEleicaoLido[] = ARQUIVOS.map((nome) => {
  const b = readFileSync(join(PASTA, nome));
  return { nome, arquivo: lerPlanilhaEleicao(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
});
const { eleitos, deputadosAtuais, arquivosEleicao } = juntarArquivosEleicao(lidos);
const retrato = JSON.parse(readFileSync(".fiscal/retrato.json", "utf8")) as Retrato;
const r = aplicarEleicao(retrato, eleitos, arquivosEleicao, deputadosAtuais);

const conta = new Map<string, number>();
for (const x of r.eleicao?.eleitos ?? []) {
  const k = `${x.eleito.casa} | ${x.destino}${x.projecao ? " | projeção" : ""}`;
  conta.set(k, (conta.get(k) ?? 0) + 1);
}
console.log([...conta.entries()].sort().map(([k, v]) => `${v}\t${k}`).join("\n"));
const motivos = new Map<string, number>();
for (const x of r.eleicao?.eleitos ?? []) if (x.motivo) motivos.set(x.motivo.replace(/"[^"]*"/g, '"…"'), (motivos.get(x.motivo.replace(/"[^"]*"/g, '"…"')) ?? 0) + 1);
console.log("\nMotivos de conferir:\n" + [...motivos.entries()].map(([k, v]) => `${v}\t${k}`).join("\n"));
console.log("\nLinhas do Contatos marcadas:", r.grupos.flatMap((g) => g.contatos).filter((c) => c.eleicao).length);
```

O script imprime só contagens e motivos (os motivos não carregam nome; o nome do grupo entre aspas é mascarado).

- [ ] **Step 2: Rodar**

Run (da raiz do projeto): `npx --yes tsx --tsconfig tsconfig.json .fiscal/validar-eleitos.ts`
Depois de usar, apagar o arquivo: `rm .fiscal/validar-eleitos.ts`.
Expected, comparando com o spec §4 (dados de 05/10):
- `senado | reeleito` perto de 14 (13 reeleições + 1 suplente), menos os que caírem em `conferir` por não casar com o grupo Senadores;
- `senado | outra_casa` perto de 19, menos quem não está na lista de deputados atuais (pelo menos 1 caso esperado);
- `senado | novo` = 19; `senado | conferir` ≥ 2;
- `camara | reeleito` perto de 307 (296 + 11), menos quem não consta da lista de atuais;
- `camara | outra_casa` = 1 (o senador atual eleito deputado), ou 0 com 1 a mais em `conferir`;
- `camara | novo` = 172; `camara | conferir` ≥ 33;
- linhas do Contatos marcadas: cerca de 14 a 15 senadores (reeleitos + o que vai à Câmara).

Se `senado | reeleito` cair para menos de 11, ou se `conferir` tiver um motivo inesperado com contagem alta, **parar e investigar** o casamento (UF do `Departamento`, grafia) antes de seguir; não afrouxar o critério `pontuarPessoa >= 1` sem antes medir.

- [ ] **Step 3: Conferir no navegador**

Run: `npm run dev` e abrir `http://localhost:3000/nova-varredura`. Escolher a planilha de contatos, a de endereços e as três de `Eleitos 2026` (as três de uma vez no passo 3). Varrer. No painel:
- ligar "Eleição 2026": aparecem os filtros novos, o aviso dos deputados e as seções no fim;
- abrir o grupo Senadores: os reeleitos com "Reeleito"; o senador eleito deputado com "Eleito deputado — atenção" e a borda âmbar; ao abrir a linha, o bloco "Eleição 2026" com a orientação da Ata 14;
- filtro "A cadastrar": só as duas seções; "A conferir": só a terceira;
- desligar a chave com um filtro da eleição ativo: volta para "Tudo";
- baixar "Eleitos 2026 (.xlsx)" e conferir as três abas.

- [ ] **Step 4: Documentar no `CLAUDE.md`**

1. Em "Layout do código", na linha de `lib/`, acrescentar `uf, planilha-eleitos, eleitos, painel-eleicao, export-eleitos`.
2. Em "Princípios de implementação", novo item:

```markdown
- **Eleição 2026 é um eixo independente e não pinta o semáforo.** As planilhas de `GT Posse/Eleitos 2026` são opcionais na Nova varredura (passo 3), lidas no navegador (`lib/planilha-eleitos.ts`, reconhecidas pela aba). `aplicarEleicao` (`lib/eleitos.ts`) roda depois de `analisar`: o destino vem do `Status do mandato` (reeleito e quem troca de Casa ficam no grupo atual, pela Ata 14 do GT Cerimonial; mandato novo vai para "Senadores/Deputados Federais Eleitos"); o Contatos só acha a linha e pega contradição, que vira `conferir`, nunca decisão. Casamento por nome com a UF do `Departamento` como guarda e `pontuarPessoa >= 1`. O retrato publicado vai sem `eleicao.deputadosAtuais`.
```

3. Em "Estado do projeto", atualizar a contagem da suíte com o número que `npx vitest run` mostrar.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md com a eleição 2026 no painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
