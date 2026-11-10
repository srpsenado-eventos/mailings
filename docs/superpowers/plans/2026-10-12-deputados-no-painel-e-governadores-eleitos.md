# Deputados Federais no painel e Governadores eleitos — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development. Passos com checkbox (`- [ ]`).

**Objetivo:** mostrar o grupo Deputados Federais no painel (local e web) e trazer os governadores eleitos de 2026 para o eixo Eleição 2026.

**Arquitetura:** o grupo dos deputados é montado na tela por função pura a partir de `retrato.eleicao` (sem mexer na varredura). Os governadores ganham leitor próprio (aba "Eleitos 1º turno"), classificação pura em `lib/eleitos-governo.ts`, campo `ResultadoContato.eleicaoGoverno` e `ResultadoEleicao.governadores`, anexados por `aplicarEleicao` numa passada posterior. Nada pinta o semáforo.

**Stack:** Next.js 15 App Router, TypeScript, Tailwind, SheetJS (`xlsx`), Vitest. npm.

**Spec:** `docs/superpowers/specs/2026-10-12-deputados-no-painel-e-governadores-eleitos-design.md` (ler antes; complementa `2026-10-05-eleitos-2026-e-ajustes-prodasen-design.md`).

## Restrições globais

- `lib/*.ts` puro e imutável (nunca mutar entrada), sem `any`, sem JSX; componentes só renderizam.
- Testes AAA, nomes em português, **dados fictícios** (nenhum nome real de parlamentar ou governador).
- Nada de `console.*` com nome, e-mail ou telefone.
- Eleição e governo **não** entram em `comparacoes`, `camposDivergentes`, `resumo`, nem criam `possivelSaida`.
- Publicado: deputados sem `email`, `telefone`, `predio`, `sala`; governadores inteiros (TSE, público).
- Cada tarefa termina com `npm test` e `npm run typecheck` verdes (rodar pelo PowerShell) e um commit próprio terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `feat/deputados-governadores` (já criada, com o spec).

## Foco de revisão

1. Retrato gravado antes desta entrega (sem `governadores`, sem `eleicaoGoverno`): painel, export e `/prodasen` não podem quebrar. Teste em cada tarefa que lê esses campos.
2. Grupo "Deputados Federais" existindo no Contatos (`camaraNoContatos: true`): o grupo virtual some, sem duplicar deputados. Teste na Tarefa 1.
3. Busca e seletor de grupo com o grupo virtual: buscar um nome que só existe entre os deputados mostra o grupo; escolher outro grupo esconde-o. Teste na Tarefa 1.
4. Planilha de governadores depois do 2º turno, com a aba `2º turno` vazia ou ausente: lê sem erro, `segundoTurno` vazio. Teste na Tarefa 2.
5. Duas UFs com o mesmo nome de candidato / governador homônimo em outra UF: a UF do `Departamento` impede o casamento errado. Teste na Tarefa 3.

---

### Tarefa 1: grupo Deputados Federais no painel e na web

**Arquivos:**
- Criar: `lib/painel-deputados.ts`, `components/grupo-deputados.tsx`, `tests/painel-deputados.test.ts`
- Modificar: `lib/painel-eleicao.ts` (seção `camara_novos` some quando o grupo virtual existe), `components/painel.tsx`, `lib/publicar.ts`, `tests/publicar.test.ts`, `tests/painel-eleicao.test.ts`

**Interfaces:**
- Consome: `ResultadoEleicao`, `DeputadoAtual`, `EleitoClassificado` (`lib/types.ts`), `Etiqueta` (`lib/painel.ts`), `ORIENTACAO_OUTRA_CASA` (`lib/eleitos.ts`), `normalizarTexto`.
- Produz:
```ts
export const NOME_GRUPO_DEPUTADOS = "Deputados Federais";
export interface LinhaDeputado { nome: string; nomeCivil: string; uf: string; partido?: string; condicao?: string; etiquetas: Etiqueta[] }
export interface GrupoDeputados { titulo: string; aviso: string; atuais: LinhaDeputado[]; aCadastrar: EleitoClassificado[]; totalAtuais: number }
export function etiquetasDoDeputado(resumo: string | undefined): Etiqueta[]
export function temGrupoDeputados(eleicao: ResultadoEleicao | undefined): boolean
export function grupoDeputados(eleicao: ResultadoEleicao | undefined, opcoes: { busca: string; filtro: string; grupo: string }): GrupoDeputados | undefined
export function resumoGrupoDeputados(g: GrupoDeputados): string
```
  A Tarefa 4 acrescenta a etiqueta "Eleito governador — atenção" aqui; deixe `etiquetasDoDeputado` como função isolada para isso.

- [ ] **Passo 1: testes que falham** (`tests/painel-deputados.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { etiquetasDoDeputado, grupoDeputados, resumoGrupoDeputados, temGrupoDeputados } from "@/lib/painel-deputados";
import type { DeputadoAtual, EleitoClassificado, ResultadoEleicao } from "@/lib/types";

const dep = (p: Partial<DeputadoAtual>): DeputadoAtual => ({ uf: "AC", nomeParlamentar: "Fulano Teste", nomeCivil: "Fulano de Tal Teste", ...p });
const novo = (nome: string, uf = "AC"): EleitoClassificado => ({
  eleito: { casa: "camara", uf, nomeUrna: nome, nomeCompleto: `${nome} Completo`, situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", projecao: false, contatos: [],
});
const eleicao = (p: Partial<ResultadoEleicao> = {}): ResultadoEleicao => ({
  arquivos: [], eleitos: [], camaraNoContatos: false,
  deputadosAtuais: [dep({ uf: "SP", nomeParlamentar: "Beltrano", eleicao2026: "Reeleito deputado federal" }), dep({ eleicao2026: "Não concorreu em 2026" })],
  ...p,
});
const tudo = { busca: "", filtro: "tudo", grupo: "" };

describe("etiquetasDoDeputado", () => {
  it.each([
    ["Reeleito deputado federal", ["Reeleito"]],
    ["Reeleito deputado federal (projeção)", ["Reeleito", "Projeção — aguarda TSE"]],
    ["Eleito senador", ["Eleito senador — atenção"]],
    ["Concorreu e não se elegeu / aguarda definição", ["Não reeleito / aguarda definição"]],
    ["Não concorreu em 2026", ["Não concorreu"]],
    ["Algo novo", ["Algo novo"]],
    [undefined, []],
    ["", []],
  ])("resumo %s vira %j", (resumo, textos) => {
    expect(etiquetasDoDeputado(resumo as string | undefined).map((e) => e.texto)).toEqual(textos);
  });
  it("eleito senador é atenção com a orientação da Ata 14", () => {
    const [e] = etiquetasDoDeputado("Eleito senador");
    expect(e.tom).toBe("atencao");
    expect(e.explicacao).toContain("Ata 14");
  });
});

describe("grupoDeputados", () => {
  it("sem deputados atuais não há grupo", () => {
    expect(grupoDeputados(eleicao({ deputadosAtuais: undefined }), tudo)).toBeUndefined();
    expect(grupoDeputados(undefined, tudo)).toBeUndefined();
  });
  it("com o grupo no Contatos o virtual some", () => {
    expect(temGrupoDeputados(eleicao({ camaraNoContatos: true }))).toBe(false);
    expect(grupoDeputados(eleicao({ camaraNoContatos: true }), tudo)).toBeUndefined();
  });
  it("ordena por UF e nome e leva a etiqueta", () => {
    const g = grupoDeputados(eleicao(), tudo)!;
    expect(g.atuais.map((d) => d.uf)).toEqual(["AC", "SP"]);
    expect(g.atuais[1].etiquetas.map((e) => e.texto)).toEqual(["Reeleito"]);
    expect(g.totalAtuais).toBe(2);
  });
  it("traz os eleitos de mandato novo da Câmara ainda não cadastrados", () => {
    const g = grupoDeputados(eleicao({ eleitos: [novo("Novato"), { ...novo("Já Cadastrado"), jaCadastrado: true }, { ...novo("Senador Novo"), eleito: { ...novo("x").eleito, casa: "senado" } }] }), tudo)!;
    expect(g.aCadastrar.map((x) => x.eleito.nomeUrna)).toEqual(["Novato"]);
  });
  it("busca por nome civil, UF ou partido", () => {
    const g = grupoDeputados(eleicao(), { ...tudo, busca: "fulano de tal" })!;
    expect(g.atuais).toHaveLength(1);
    expect(grupoDeputados(eleicao(), { ...tudo, busca: "ninguem assim" })).toBeUndefined();
  });
  it("seletor de outro grupo esconde; o próprio mostra", () => {
    expect(grupoDeputados(eleicao(), { ...tudo, grupo: "Senadores" })).toBeUndefined();
    expect(grupoDeputados(eleicao(), { ...tudo, grupo: "Deputados Federais" })).toBeDefined();
  });
  it("filtros de situação escondem; Reeleitos mostra só os reeleitos", () => {
    expect(grupoDeputados(eleicao(), { ...tudo, filtro: "ressalva" })).toBeUndefined();
    const g = grupoDeputados(eleicao(), { ...tudo, filtro: "reeleitos" })!;
    expect(g.atuais.map((d) => d.nome)).toEqual(["Beltrano"]);
    expect(g.aCadastrar).toEqual([]);
  });
  it("A cadastrar mostra só os eleitos novos", () => {
    const g = grupoDeputados(eleicao({ eleitos: [novo("Novato")] }), { ...tudo, filtro: "a_cadastrar" })!;
    expect(g.atuais).toEqual([]);
    expect(g.aCadastrar).toHaveLength(1);
  });
  it("resumo do cabeçalho", () => {
    const g = grupoDeputados(eleicao({ eleitos: [novo("Novato")] }), tudo)!;
    expect(resumoGrupoDeputados(g)).toBe("2 deputados em exercício · 1 eleito a cadastrar");
  });
});
```


- [ ] **Passo 2: rodar e ver falhar** — `npx vitest run tests/painel-deputados.test.ts` → falha por módulo inexistente.

- [ ] **Passo 3: implementar `lib/painel-deputados.ts`**

```ts
import { ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import { normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { DeputadoAtual, EleitoClassificado, ResultadoEleicao } from "@/lib/types";

/**
 * Grupo "Deputados Federais" montado na tela a partir da planilha da Câmara (spec 2026-10-12 §3),
 * enquanto o grupo não existe no Contatos. Não é auditoria: não entra no resumo nem no semáforo.
 */
export const NOME_GRUPO_DEPUTADOS = "Deputados Federais";
const AVISO = "Planilha da Câmara: o grupo ainda não está no Contatos";
const PROJECAO: Etiqueta = { campo: "eleicao", texto: "Projeção — aguarda TSE", tom: "neutro", explicacao: "O TSE ainda não homologou os eleitos desta UF; a lista segue a projeção da imprensa" };

export interface LinhaDeputado { nome: string; nomeCivil: string; uf: string; partido?: string; condicao?: string; etiquetas: Etiqueta[] }
export interface GrupoDeputados { titulo: string; aviso: string; atuais: LinhaDeputado[]; aCadastrar: EleitoClassificado[]; totalAtuais: number }

const reeleito: Etiqueta = { campo: "eleicao", texto: "Reeleito", tom: "ok", explicacao: "Reeleito em 04/10/2026: fica neste grupo" };

export function etiquetasDoDeputado(resumo: string | undefined): Etiqueta[] {
  const bruto = (resumo ?? "").trim();
  if (bruto === "") return [];
  const r = normalizarTexto(bruto);
  if (r === "reeleito deputado federal") return [reeleito];
  if (r === "reeleito deputado federal (projecao)") return [reeleito, PROJECAO];
  if (r === "eleito senador") return [{ campo: "eleicao", texto: "Eleito senador — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA }];
  if (r.startsWith("concorreu e nao se elegeu")) return [{ campo: "eleicao", texto: "Não reeleito / aguarda definição", tom: "neutro" }];
  if (r === "nao concorreu em 2026") return [{ campo: "eleicao", texto: "Não concorreu", tom: "neutro" }];
  return [{ campo: "eleicao", texto: bruto, tom: "neutro" }];
}

export function temGrupoDeputados(eleicao: ResultadoEleicao | undefined): boolean {
  return !!eleicao?.deputadosAtuais && !eleicao.camaraNoContatos;
}

const casaBusca = (valores: readonly (string | undefined)[], b: string) =>
  b === "" || valores.some((v) => v !== undefined && normalizarTexto(v).includes(b));

const linha = (d: DeputadoAtual): LinhaDeputado => ({
  nome: d.nomeParlamentar, nomeCivil: d.nomeCivil, uf: d.uf,
  ...(d.partido ? { partido: d.partido } : {}), ...(d.condicao ? { condicao: d.condicao } : {}),
  etiquetas: etiquetasDoDeputado(d.eleicao2026),
});

/** Quais linhas cada filtro deixa passar. Filtro fora desta tabela (situação do Contatos) esconde o grupo. */
const FILTRO: Record<string, { atual: (l: LinhaDeputado) => boolean; novos: boolean }> = {
  tudo: { atual: () => true, novos: true },
  reeleitos: { atual: (l) => l.etiquetas.some((e) => e.texto === "Reeleito"), novos: false },
  outra_casa: { atual: (l) => l.etiquetas.some((e) => e.tom === "atencao"), novos: false },
  a_cadastrar: { atual: () => false, novos: true },
};

export function grupoDeputados(
  eleicao: ResultadoEleicao | undefined,
  { busca, filtro, grupo }: { busca: string; filtro: string; grupo: string },
): GrupoDeputados | undefined {
  if (!eleicao || !temGrupoDeputados(eleicao)) return undefined;
  if (grupo !== "" && grupo !== NOME_GRUPO_DEPUTADOS) return undefined;
  const regra = FILTRO[filtro];
  if (!regra) return undefined;
  const b = normalizarTexto(busca.trim());
  const todos = [...(eleicao.deputadosAtuais ?? [])]
    .sort((a, c) => a.uf.localeCompare(c.uf, "pt-BR") || a.nomeParlamentar.localeCompare(c.nomeParlamentar, "pt-BR"))
    .map(linha);
  const atuais = todos.filter((l) => regra.atual(l) && casaBusca([l.nome, l.nomeCivil, l.uf, l.partido], b));
  const aCadastrar = regra.novos
    ? eleicao.eleitos.filter((x) => x.eleito.casa === "camara" && x.destino === "novo" && !x.jaCadastrado
        && casaBusca([x.eleito.nomeUrna, x.eleito.nomeCompleto, x.eleito.uf, x.eleito.partido], b))
    : [];
  if (atuais.length === 0 && aCadastrar.length === 0) return undefined;
  return { titulo: NOME_GRUPO_DEPUTADOS, aviso: AVISO, atuais, aCadastrar, totalAtuais: todos.length };
}

export function resumoGrupoDeputados(g: GrupoDeputados): string {
  const n = g.aCadastrar.length;
  return [
    `${g.atuais.length} ${g.atuais.length === 1 ? "deputado" : "deputados"} em exercício`,
    n > 0 ? `${n} ${n === 1 ? "eleito" : "eleitos"} a cadastrar` : "",
  ].filter(Boolean).join(" · ");
}
```

- [ ] **Passo 4: seção do fim sem repetir deputados.** Em `lib/painel-eleicao.ts`, `secoesDeEleicao`: quando `temGrupoDeputados(eleicao)` for verdadeiro, omitir a seção `camara_novos` (os eleitos novos já aparecem dentro do grupo). Importe `temGrupoDeputados` de `@/lib/painel-deputados` (cuidado com import circular: `painel-deputados` não importa `painel-eleicao`). Teste em `tests/painel-eleicao.test.ts`: com `deputadosAtuais` e `camaraNoContatos: false`, `secoesDeEleicao(e, "tudo", "")` não traz `camara_novos`; sem `deputadosAtuais`, traz.

- [ ] **Passo 5: componente `components/grupo-deputados.tsx`** (`"use client"`), no visual do `<section>` dos grupos em `components/painel.tsx` (cabeçalho sticky recolhível com `▾/▸`, `h2` font-serif, resumo em `text-xs text-cinza`, aviso `text-xs text-cinza` à direita como `EstadoDaFonte`). Corpo aberto: cabeçalho de colunas "Deputado", "UF", "Partido", "Condição", "Eleição 2026"; uma linha por `LinhaDeputado` (nome em `font-medium`, nome civil em `text-xs text-cinza` abaixo, etiquetas com `<Etiqueta texto tom explicacao />` de `components/etiqueta`). Depois, se `aCadastrar.length > 0`, reutilize `SecaoEleitos` com `{ id: "camara_novos", titulo: \`Deputados Federais Eleitos — a cadastrar (${n})\`, linhas: aCadastrar }` e `abertoInicial={false}`. Props: `{ grupo: GrupoDeputados; aberto: boolean; onAlternar: () => void }`. Sem e-mail, telefone, prédio e sala.

- [ ] **Passo 6: ligar no painel** (`components/painel.tsx`):
  - `const deputados = useMemo(() => grupoDeputados(retrato.eleicao, { busca, filtro, grupo }), [retrato, busca, filtro, grupo]);`
  - No `<select>` de grupo, depois dos grupos do retrato: `{temGrupoDeputados(retrato.eleicao) && <option value={NOME_GRUPO_DEPUTADOS}>{NOME_GRUPO_DEPUTADOS}</option>}`.
  - Renderizar `<GrupoDeputados grupo={deputados} aberto={estaAberto(NOME_GRUPO_DEPUTADOS)} onAlternar={() => alternar(NOME_GRUPO_DEPUTADOS)} />` depois de `grupos.map(...)` e antes de `secoes.map(...)`.
  - "Nada para mostrar" passa a exigir também `!deputados`.
  - `abrirTodos` inclui `NOME_GRUPO_DEPUTADOS` quando há `deputados`.
  - `filtrarGrupos` com `grupo === NOME_GRUPO_DEPUTADOS` já devolve `[]` para os grupos do Contatos (nenhum tem esse nome enquanto `camaraNoContatos` é falso); não mexer.

- [ ] **Passo 7: publicar deputados sem dados de contato.** `lib/publicar.ts`: trocar `deputadosAtuais: undefined` por
```ts
const CAMPOS_DEPUTADO_PESSOAIS = ["email", "telefone", "predio", "sala"] as const;
function deputadoSemContato(d: DeputadoAtual): DeputadoAtual {
  const copia: DeputadoAtual = { ...d };
  for (const c of CAMPOS_DEPUTADO_PESSOAIS) delete copia[c];
  return copia;
}
// ...
...(retrato.eleicao ? { eleicao: { ...retrato.eleicao, ...(retrato.eleicao.deputadosAtuais ? { deputadosAtuais: retrato.eleicao.deputadosAtuais.map(deputadoSemContato) } : {}) } } : {}),
```
  Atualizar o comentário do arquivo e o de `ResultadoEleicao.deputadosAtuais` em `lib/types.ts` ("vai para a web sem e-mail, telefone, prédio e sala"). Em `tests/publicar.test.ts`, trocar o teste que esperava `deputadosAtuais` ausente por: publica os deputados com nome, UF, partido e `eleicao2026`, e `JSON.stringify` do resultado não contém o e-mail, o telefone, o prédio nem a sala fictícios; a entrada não é mutada.

- [ ] **Passo 8:** `npm test` e `npm run typecheck` verdes.

- [ ] **Passo 9: commit** `feat: grupo Deputados Federais no painel e na web`.

---

### Tarefa 2: leitura da planilha de governadores

**Arquivos:**
- Modificar: `lib/types.ts`, `lib/planilha-eleitos.ts`, `lib/analise-payload.ts`, `components/nova-varredura-form.tsx` (só texto do passo 3), `tests/planilha-eleitos.test.ts`, `tests/analise-payload.test.ts`

**Interfaces:**
- Produz (em `lib/types.ts`):
```ts
/** Uma linha de `Governadores Eleitos 2026.xlsx` (abas "Eleitos 1º turno" e "2º turno"). Dado público do TSE. */
export interface GovernadorPlanilha {
  uf: string; nomeUrna: string; nomeCompleto: string; partido?: string;
  situacaoTse: string; statusMandato: string; baseStatus?: string; genero?: string; vice?: string;
}
export interface PlanilhaGovernadores { eleitos: GovernadorPlanilha[]; segundoTurno: GovernadorPlanilha[] }
```
- Em `lib/planilha-eleitos.ts`: `ArquivoEleicao` ganha `| { tipo: "governo"; governadores: PlanilhaGovernadores }`; `juntarArquivosEleicao` devolve também `governadores?: PlanilhaGovernadores`; `resumoArquivoEleicao` para governo: `"20 governadores eleitos · 7 UFs no 2º turno"` (UFs distintas da aba de 2º turno; sem 2º turno: só `"N governadores eleitos"`).
- Em `lib/analise-payload.ts`: `PayloadAnalise.governadores?: PlanilhaGovernadores`.

- [ ] **Passo 1: testes que falham** em `tests/planilha-eleitos.test.ts`, montando a planilha em memória como os testes existentes do arquivo fazem (`XLSX.utils.aoa_to_sheet`, `book_append_sheet`, `XLSX.write(..., { type: "array" })`):
  - aba "Eleitos 1º turno" com cabeçalho `UF, Nome de urna, Nome completo, Partido, Coligação / Federação, Votos, % votos válidos, Situação (TSE), Status do mandato, Base do status, Gênero (TSE), Nascimento, Ocupação declarada, Vice na chapa` e duas linhas fictícias; aba "2º turno" com duas linhas da mesma UF → `{ tipo: "governo", governadores: { eleitos: [2], segundoTurno: [2] } }`, UF em maiúsculas, `vice` lido de "Vice na chapa".
  - sem a aba "2º turno" → `segundoTurno: []`; aba "2º turno" só com cabeçalho → `[]`.
  - "Eleitos 1º turno" sem "Status do mandato" → `ColunaFaltanteError`.
  - `resumoArquivoEleicao` com e sem 2º turno.
  - `juntarArquivosEleicao` com senado + governo → `eleitos` só os do senado, `governadores` presente, `arquivosEleicao` com os dois nomes.
  - `PlanilhaEleicaoDesconhecidaError` cita "Eleitos 1º turno".
  E em `tests/analise-payload.test.ts`: `governadores` válido passa; `governadores: { eleitos: "x" }` → `PayloadInvalidoError`; ausente → campo ausente.

- [ ] **Passo 2:** rodar e ver falhar.

- [ ] **Passo 3: implementar o leitor.** Em `lerPlanilhaEleicao`, **antes** de procurar a aba "eleitos":
```ts
const COLUNAS_GOVERNO = {
  uf: "uf", nomeUrna: "nome de urna", nomeCompleto: "nome completo", partido: "partido",
  situacaoTse: "situacao (tse)", statusMandato: "status do mandato", baseStatus: "base do status",
  genero: "genero (tse)", vice: "vice na chapa",
} as const;
const OBRIGATORIAS_GOVERNO = ["uf", "nomeUrna", "nomeCompleto", "situacaoTse", "statusMandato"] as const;

function lerGovernadores(ws: XLSX.WorkSheet): GovernadorPlanilha[] {
  return lerTabela(ws, COLUNAS_GOVERNO, OBRIGATORIAS_GOVERNO)
    .filter((l) => l.nomeUrna || l.nomeCompleto)
    .map((l) => ({
      uf: l.uf.toUpperCase(), nomeUrna: l.nomeUrna, nomeCompleto: l.nomeCompleto, situacaoTse: l.situacaoTse,
      statusMandato: l.statusMandato,
      ...Object.fromEntries(([["partido", l.partido], ["baseStatus", l.baseStatus], ["genero", l.genero], ["vice", l.vice]] as const)
        .filter(([, v]) => v.length > 0)),
    }));
}
// em lerPlanilhaEleicao:
const primeiroTurno = aba(wb, normalizarTexto("Eleitos 1º turno"));
if (primeiroTurno) {
  const segunda = aba(wb, normalizarTexto("2º turno"));
  const vazia = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }).length <= 1;
  return { tipo: "governo", governadores: {
    eleitos: lerGovernadores(primeiroTurno),
    segundoTurno: segunda && !vazia(segunda) ? lerGovernadores(segunda) : [],
  } };
}
```
  Confira com um teste que `normalizarTexto("Eleitos 1º turno")` casa o nome da aba como o Excel o grava (o `º` pode virar `o` ou sumir na normalização; use a mesma função dos dois lados, como acima). Ajustar `juntarArquivosEleicao` (`eleitos` ignora `governo`; `governadores` = último arquivo de tipo `governo`) e `resumoArquivoEleicao`. Mensagem do erro: `Planilha não reconhecida: esperada a aba "Eleitos" (senadores ou deputados eleitos), "Em exercício" (deputados atuais) ou "Eleitos 1º turno" (governadores).`

- [ ] **Passo 4: payload.** Em `lib/analise-payload.ts`, `narrowGovernador` no molde de `narrowEleito` (sem `casa`; opcionais `partido`, `baseStatus`, `genero`, `vice`) e:
```ts
function narrowGovernadores(v: unknown): PlanilhaGovernadores {
  const o = objeto(v);
  const eleitos = listaOpcional(o.eleitos, "governadores eleitos", narrowGovernador);
  const segundoTurno = listaOpcional(o.segundoTurno, "governadores no 2º turno", narrowGovernador);
  if (!eleitos) throw new PayloadInvalidoError("Lista de governadores eleitos ausente.");
  return { eleitos, segundoTurno: segundoTurno ?? [] };
}
```
  e `...(extra.governadores !== undefined ? { governadores: narrowGovernadores(extra.governadores) } : {})` no retorno.

- [ ] **Passo 5: formulário.** Em `components/nova-varredura-form.tsx`, o texto do passo 3 passa a: "As planilhas da pasta **Eleitos 2026**: senadores eleitos, deputados federais eleitos, deputados atuais e governadores eleitos. Pode escolher as quatro de uma vez." O envio já espalha `juntarArquivosEleicao(eleicao)`, que agora inclui `governadores`.

- [ ] **Passo 6:** `npm test`, `npm run typecheck` verdes. A rota ainda ignora `governadores` (Tarefa 3).

- [ ] **Passo 7: commit** `feat: leitura da planilha de governadores eleitos`.

---

### Tarefa 3: classificação dos governadores e anexo ao retrato

**Arquivos:**
- Criar: `lib/eleitos-governo.ts`, `tests/eleitos-governo.test.ts`
- Modificar: `lib/types.ts`, `lib/eleitos.ts` (exportar auxiliares e aceitar governadores em `aplicarEleicao`), `app/api/analise/route.ts`, `tests/eleitos.test.ts`

**Interfaces:**
- Consome: `GovernadorPlanilha`, `PlanilhaGovernadores` (Tarefa 2).
- Produz (em `lib/types.ts`):
```ts
export type DestinoGoverno = "reeleito" | "outro_cargo" | "novo" | "conferir";
export interface GovernadorClassificado {
  eleito: GovernadorPlanilha;
  destino: DestinoGoverno;
  motivo?: string;
  /** Linhas do Contatos casadas (Governadores, Senadores ou Deputados Federais). */
  contatos: ContatoDoEleito[];
  /** Mandato novo já cadastrado em "Governadores Eleitos". */
  jaCadastrado?: boolean;
  /** Deputado em exercício (planilha da Câmara) eleito governador, quando o grupo não está no Contatos. */
  deputadoAtual?: { uf: string; nomeParlamentar: string };
}
export interface UfSegundoTurno { uf: string; candidatos: { nomeUrna: string; partido?: string; statusMandato: string }[] }
export interface EleicaoGovernoContato {
  destino: DestinoGoverno; uf: string; partido?: string; situacaoTse: string; statusMandato: string;
  baseStatus?: string; nomeUrna: string; motivo?: string;
}
// ResultadoContato ganha: eleicaoGoverno?: EleicaoGovernoContato;
// ResultadoEleicao ganha: governadores?: { eleitos: GovernadorClassificado[]; segundoTurno: UfSegundoTurno[] };
```
- `lib/eleitos-governo.ts`:
```ts
export function classificarGovernadores(eleitos: readonly GovernadorPlanilha[], grupos: readonly ResultadoGrupo[], deputadosAtuais?: readonly DeputadoAtual[]): GovernadorClassificado[]
export function agruparSegundoTurno(linhas: readonly GovernadorPlanilha[]): UfSegundoTurno[]
export function paraContatoGoverno(x: GovernadorClassificado): EleicaoGovernoContato
```
- `lib/eleitos.ts` passa a **exportar** `casaPessoa`, `chavePessoa`, `referencia`, `MOTIVO_AMBIGUO`, `casaDoGrupo` e um `constaEntreAtuaisPor(uf, nomeCompleto, nomeUrna, atuais): DeputadoAtual | undefined` (a versão booleana atual passa a usá-la). `casaPessoa` passa a aceitar `{ uf: string; nomeUrna: string; nomeCompleto: string }` em vez de `EleitoPlanilha` (o tipo estrutural já serve aos dois).
- `aplicarEleicao(resultado, eleitos, arquivos, deputadosAtuais?, governadores?: PlanilhaGovernadores)`.

- [ ] **Passo 1: testes que falham** (`tests/eleitos-governo.test.ts`), com grupos fictícios montados como em `tests/eleitos.test.ts` (copie dele os construtores de `ResultadoGrupo`/`ResultadoContato`; contato com `departamento` contendo a UF, ex.: "Governo do Estado de Goiás" / "GO", conforme `siglaDaUf` em `lib/uf.ts`):
  - `Reeleição` + contato no grupo "Governadores" da mesma UF → `reeleito`, `contatos` com o grupo "Governadores".
  - `Reeleição` sem contato → `conferir`, motivo contém "não está no grupo Governadores do Contatos".
  - `Reeleição` com homônimo em "Governadores" de **outra UF** → `conferir` (não casa).
  - `Mandato novo` sem contato → `novo`; com contato em "Governadores Eleitos" → `novo` + `jaCadastrado`; com contato em "Governadores" → `conferir` (motivo cita o grupo).
  - `Mandato novo (atual senador)` + contato em "Senadores" → `outro_cargo` com o grupo "Senadores"; sem contato → `conferir`.
  - `Mandato novo (atual deputado federal)` sem grupo de deputados no Contatos e presente em `deputadosAtuais` (UF + nome civil) → `outro_cargo`, `contatos: []`, `deputadoAtual` preenchido; ausente da planilha → `conferir`; com grupo "Deputados Federais" no Contatos e contato lá → `outro_cargo` com o contato.
  - `Mandato novo (vice-governador atual)` → `conferir`, `motivo` = `baseStatus`; se achar em "Governadores", `contatos` preenchido (a linha leva a etiqueta).
  - `Mandato novo (governador de outra UF)` e texto desconhecido → `conferir` "Status do mandato não previsto".
  - Dois contatos diferentes casando → `conferir` com `MOTIVO_AMBIGUO`.
  - Grupo "Ex-Governadores" nunca é candidato.
  - `agruparSegundoTurno`: 4 linhas de 2 UFs fora de ordem → 2 UFs em ordem alfabética, 2 candidatos cada.
  E em `tests/eleitos.test.ts`:
  - `aplicarEleicao(r, [], ["gov.xlsx"], undefined, { eleitos: [reeleitoGO], segundoTurno: [] })` anexa `eleicaoGoverno` à linha do governador, não mexe em `resumo`, `comparacoes` nem `possivelSaida`, e grava `eleicao.governadores`.
  - sem `governadores`, o retrato fica sem `eleicao.governadores` (como hoje).
  - a entrada não é mutada.

- [ ] **Passo 2:** rodar e ver falhar.

- [ ] **Passo 3: implementar `lib/eleitos-governo.ts`**

```ts
import { normalizarTexto } from "@/lib/normalize";
import { casaDoGrupo, casaPessoa, chavePessoa, constaEntreAtuaisPor, MOTIVO_AMBIGUO, referencia } from "@/lib/eleitos";
import type { ContatoPlanilha, DeputadoAtual, EleicaoGovernoContato, GovernadorClassificado, GovernadorPlanilha, ResultadoGrupo, UfSegundoTurno } from "@/lib/types";

/** Governadores eleitos de 2026 contra o Contatos (spec 2026-10-12 §4.2). Eixo próprio. */

type Papel = "governo" | "governo_eleitos" | "senado" | "camara";
interface Candidato { contato: ContatoPlanilha; grupo: string; papel: Papel }

function papelDoGrupo(grupo: string): Papel | undefined {
  const g = normalizarTexto(grupo);
  if (g.startsWith("ex-") || g.startsWith("ex ")) return undefined;
  if (g.startsWith("governador")) return g.includes("eleit") ? "governo_eleitos" : "governo";
  const casa = casaDoGrupo(grupo);
  if (!casa || casa.eleitos) return undefined;
  return casa.casa;
}

function candidatos(grupos: readonly ResultadoGrupo[]): Candidato[] {
  return grupos.flatMap((g) => {
    const papel = papelDoGrupo(g.grupo);
    return papel ? g.contatos.map((c) => ({ contato: c.contato, grupo: g.grupo, papel })) : [];
  });
}

const naoPrevisto = (e: GovernadorPlanilha) => `Status do mandato não previsto: "${e.statusMandato.trim()}"`;
const conferir = (e: GovernadorPlanilha, motivo: string, achados: readonly Candidato[] = []): GovernadorClassificado =>
  ({ eleito: e, destino: "conferir", motivo, contatos: achados.map(referencia) });

function classificarUm(e: GovernadorPlanilha, cands: readonly Candidato[], camaraNoContatos: boolean, atuais?: readonly DeputadoAtual[]): GovernadorClassificado {
  const achados = cands.filter((c) => casaPessoa(c.contato, e));
  if (new Set(achados.map((a) => chavePessoa(a.contato))).size > 1) return conferir(e, MOTIVO_AMBIGUO, achados);
  const em = (p: Papel) => achados.filter((a) => a.papel === p);
  const s = normalizarTexto(e.statusMandato);

  switch (s) {
    case "reeleicao": {
      const gov = em("governo");
      return gov.length > 0
        ? { eleito: e, destino: "reeleito", contatos: gov.map(referencia) }
        : conferir(e, "Planilha diz reeleição, mas a pessoa não está no grupo Governadores do Contatos");
    }
    case "mandato novo": {
      const atual = em("governo")[0];
      if (atual) return conferir(e, `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, [atual]);
      const novos = em("governo_eleitos");
      return { eleito: e, destino: "novo", contatos: novos.map(referencia), ...(novos.length > 0 ? { jaCadastrado: true } : {}) };
    }
    case "mandato novo (atual senador)": {
      const sen = em("senado");
      return sen.length > 0
        ? { eleito: e, destino: "outro_cargo", contatos: sen.map(referencia) }
        : conferir(e, "Planilha diz senador atual, mas a pessoa não está no grupo de senadores do Contatos");
    }
    case "mandato novo (atual deputado federal)": {
      if (camaraNoContatos) {
        const dep = em("camara");
        return dep.length > 0
          ? { eleito: e, destino: "outro_cargo", contatos: dep.map(referencia) }
          : conferir(e, "Planilha diz deputado federal atual, mas a pessoa não está no grupo de deputados federais do Contatos");
      }
      const d = atuais ? constaEntreAtuaisPor(e.uf, e.nomeCompleto, e.nomeUrna, atuais) : undefined;
      return d
        ? { eleito: e, destino: "outro_cargo", contatos: [], deputadoAtual: { uf: d.uf, nomeParlamentar: d.nomeParlamentar } }
        : conferir(e, "Planilha diz deputado federal atual, mas a pessoa não está na lista de deputados em exercício");
    }
    case "mandato novo (vice-governador atual)":
      return conferir(e, e.baseStatus ?? "Vice-governador atual: conferir se está no exercício do governo", em("governo"));
    default:
      return conferir(e, naoPrevisto(e));
  }
}

export function classificarGovernadores(eleitos: readonly GovernadorPlanilha[], grupos: readonly ResultadoGrupo[], deputadosAtuais?: readonly DeputadoAtual[]): GovernadorClassificado[] {
  const cands = candidatos(grupos);
  const camaraNoContatos = cands.some((c) => c.papel === "camara");
  return eleitos.map((e) => classificarUm(e, cands, camaraNoContatos, deputadosAtuais));
}

export function agruparSegundoTurno(linhas: readonly GovernadorPlanilha[]): UfSegundoTurno[] {
  const porUf = new Map<string, UfSegundoTurno["candidatos"]>();
  for (const l of linhas) {
    const lista = porUf.get(l.uf) ?? [];
    porUf.set(l.uf, [...lista, { nomeUrna: l.nomeUrna, statusMandato: l.statusMandato, ...(l.partido ? { partido: l.partido } : {}) }]);
  }
  return [...porUf.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([uf, candidatos]) => ({ uf, candidatos }));
}

export function paraContatoGoverno(x: GovernadorClassificado): EleicaoGovernoContato {
  const e = x.eleito;
  return {
    destino: x.destino, uf: e.uf, situacaoTse: e.situacaoTse, statusMandato: e.statusMandato, nomeUrna: e.nomeUrna,
    ...(e.partido ? { partido: e.partido } : {}), ...(e.baseStatus ? { baseStatus: e.baseStatus } : {}), ...(x.motivo ? { motivo: x.motivo } : {}),
  };
}
```
  Confirme que a ordem dos `case` em `papelDoGrupo` não captura "Governadores" como Senadores (o teste de "Governadores" + "Senadores" cobre).

- [ ] **Passo 4: `aplicarEleicao`.** Acrescentar o parâmetro `governadores?: PlanilhaGovernadores`. Se presente: `const gov = classificarGovernadores(governadores.eleitos, resultado.grupos, deputadosAtuais)`; mapa `chaveLinha(grupo, contato) → paraContatoGoverno(x)` para cada `x.contatos`; anexar `eleicaoGoverno` nas linhas (junto com `eleicao`, na mesma passada `grupos.map`); `eleicao.governadores = { eleitos: gov, segundoTurno: agruparSegundoTurno(governadores.segundoTurno) }`. Sem `governadores`, nada muda.

- [ ] **Passo 5: rota.** Em `app/api/analise/route.ts`, desestruturar `governadores` do payload; condição `eleitos || deputadosAtuais || governadores`; passar `governadores` como 5º argumento.

- [ ] **Passo 6:** `npm test`, `npm run typecheck` verdes.

- [ ] **Passo 7: commit** `feat: classificação dos governadores eleitos`.

---

### Tarefa 4: governadores no painel, no export e documentação

**Arquivos:**
- Modificar: `lib/painel-eleicao.ts`, `lib/painel-deputados.ts`, `components/linha-contato.tsx`, `components/secao-eleitos.tsx` (ou novo `components/secao-governo.tsx`), `components/painel.tsx`, `lib/export-eleitos.ts`, `CLAUDE.md`
- Testes: `tests/painel-eleicao.test.ts`, `tests/painel-deputados.test.ts`, `tests/export-eleitos.test.ts`

**Interfaces:**
- Consome: `GovernadorClassificado`, `UfSegundoTurno`, `EleicaoGovernoContato` (Tarefa 3).
- Produz em `lib/painel-eleicao.ts`:
```ts
export function etiquetasDeGoverno(e: EleicaoGovernoContato | undefined): Etiqueta[]
export function detalheDoGoverno(e: EleicaoGovernoContato): { linhas: { rotulo: string; valor: string }[]; orientacao?: string }
export function destacaLinha(e: EleicaoContato | undefined, g?: EleicaoGovernoContato): boolean // outra_casa OU outro_cargo
export interface SecaoGoverno { id: "governo_novos" | "governo_segundo_turno"; titulo: string; novos: GovernadorClassificado[]; segundoTurno: UfSegundoTurno[] }
export function secoesDeGoverno(eleicao: ResultadoEleicao | undefined, filtro: string, busca: string): SecaoGoverno[]
```
  e `secoesDeEleicao` passa a incluir os governadores `conferir` na seção "Eleitos — a conferir".

- [ ] **Passo 1: testes que falham**
  - `etiquetasDeGoverno`: reeleito → "Reeleito governador" (ok); outro_cargo → "Eleito governador — atenção" (atencao, explicação com "Ata 14"); conferir → "Governo: a conferir" (atencao, explicação = motivo); `undefined` → `[]`; `novo` → "Eleito governador — grupo novo" (neutro).
  - `detalheDoGoverno`: linhas "Eleito para" = "Governo do Estado", UF, Partido, Situação no TSE, Status do mandato, Base do status, A conferir; `orientacao` só em `outro_cargo`.
  - `destacaLinha(undefined, { destino: "outro_cargo", ... })` → `true`.
  - `secoesDeGoverno` com "tudo": seção "Governadores Eleitos — a cadastrar (N)" (só `novo` sem `jaCadastrado`) e "Governadores — aguarda 2º turno, 25/10 (N UFs)"; com "a_cadastrar": só a de novos; com "a_conferir": nenhuma; seções vazias somem; retrato sem `governadores` → `[]`; busca filtra por nome de urna, nome completo, UF ou partido (no 2º turno, por UF ou nome de algum candidato).
  - `secoesDeEleicao(e, "a_conferir", "")` inclui governadores `conferir` na seção "Eleitos — a conferir". Como `SecaoEleicao.linhas` é `EleitoClassificado[]`, acrescente `governo: GovernadorClassificado[]` à `SecaoEleicao` (vazio nas outras seções) e conte os dois no título.
  - Filtro "Reeleitos" (`passaFiltroEleicao`) aceita `c.eleicaoGoverno?.destino === "reeleito"`; filtro `outra_casa` aceita `outro_cargo`; o rótulo de `outra_casa` em `FILTROS_ELEICAO` passa a "Eleitos para outro cargo" (atualize o teste que checa o rótulo, se houver).
  - `tests/painel-deputados.test.ts`: `grupoDeputados` com `eleicao.governadores.eleitos` contendo um `outro_cargo` com `deputadoAtual: { uf: "AC", nomeParlamentar: "Fulano Teste" }` → a linha desse deputado ganha a etiqueta "Eleito governador — atenção" (além da da Câmara); o filtro `outra_casa` passa a mostrá-lo.
  - `tests/export-eleitos.test.ts`: o arquivo ganha as abas `Governadores` (cabeçalho `UF, Nome de urna, Nome completo, Partido, Status do mandato, Situação (TSE), Destino, Grupo no Contatos, Motivo`) e `Governadores 2º turno` (`UF, Nome de urna, Partido, Status do mandato`), só cabeçalho quando vazias; sem `governadores` no retrato as duas abas saem só com cabeçalho; as três abas antigas não mudam.

- [ ] **Passo 2:** rodar e ver falhar.

- [ ] **Passo 3: implementar** as funções acima em `lib/painel-eleicao.ts` (rótulos e textos exatamente como no Passo 1; `ORIENTACAO_OUTRA_CASA` como explicação/orientação de `outro_cargo`). Em `lib/painel-deputados.ts`, `grupoDeputados` monta um conjunto `UF|normalizarNome(nomeParlamentar)` a partir de `eleicao.governadores?.eleitos` com `deputadoAtual` e, para quem casa, acrescenta `{ campo: "eleicao", texto: "Eleito governador — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA }` às etiquetas da linha.

- [ ] **Passo 4: export.** Em `lib/export-eleitos.ts`, `CABECALHO_GOVERNO`, `CABECALHO_SEGUNDO_TURNO`, rótulos de destino de governo (`reeleito: "Reeleito — fica em Governadores"`, `outro_cargo: "Eleito governador — fica no cargo atual (Ata 14)"`, `novo: "Mandato novo — Governadores Eleitos"`, `conferir: "A conferir"`), ordem por UF e nome de urna; uma linha por candidato no 2º turno. Acrescentar as duas abas depois das três existentes.

- [ ] **Passo 5: componentes.**
  - `components/linha-contato.tsx`: etiquetas `[...etiquetasDoContato(c, g), ...(eleicaoLigada ? [...etiquetasDeEleicao(c.eleicao), ...etiquetasDeGoverno(c.eleicaoGoverno)] : [])]`; destaque `destacaLinha(c.eleicao, c.eleicaoGoverno)`; no detalhe, `BlocoGoverno` no molde de `BlocoEleicao`, título "Eleição 2026 — governo", quando `eleicaoLigada && c.eleicaoGoverno`.
  - `components/secao-governo.tsx` (`"use client"`, molde de `SecaoEleitos`): para `governo_novos`, colunas Nome de urna, Nome completo, UF, Partido, Vice; para `governo_segundo_turno`, uma linha por UF com os candidatos ("Nome (PARTIDO) · Nome (PARTIDO)") e o status de cada um em `text-xs text-cinza`.
  - `components/secao-eleitos.tsx`: na seção "conferir", renderizar também `secao.governo` (UF, nome de urna, nome completo, partido, motivo), com "Governador" antes do nome de urna em `text-xs text-cinza`.
  - `components/painel.tsx`: `const secoesGov = useMemo(() => (eleicaoLigada ? secoesDeGoverno(retrato.eleicao, filtro, busca) : []), [...])`, renderizar depois de `secoes`; "Nada para mostrar" considera também `secoesGov`.

- [ ] **Passo 6: CLAUDE.md.**
  - Tabela de specs: linha `| 2026-10-12 | deputados-no-painel-e-governadores-eleitos-design.md | Grupo Deputados Federais montado da planilha da Câmara no painel e na web (sem e-mail, telefone, prédio e sala); governadores eleitos no eixo Eleição 2026; 2º turno só como UF pendente | Vigente |`.
  - Princípio "Eleição 2026": acrescentar governadores (`lib/eleitos-governo.ts`, `eleicaoGoverno`, aba "Eleitos 1º turno") e o grupo virtual (`lib/painel-deputados.ts`); trocar "O retrato publicado vai sem `eleicao.deputadosAtuais`" por "Os deputados atuais vão para a web sem e-mail, telefone, prédio e sala".
  - Princípio "Dois modos": a lista do que o `POST /api/publicar` retira passa a citar os campos de contato dos deputados.
  - Layout: `painel-deputados`, `eleitos-governo` em `lib/`.
  - Tabela "Onde ficam os arquivos": linha 3 com as quatro planilhas, incluindo `Governadores Eleitos 2026.xlsx`.
  - Fluxo "Código novo": `vercel deploy --prod --yes --scope srp-coeven` (sem `--scope` dá "Not authorized"), e `vercel inspect <url> --scope srp-coeven --wait`.
  - Estado do projeto: contagem da suíte atualizada (rodar `npm test` e copiar os números).

- [ ] **Passo 7:** `npm test`, `npm run typecheck`, `npm run build` verdes.

- [ ] **Passo 8: commit** `feat: governadores eleitos no painel e no export`.

---

## Validação final (fora do repositório, antes do PR)

Script no rascunho da sessão (`npx tsx`), sem imprimir nomes:
1. `lerPlanilhaEleicao` em `../GT Posse/Eleitos 2026/Governadores Eleitos 2026.xlsx` → `tipo: "governo"`, 20 eleitos, 14 linhas de 2º turno em 7 UFs.
2. `grupoDeputados(retrato.eleicao, { busca: "", filtro: "tudo", grupo: "" })` sobre `.fiscal/retrato.json` → 513 atuais; contagem das etiquetas: 300 "Reeleito" (76 com projeção), 18 "Eleito senador — atenção", 182 "Não reeleito / aguarda definição", 13 "Não concorreu".
3. `enxugarParaPublicar` do retrato → nenhum `@` nem telefone dos deputados no JSON (verificar por padrão, sem imprimir valores).
