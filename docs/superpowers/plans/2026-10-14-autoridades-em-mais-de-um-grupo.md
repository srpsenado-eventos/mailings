# Autoridades em mais de um grupo — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mostrar, no painel e numa página própria `/repetidos`, as autoridades que estão em mais de um grupo do Contatos e o grupo pelo qual cada uma será convidada, segundo a Nominata do GT.

**Architecture:** função pura `lib/repetidos.ts` lê `retrato.grupos` na hora de desenhar (como `lib/painel-deputados.ts`), usando a tabela versionada `data/precedencia.ts`. Nada muda na varredura nem no retrato gravado; a web já recebe nome, cargo e grupo. A página `/repetidos` reaproveita a leitura do retrato do painel, extraída para `app/carregar-retrato.tsx`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind, SheetJS (`xlsx`), Vitest. Gerenciador **npm** (nunca pnpm).

**Spec:** `docs/superpowers/specs/2026-10-14-autoridades-em-mais-de-um-grupo-design.md`

## Global Constraints

- `lib/*.ts` e `data/*.ts` são funções/dados puros: sem JSX, sem hooks, sem `window`; nunca mutam a entrada.
- Sem `any`; sem `console.*` novo (o único log permitido é o motivo técnico já existente na leitura do retrato em modo web).
- Nenhum nome de autoridade em log, teste com nome real ou commit. Testes usam nomes fictícios.
- A etiqueta deste eixo **não** entra em `etiquetasDoContato` e **não** muda semáforo, situação da linha, filtros nem cartões.
- Textos da UI em português do Brasil, exatamente como escritos neste plano.
- Rodar com `npm test`, `npm run typecheck`, `npm run build` (PowerShell). Commits em `feat/autoridades-em-mais-de-um-grupo`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não commitar `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `*.xlsx` nem `.fiscal/`.

## Review Focus

1. Rótulo de grupo do Contatos que casa duas regras por contenção (ex.: segmento curto "presidente") — o esperado é ignorar o segmento, não escolher a primeira regra. Teste na Tarefa 1.
2. Grupos de eleitos ("Senadores Eleitos") casariam "Senadores" pela contenção — o esperado é ficarem fora. Teste na Tarefa 1.
3. Mesmo nome duas vezes no mesmo grupo (ou nos três grupos de Senadores, que viram a mesma regra) — não é repetição. Teste na Tarefa 2.
4. Nome parcial entre duas pessoas do mesmo grupo — não vira caso. Teste na Tarefa 2.
5. Contato sem nome — ignorado sem erro. Teste na Tarefa 2.

---

### Tarefa 1: Tabela de precedência e casamento de grupo e cargo

**Files:**
- Create: `data/precedencia.ts`
- Create: `lib/repetidos.ts`
- Modify: `lib/catalogo.ts` (exportar `segmentarGrupo` e `casaSegmento`, hoje privadas)
- Test: `tests/precedencia.test.ts`

**Interfaces:**
- Produces:
  - `data/precedencia.ts`: `interface NivelPrecedencia { nivel: string; nominata: string }`, `interface RegraPrecedencia { grupo: string; ex: boolean; presidente?: NivelPrecedencia; distritoFederal?: NivelPrecedencia; nivel?: NivelPrecedencia }`, `const PRECEDENCIA: readonly RegraPrecedencia[]`.
  - `lib/catalogo.ts`: `export function segmentarGrupo(grupoNome: string): string[]`, `export function casaSegmento(nomeNorm: string, seg: string): boolean` (sem mudar o corpo).
  - `lib/repetidos.ts`: `regraDoSegmento(segmento: string): RegraPrecedencia | undefined`, `nivelDoCargo(regra: RegraPrecedencia, cargo: string): NivelPrecedencia | undefined`, `compararNivel(a: string, b: string): number`.

- [ ] **Step 1: Exportar os auxiliares do catálogo**

Em `lib/catalogo.ts`, trocar `function segmentarGrupo(` por `export function segmentarGrupo(` e `function casaSegmento(` por `export function casaSegmento(`. Nada mais muda.

- [ ] **Step 2: Escrever o teste que falha**

`tests/precedencia.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";
import { PRECEDENCIA } from "@/data/precedencia";
import { casaSegmento } from "@/lib/catalogo";
import { normalizarTexto } from "@/lib/normalize";
import { compararNivel, nivelDoCargo, regraDoSegmento } from "@/lib/repetidos";

const regra = (grupo: string) => {
  const r = PRECEDENCIA.find((x) => x.grupo === grupo);
  if (!r) throw new Error(`regra ausente: ${grupo}`);
  return r;
};

describe("dados da precedência", () => {
  test("níveis no formato da Nominata e texto preenchido", () => {
    for (const r of PRECEDENCIA) {
      for (const n of [r.presidente, r.distritoFederal, r.nivel]) {
        if (!n) continue;
        expect(n.nivel).toMatch(/^\d+(\.\d+)+$/);
        expect(n.nominata.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("um grupo aparece uma vez só", () => {
    const nomes = PRECEDENCIA.map((r) => normalizarTexto(r.grupo));
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  test("todo grupo da tabela existe no catálogo", () => {
    for (const r of PRECEDENCIA) {
      const seg = normalizarTexto(r.grupo);
      expect(CATALOGO.some((g) => casaSegmento(normalizarTexto(g.nome), seg)), r.grupo).toBe(true);
    }
  });
});

describe("regraDoSegmento", () => {
  test.each([
    ["ministros do stf", "Ministros do STF"],
    ["senadores", "Senadores"],
    ["senadores (acre a goias)", "Senadores"],
    ["presidente do senado federal", "Presidente do Senado"],
    ["defensor", "Defensor Público Geral da União"],
    ["ex-presidentes do senado", "Ex-Presidentes do Senado"],
    ["embaixadores (africa do sul ate eua)", "Embaixadores"],
  ])("%s casa %s", (seg, grupo) => {
    expect(regraDoSegmento(seg)?.grupo).toBe(grupo);
  });

  test.each([
    "senadores eleitos",
    "governadores eleitos",
    "grupo eventos - pp 2027 - piloto",
    "mailing rp - sessao especial",
    "presidente",
  ])("%s fica fora", (seg) => {
    expect(regraDoSegmento(seg)).toBeUndefined();
  });
});

describe("nivelDoCargo", () => {
  test("presidente do tribunal sobe de nível; vice-presidente não", () => {
    expect(nivelDoCargo(regra("Ministros do STF"), "Presidente do Supremo Tribunal Federal")?.nivel).toBe("3.3");
    expect(nivelDoCargo(regra("Ministros do STF"), "Vice-Presidente do Supremo Tribunal Federal")?.nivel).toBe("4.9");
    expect(nivelDoCargo(regra("Ministros do TSE"), "Presidenta do Tribunal Superior Eleitoral")?.nivel).toBe("4.8");
    expect(nivelDoCargo(regra("Ministros do TSE"), "Ministra do Tribunal Superior Eleitoral")?.nivel).toBe("5.9");
  });

  test("governador do Distrito Federal tem nível próprio", () => {
    expect(nivelDoCargo(regra("Governadores"), "Governador do Distrito Federal")?.nivel).toBe("4.11");
    expect(nivelDoCargo(regra("Governadores"), "Governadora do Estado de Goiás")?.nivel).toBe("4.12");
  });

  test("grupo fora da Nominata não tem nível", () => {
    expect(nivelDoCargo(regra("Embaixadores"), "Embaixador")).toBeUndefined();
  });
});

describe("compararNivel", () => {
  test("ordena como a Nominata", () => {
    const ordenados = ["4.10", "3.3", "4.9", "4.10.1", "6.1.1", "5.9"].sort(compararNivel);
    expect(ordenados).toEqual(["3.3", "4.9", "4.10", "4.10.1", "5.9", "6.1.1"]);
    expect(compararNivel("4.13", "4.13")).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/precedencia.test.ts`
Expected: FAIL (módulos `@/data/precedencia` e `@/lib/repetidos` não existem).

- [ ] **Step 4: Criar `data/precedencia.ts`**

```ts
/**
 * Precedência usada para escolher por qual grupo uma autoridade presente em mais de um
 * grupo do Contatos será convidada (spec 2026-10-14). Fonte: a Nominata do GT,
 * `GT Posse/Nominata/Nominata 2027_Modelo após ajustes Daniel (1).xlsx` (Decreto 70.274/72
 * com os acréscimos do GT). Número e texto copiados da planilha; só os níveis dos grupos
 * do catálogo entram aqui.
 *
 * `ex: true` marca cargo de "ex-": perde para qualquer cargo atual, seja qual for o nível
 * (decisão do Clovis, 2026-10-13). Grupo sem `nivel` está fora da Nominata e perde para
 * qualquer cargo que esteja nela. Embaixadores e Comandantes estão sem nível até o Clovis
 * confirmar a correspondência.
 */
export interface NivelPrecedencia {
  /** Número do nível como na Nominata ("4.10.1"). */
  nivel: string;
  /** Texto da Nominata para o nível. */
  nominata: string;
}

export interface RegraPrecedencia {
  /** Nome do grupo, casado contra o rótulo do Contatos como em `lib/catalogo.ts`. */
  grupo: string;
  ex: boolean;
  /** Nível quando o cargo começa por "Presidente"/"Presidenta" (não "Vice-Presidente"). */
  presidente?: NivelPrecedencia;
  /** Nível quando o cargo cita o Distrito Federal. */
  distritoFederal?: NivelPrecedencia;
  /** Nível dos demais cargos do grupo; ausente = fora da Nominata. */
  nivel?: NivelPrecedencia;
}

const n = (nivel: string, nominata: string): NivelPrecedencia => ({ nivel, nominata });

export const PRECEDENCIA: readonly RegraPrecedencia[] = [
  { grupo: "Presidente da República", ex: false, nivel: n("1.1", "Presidente da República") },
  { grupo: "Vice-Presidente da República", ex: false, nivel: n("2.1", "Vice-presidente da República") },
  { grupo: "Presidente do Senado", ex: false, nivel: n("3.1", "Presidente do Congresso Nacional") },
  { grupo: "Presidente da Câmara dos Deputados", ex: false, nivel: n("3.2", "Presidente da Câmara dos Deputados") },
  {
    grupo: "Ministros do STF", ex: false,
    presidente: n("3.3", "Presidente do Supremo Tribunal Federal"),
    nivel: n("4.9", "Ministros do Supremo Tribunal Federal"),
  },
  { grupo: "Ex-Presidentes da República", ex: true, nivel: n("3.4", "Ex-Presidentes da República Federativa do Brasil") },
  { grupo: "Ex-Presidentes do Senado", ex: true, nivel: n("3.5", "Ex-Presidentes do Congresso Nacional") },
  { grupo: "Ministros de Estado", ex: false, nivel: n("4.1", "Ministros de Estado") },
  {
    grupo: "Ministros do TSE", ex: false,
    presidente: n("4.8", "Presidente do Tribunal Superior Eleitoral"),
    nivel: n("5.9", "Ministros do Tribunal Superior Eleitoral"),
  },
  { grupo: "Procurador-Geral da República", ex: false, nivel: n("4.10", "Procurador-geral da República") },
  { grupo: "Defensor Público Geral da União", ex: false, nivel: n("4.10.1", "Defensor Público-Geral Federal") },
  {
    grupo: "Governadores", ex: false,
    distritoFederal: n("4.11", "Governador do Distrito Federal"),
    nivel: n("4.12", "Governadores dos estados da União"),
  },
  { grupo: "Senadores", ex: false, nivel: n("4.13", "Senadores") },
  {
    grupo: "Ministros do STJ", ex: false,
    presidente: n("5.5.1", "Presidente do Superior Tribunal de Justiça"),
    nivel: n("6.1.1", "Ministros do Superior Tribunal de Justiça"),
  },
  {
    grupo: "Ministros do STM", ex: false,
    presidente: n("5.6", "Presidente do Superior Tribunal Militar"),
    nivel: n("6.2", "Ministros do Superior Tribunal Militar"),
  },
  {
    grupo: "Ministros do TST", ex: false,
    presidente: n("5.7", "Presidente do Tribunal Superior do Trabalho"),
    nivel: n("6.3", "Ministros do Tribunal Superior do Trabalho"),
  },
  {
    grupo: "Ministros do TCU", ex: false,
    presidente: n("5.8", "Presidente do Tribunal de Contas da União"),
    nivel: n("6.4", "Ministros do Tribunal de Contas da União"),
  },
  {
    grupo: "Diretor-Geral e Secretário Geral da Mesa do Senado Federal", ex: false,
    nivel: n("6.13", "Diretores-gerais das secretarias do Senado Federal e da Câmara dos Deputados"),
  },
  {
    grupo: "Presidentes das Assembleias Legislativas das UFs", ex: false,
    nivel: n("7.6", "Presidentes das assembleias legislativas dos estados da União"),
  },
  { grupo: "Ex-Senadores", ex: true },
  // A confirmar com o Clovis: 2.3 ("Embaixadores estrangeiros") se os grupos forem de embaixadores estrangeiros.
  { grupo: "Embaixadores", ex: false },
  // A confirmar com o Clovis: a Nominata ainda usa os títulos antigos dos chefes militares.
  { grupo: "Comandantes das Forças Armadas e EMCFA", ex: false },
  { grupo: "Conselho Nacional de Justiça (CNJ)", ex: false },
  { grupo: "Conselho Nacional do Ministério Público (CNMP)", ex: false },
  { grupo: "Presidente da OAB Nacional", ex: false },
];
```

- [ ] **Step 5: Criar `lib/repetidos.ts` com o casamento de grupo e cargo**

```ts
import { PRECEDENCIA, type NivelPrecedencia, type RegraPrecedencia } from "@/data/precedencia";
import { casaSegmento } from "@/lib/catalogo";
import { normalizarTexto } from "@/lib/normalize";

/** Grupos fora deste eixo: os de eleitos (Eleição 2026, Ata 14) e o piloto de eventos. */
const GRUPO_FORA = /eleit|piloto/;

/**
 * Regra de precedência de um segmento (já normalizado) do rótulo "Grupo" do Contatos.
 * Exata primeiro; por contenção só quando uma regra única casa — segmento que casa duas
 * fica de fora em vez de cair na primeira da tabela.
 */
export function regraDoSegmento(segmento: string): RegraPrecedencia | undefined {
  if (GRUPO_FORA.test(segmento)) return undefined;
  const exata = PRECEDENCIA.find((r) => normalizarTexto(r.grupo) === segmento);
  if (exata) return exata;
  const contidas = PRECEDENCIA.filter((r) => casaSegmento(normalizarTexto(r.grupo), segmento));
  return contidas.length === 1 ? contidas[0] : undefined;
}

const PRESIDENTE = /^president[ea]\b/;

/** Nível da Nominata para o cargo dentro do grupo da regra; `undefined` = fora da Nominata. */
export function nivelDoCargo(regra: RegraPrecedencia, cargo: string): NivelPrecedencia | undefined {
  const c = normalizarTexto(cargo);
  if (regra.presidente && PRESIDENTE.test(c)) return regra.presidente;
  if (regra.distritoFederal && c.includes("distrito federal")) return regra.distritoFederal;
  return regra.nivel;
}

/** Negativo quando `a` vem antes de `b` na Nominata ("4.9" antes de "4.10", "4.10" antes de "4.10.1"). */
export function compararNivel(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/precedencia.test.ts tests/catalogo.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add data/precedencia.ts lib/repetidos.ts lib/catalogo.ts tests/precedencia.test.ts
git commit -m "feat: tabela de precedência da Nominata para grupos repetidos"
```

---

### Tarefa 2: Quem está em mais de um grupo, escolha do grupo e etiqueta

**Files:**
- Modify: `lib/repetidos.ts`
- Modify: `lib/painel.ts:30` (acrescentar `"grupo"` a `CampoEtiqueta`)
- Test: `tests/repetidos.test.ts`

**Interfaces:**
- Consumes: `regraDoSegmento`, `nivelDoCargo`, `compararNivel` (Tarefa 1); `segmentarGrupo` de `lib/catalogo.ts`; `normalizarNome`, `normalizarTexto` de `lib/normalize.ts`; tipo `Etiqueta` de `lib/painel.ts`.
- Produces (em `lib/repetidos.ts`):
  - `interface OcorrenciaRepetida { grupo: string; grupoRegra: string; chave: string; cargo: string; nivel?: NivelPrecedencia; ex: boolean; possivelSaida: boolean }` — `grupo` é `ResultadoGrupo.grupo`; `chave` é `normalizarNome(nome)`.
  - `type SituacaoRepetida = "decidido" | "conferir"`
  - `interface AutoridadeRepetida { nome: string; ocorrencias: OcorrenciaRepetida[]; situacao: SituacaoRepetida; convidaPor?: OcorrenciaRepetida; motivo: string }`
  - `interface Escolha { situacao: SituacaoRepetida; convidaPor?: OcorrenciaRepetida; motivo: string }`
  - `escolherGrupo(ocorrencias: readonly OcorrenciaRepetida[], parcial: boolean): Escolha`
  - `autoridadesRepetidas(grupos: readonly ResultadoGrupo[]): AutoridadeRepetida[]` — "conferir" primeiro, depois por nome.
  - `etiquetaDeRepeticao(repetidas: readonly AutoridadeRepetida[], c: ResultadoContato, grupo: string): Etiqueta | undefined`
  - `type FiltroRepetidas = "todas" | "decidido" | "conferir"`; `filtrarRepetidas(lista: readonly AutoridadeRepetida[], busca: string, filtro: FiltroRepetidas): AutoridadeRepetida[]`
  - `textoRepetidas(n: number): string`
  - constantes `MOTIVO_PARCIAL`, `MOTIVO_SEM_NIVEL`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/repetidos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  autoridadesRepetidas, escolherGrupo, etiquetaDeRepeticao, filtrarRepetidas, MOTIVO_PARCIAL, MOTIVO_SEM_NIVEL,
  textoRepetidas, type OcorrenciaRepetida,
} from "@/lib/repetidos";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";

const linha = (nome: string, cargo: string, extra: Partial<ResultadoContato> = {}): ResultadoContato => ({
  contato: { nome, cargo, grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial", ...extra,
});
const grupo = (nome: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos, novos: [] });

const stf = (nome = "Ana Fictícia", cargo = "Ministra do Supremo Tribunal Federal", extra: Partial<ResultadoContato> = {}) =>
  grupo("Ministros do STF", [linha(nome, cargo, extra)]);
const tse = (nome = "Ana Fictícia", cargo = "Ministra do Tribunal Superior Eleitoral") => grupo("Ministros do TSE", [linha(nome, cargo)]);

describe("autoridadesRepetidas", () => {
  test("ministra do STF no TSE fica no STF", () => {
    const [a, ...resto] = autoridadesRepetidas([stf(), tse()]);
    expect(resto).toEqual([]);
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Ministros do STF");
    expect(a.motivo).toBe("Ministros do STF (4.9) antes de Ministros do TSE (5.9)");
    expect(a.ocorrencias.map((o) => o.grupo)).toEqual(["Ministros do STF", "Ministros do TSE"]);
  });

  test("ministra do STF que preside o TSE fica no TSE", () => {
    const [a] = autoridadesRepetidas([stf(), tse("Ana Fictícia", "Presidente do Tribunal Superior Eleitoral")]);
    expect(a.convidaPor?.grupoRegra).toBe("Ministros do TSE");
    expect(a.motivo).toBe("Ministros do TSE (4.8) antes de Ministros do STF (4.9)");
  });

  test("cargo atual vence cargo de ex-", () => {
    const [a] = autoridadesRepetidas([
      grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")]),
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
    ]);
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.motivo).toBe("Cargo atual (Senadores) vence cargo de ex- (Ex-Presidentes do Senado)");
  });

  test("entre dois cargos de ex-, vale a Nominata", () => {
    const [a] = autoridadesRepetidas([
      grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")]),
      grupo("Ex-Presidentes da República", [linha("Rui Fictício", "Ex-Presidente da República")]),
    ]);
    expect(a.convidaPor?.grupoRegra).toBe("Ex-Presidentes da República");
    expect(a.motivo).toBe("Ex-Presidentes da República (3.4) antes de Ex-Presidentes do Senado (3.5)");
  });

  test("cargo fora da Nominata perde para cargo que está nela", () => {
    const [a] = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
      stf(),
    ]);
    expect(a.convidaPor?.grupoRegra).toBe("Ministros do STF");
    expect(a.motivo).toBe("Ministros do STF (4.9) antes de Conselho Nacional de Justiça (CNJ) (fora da Nominata)");
  });

  test("nenhum cargo na Nominata vai para conferir", () => {
    const [a] = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
      grupo("Conselho Nacional do Ministério Público (CNMP)", [linha("Ana Fictícia", "Conselheira")]),
    ]);
    expect(a.situacao).toBe("conferir");
    expect(a.convidaPor).toBeUndefined();
    expect(a.motivo).toBe(MOTIVO_SEM_NIVEL);
  });

  test("nome parcial em grupos diferentes vai para conferir", () => {
    const [a] = autoridadesRepetidas([stf("Carmem Fictícia"), tse("Carmem Fictícia Antunes Rocha")]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe(MOTIVO_PARCIAL);
    expect(a.ocorrencias).toHaveLength(2);
  });

  test("nome parcial dentro do mesmo grupo não é caso", () => {
    expect(autoridadesRepetidas([grupo("Senadores", [linha("José Fictício", "Senador"), linha("José Fictício Lima", "Senador")])])).toEqual([]);
  });

  test("possível saída no grupo vencedor vai para conferir", () => {
    const [a] = autoridadesRepetidas([stf("Ana Fictícia", "Ministra do Supremo Tribunal Federal", { possivelSaida: true }), tse()]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe("Possível saída em Ministros do STF: confirmar o cargo antes de decidir");
  });

  test("célula com dois grupos conta como duas ocorrências", () => {
    const [a] = autoridadesRepetidas([grupo("Presidente do Senado Federal; Senadores", [linha("Davi Fictício", "Presidente do Senado Federal")])]);
    expect(a.ocorrencias.map((o) => o.grupoRegra)).toEqual(["Presidente do Senado", "Senadores"]);
    expect(a.convidaPor?.grupoRegra).toBe("Presidente do Senado");
  });

  test("grupos de eleitos e o piloto ficam fora", () => {
    expect(autoridadesRepetidas([
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
      grupo("Senadores Eleitos", [linha("Rui Fictício", "Senador eleito")]),
      grupo("Grupo Eventos - PP 2027 - PILOTO", [linha("Rui Fictício", "Senador")]),
    ])).toEqual([]);
  });

  test("os três grupos de Senadores são o mesmo grupo", () => {
    expect(autoridadesRepetidas([
      grupo("Senadores (Acre a Goiás)", [linha("Rui Fictício", "Senador")]),
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
    ])).toEqual([]);
  });

  test("contato sem nome é ignorado", () => {
    expect(autoridadesRepetidas([stf(""), tse("")])).toEqual([]);
  });

  test("conferir vem antes de decidido", () => {
    const lista = autoridadesRepetidas([
      grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra", { possivelSaida: true })]),
      grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra")]),
    ]);
    expect(lista.map((a) => a.situacao)).toEqual(["conferir", "decidido"]);
  });
});

describe("escolherGrupo", () => {
  const oc = (grupoRegra: string, nivel?: string): OcorrenciaRepetida => ({
    grupo: grupoRegra, grupoRegra, chave: "ana", cargo: "x", ex: false, possivelSaida: false,
    ...(nivel ? { nivel: { nivel, nominata: "x" } } : {}),
  });

  test("mesmo nível em grupos diferentes vai para conferir", () => {
    const e = escolherGrupo([oc("A", "4.13"), oc("B", "4.13")], false);
    expect(e).toEqual({ situacao: "conferir", motivo: "Mesmo nível na Nominata (4.13): decidir à mão" });
  });
});

describe("etiquetaDeRepeticao", () => {
  const repetidas = autoridadesRepetidas([stf(), tse()]);
  const ana = linha("Ana Fictícia", "Ministra");

  test("grupo que não convida leva a etiqueta vermelha", () => {
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do TSE")).toEqual({
      campo: "grupo", tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Ministros do STF",
      explicacao: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
    });
  });

  test("grupo que convida leva a etiqueta neutra", () => {
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do STF")).toEqual({
      campo: "grupo", tom: "neutro", texto: "Convidada por este grupo; também em Ministros do TSE",
      explicacao: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
    });
  });

  test("caso a conferir leva etiqueta de atenção", () => {
    const conferir = autoridadesRepetidas([stf("Carmem Fictícia"), tse("Carmem Fictícia Antunes Rocha")]);
    expect(etiquetaDeRepeticao(conferir, linha("Carmem Fictícia", "Ministra"), "Ministros do STF")).toEqual({
      campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: MOTIVO_PARCIAL,
    });
  });

  test("contato que não se repete fica sem etiqueta", () => {
    expect(etiquetaDeRepeticao(repetidas, linha("Outra Pessoa", "Ministra"), "Ministros do STF")).toBeUndefined();
  });
});

describe("filtro e texto", () => {
  const lista = autoridadesRepetidas([
    grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra", { possivelSaida: true })]),
    grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra")]),
  ]);

  test("filtra por situação e por nome sem acento", () => {
    expect(filtrarRepetidas(lista, "", "conferir").map((a) => a.nome)).toEqual(["Bia Fictícia"]);
    expect(filtrarRepetidas(lista, "ficticia", "decidido").map((a) => a.nome)).toEqual(["Ana Fictícia"]);
    expect(filtrarRepetidas(lista, "ANA", "todas")).toHaveLength(1);
  });

  test("texto do link", () => {
    expect(textoRepetidas(1)).toBe("1 autoridade em mais de um grupo");
    expect(textoRepetidas(10)).toBe("10 autoridades em mais de um grupo");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/repetidos.test.ts`
Expected: FAIL (`autoridadesRepetidas` não exportada).

- [ ] **Step 3: Acrescentar `"grupo"` a `CampoEtiqueta`**

Em `lib/painel.ts`, a linha
`export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte" | "eleicao";`
passa a
`export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte" | "eleicao" | "grupo";`

- [ ] **Step 4: Implementar em `lib/repetidos.ts`**

Trocar os imports do topo por:

```ts
import { PRECEDENCIA, type NivelPrecedencia, type RegraPrecedencia } from "@/data/precedencia";
import { casaSegmento, segmentarGrupo } from "@/lib/catalogo";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";
```

E acrescentar ao fim do arquivo:

```ts
export interface OcorrenciaRepetida {
  /** Grupo do retrato (`ResultadoGrupo.grupo`), como aparece no painel. */
  grupo: string;
  /** Grupo da tabela de precedência que o rótulo casou. */
  grupoRegra: string;
  /** `normalizarNome` do nome no cadastro. */
  chave: string;
  cargo: string;
  nivel?: NivelPrecedencia;
  ex: boolean;
  possivelSaida: boolean;
}

export type SituacaoRepetida = "decidido" | "conferir";

export interface AutoridadeRepetida {
  nome: string;
  ocorrencias: OcorrenciaRepetida[];
  situacao: SituacaoRepetida;
  /** Só quando decidido. */
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
}

export interface Escolha {
  situacao: SituacaoRepetida;
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
}

export const MOTIVO_PARCIAL = "Nome parecido em grupos diferentes: conferir se é a mesma pessoa";
export const MOTIVO_SEM_NIVEL = "Nenhum dos cargos está na Nominata: decidir à mão";

const rotulo = (o: OcorrenciaRepetida): string => `${o.grupoRegra} (${o.nivel ? o.nivel.nivel : "fora da Nominata"})`;

/** Com nível antes de sem nível; entre os com nível, a ordem da Nominata. */
function ordemDePrecedencia(a: OcorrenciaRepetida, b: OcorrenciaRepetida): number {
  if (a.nivel && b.nivel) return compararNivel(a.nivel.nivel, b.nivel.nivel);
  if (a.nivel) return -1;
  if (b.nivel) return 1;
  return 0;
}

/**
 * Regra do Clovis (2026-10-13): cargo atual vence cargo de "ex-"; entre os que restam,
 * vence o nível mais alto da Nominata. Empate, nenhum nível, nome parcial ou possível
 * saída no vencedor ficam para decidir à mão.
 */
export function escolherGrupo(ocorrencias: readonly OcorrenciaRepetida[], parcial: boolean): Escolha {
  if (parcial) return { situacao: "conferir", motivo: MOTIVO_PARCIAL };
  const atuais = ocorrencias.filter((o) => !o.ex);
  const disputa = atuais.length > 0 ? atuais : [...ocorrencias];
  let vencedor: OcorrenciaRepetida;
  let motivo: string;
  if (disputa.length === 1) {
    vencedor = disputa[0];
    const exs = [...new Set(ocorrencias.filter((o) => o.ex).map((o) => o.grupoRegra))].join(", ");
    motivo = `Cargo atual (${vencedor.grupoRegra}) vence cargo de ex- (${exs})`;
  } else {
    const [primeira, segunda] = [...disputa].sort(ordemDePrecedencia);
    if (!primeira.nivel) return { situacao: "conferir", motivo: MOTIVO_SEM_NIVEL };
    if (segunda.nivel && compararNivel(primeira.nivel.nivel, segunda.nivel.nivel) === 0) {
      return { situacao: "conferir", motivo: `Mesmo nível na Nominata (${primeira.nivel.nivel}): decidir à mão` };
    }
    vencedor = primeira;
    motivo = `${rotulo(primeira)} antes de ${rotulo(segunda)}`;
  }
  if (vencedor.possivelSaida) {
    return { situacao: "conferir", motivo: `Possível saída em ${vencedor.grupoRegra}: confirmar o cargo antes de decidir` };
  }
  return { situacao: "decidido", convidaPor: vencedor, motivo };
}

interface Entrada { nome: string; ocorrencia: OcorrenciaRepetida }

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);
const MIN_PALAVRAS_PARCIAL = 2;

function palavrasDoNome(chave: string): string[] {
  return chave.split(" ").filter((p) => p.length > 1 && !LIGACOES.has(p));
}

/** Uma entrada por segmento do rótulo que casa uma regra (célula "A; B" vira duas). */
function entradasDoGrupo(g: ResultadoGrupo): Entrada[] {
  const regras = segmentarGrupo(g.grupo)
    .map(regraDoSegmento)
    .filter((r): r is RegraPrecedencia => r !== undefined)
    .filter((r, i, todas) => todas.findIndex((x) => x.grupo === r.grupo) === i);
  return g.contatos.flatMap((c) => {
    const chave = normalizarNome(c.contato.nome);
    if (!chave) return [];
    const cargo = c.contato.cargo ?? "";
    return regras.map((regra) => ({
      nome: c.contato.nome,
      ocorrencia: {
        grupo: g.grupo, grupoRegra: regra.grupo, chave, cargo,
        ...(nivelDoCargo(regra, cargo) ? { nivel: nivelDoCargo(regra, cargo) } : {}),
        ex: regra.ex, possivelSaida: Boolean(c.possivelSaida),
      },
    }));
  });
}

function contido(a: readonly string[], b: readonly string[]): boolean {
  return a.length >= MIN_PALAVRAS_PARCIAL && a.every((p) => b.includes(p));
}

/** Junta as chaves de nome parcial (uma contida na outra) que estão em grupos diferentes. */
function componentesDeNome(porChave: ReadonlyMap<string, Entrada[]>): string[][] {
  const chaves = [...porChave.keys()];
  const pai = new Map(chaves.map((k) => [k, k]));
  const raiz = (k: string): string => (pai.get(k) === k ? k : raiz(pai.get(k) as string));
  const grupos = (k: string) => new Set((porChave.get(k) ?? []).map((e) => e.ocorrencia.grupoRegra));
  for (let i = 0; i < chaves.length; i++) {
    for (let j = i + 1; j < chaves.length; j++) {
      const [a, b] = [chaves[i], chaves[j]];
      const [pa, pb] = [palavrasDoNome(a), palavrasDoNome(b)];
      if (!contido(pa, pb) && !contido(pb, pa)) continue;
      if (new Set([...grupos(a), ...grupos(b)]).size < 2) continue;
      pai.set(raiz(a), raiz(b));
    }
  }
  const porRaiz = new Map<string, string[]>();
  for (const k of chaves) porRaiz.set(raiz(k), [...(porRaiz.get(raiz(k)) ?? []), k]);
  return [...porRaiz.values()];
}

/** Autoridades em dois ou mais grupos do retrato, com o grupo do convite. "Conferir" primeiro. */
export function autoridadesRepetidas(grupos: readonly ResultadoGrupo[]): AutoridadeRepetida[] {
  const entradas = grupos.flatMap(entradasDoGrupo);
  const porChave = new Map<string, Entrada[]>();
  for (const e of entradas) porChave.set(e.ocorrencia.chave, [...(porChave.get(e.ocorrencia.chave) ?? []), e]);

  const lista = componentesDeNome(porChave).flatMap((chaves): AutoridadeRepetida[] => {
    const doComponente = chaves.flatMap((k) => porChave.get(k) ?? []);
    const ocorrencias = doComponente
      .map((e) => e.ocorrencia)
      .filter((o, i, todas) => todas.findIndex((x) => x.grupo === o.grupo && x.grupoRegra === o.grupoRegra && x.chave === o.chave) === i);
    if (new Set(ocorrencias.map((o) => o.grupoRegra)).size < 2) return [];
    return [{ nome: doComponente[0].nome, ocorrencias, ...escolherGrupo(ocorrencias, chaves.length > 1) }];
  });

  return lista.sort((a, b) =>
    a.situacao !== b.situacao ? (a.situacao === "conferir" ? -1 : 1) : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Etiqueta da linha do contato no painel; fora de `etiquetasDoContato`, não pinta a situação. */
export function etiquetaDeRepeticao(
  repetidas: readonly AutoridadeRepetida[],
  c: ResultadoContato,
  grupo: string,
): Etiqueta | undefined {
  const chave = normalizarNome(c.contato.nome);
  const a = repetidas.find((r) => r.ocorrencias.some((o) => o.grupo === grupo && o.chave === chave));
  if (!a) return undefined;
  const convidaPor = a.convidaPor;
  if (a.situacao === "conferir" || !convidaPor) {
    return { campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: a.motivo };
  }
  if (convidaPor.grupo === grupo) {
    const outros = [...new Set(a.ocorrencias.filter((o) => o.grupoRegra !== convidaPor.grupoRegra).map((o) => o.grupoRegra))].join(", ");
    return { campo: "grupo", tom: "neutro", texto: `Convidada por este grupo; também em ${outros}`, explicacao: a.motivo };
  }
  return { campo: "grupo", tom: "ruim", texto: `Autoridade a ser convidada pelo grupo ${convidaPor.grupoRegra}`, explicacao: a.motivo };
}

export type FiltroRepetidas = "todas" | "decidido" | "conferir";

export function filtrarRepetidas(lista: readonly AutoridadeRepetida[], busca: string, filtro: FiltroRepetidas): AutoridadeRepetida[] {
  const termo = normalizarTexto(busca);
  return lista.filter((a) => (filtro === "todas" || a.situacao === filtro) && (!termo || normalizarTexto(a.nome).includes(termo)));
}

export function textoRepetidas(n: number): string {
  return n === 1 ? "1 autoridade em mais de um grupo" : `${n} autoridades em mais de um grupo`;
}
```

Observação: o teste "conferir vem antes de decidido" usa "Ana" e "Bia" — "Ana Fictícia" e "Bia Fictícia" têm palavras ["ana","ficticia"] e ["bia","ficticia"], nenhuma contida na outra, então não se juntam.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/repetidos.test.ts tests/precedencia.test.ts tests/painel.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add lib/repetidos.ts lib/painel.ts tests/repetidos.test.ts
git commit -m "feat: autoridades em mais de um grupo e grupo do convite"
```

---

### Tarefa 3: Planilha das autoridades em mais de um grupo

**Files:**
- Create: `lib/export-repetidos.ts`
- Test: `tests/export-repetidos.test.ts`

**Interfaces:**
- Consumes: `AutoridadeRepetida`, `OcorrenciaRepetida` (Tarefa 2).
- Produces: `CABECALHO_REPETIDAS`, `descreverOcorrencia(o: OcorrenciaRepetida): string`, `linhasRepetidas(lista: readonly AutoridadeRepetida[]): Record<string, string>[]`, `gerarXlsxRepetidas(lista: readonly AutoridadeRepetida[]): ArrayBuffer` (aba "Em mais de um grupo").

- [ ] **Step 1: Escrever o teste que falha**

`tests/export-repetidos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_REPETIDAS, descreverOcorrencia, gerarXlsxRepetidas, linhasRepetidas } from "@/lib/export-repetidos";
import { autoridadesRepetidas } from "@/lib/repetidos";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";

const linha = (nome: string, cargo: string): ResultadoContato => ({
  contato: { nome, cargo, grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos, novos: [] });

const lista = autoridadesRepetidas([
  grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra do Supremo Tribunal Federal")]),
  grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra do Tribunal Superior Eleitoral")]),
  grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "")]),
  grupo("Senadores", [linha("Rui Fictício", "Senador")]),
]);

describe("export das autoridades em mais de um grupo", () => {
  test("descreve cada ocorrência com cargo e nível", () => {
    const rui = lista.find((a) => a.nome === "Rui Fictício");
    expect(rui?.ocorrencias.map(descreverOcorrencia)).toEqual([
      "Ex-Presidentes do Senado: cargo vazio (3.5, ex-)",
      "Senadores: Senador (4.13)",
    ]);
  });

  test("uma linha por pessoa, com o grupo do convite", () => {
    const linhas = linhasRepetidas(lista);
    expect(linhas[0]).toEqual({
      Nome: "Ana Fictícia",
      "Situação": "Decidido",
      "Convidar pelo grupo": "Ministros do STF",
      "Cargo do convite": "Ministra do Supremo Tribunal Federal",
      "Nível na Nominata": "4.9 Ministros do Supremo Tribunal Federal",
      Motivo: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
      "Grupos em que está": "Ministros do STF: Ministra do Supremo Tribunal Federal (4.9); Ministros do TSE: Ministra do Tribunal Superior Eleitoral (5.9)",
    });
  });

  test("gera a aba com o cabeçalho, mesmo vazia", () => {
    for (const entrada of [lista, []]) {
      const wb = XLSX.read(gerarXlsxRepetidas(entrada), { type: "array" });
      expect(wb.SheetNames).toEqual(["Em mais de um grupo"]);
      const [cab] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Em mais de um grupo"], { header: 1 });
      expect(cab).toEqual([...CABECALHO_REPETIDAS]);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/export-repetidos.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/export-repetidos.ts`**

```ts
import * as XLSX from "xlsx";
import type { AutoridadeRepetida, OcorrenciaRepetida } from "@/lib/repetidos";

export const CABECALHO_REPETIDAS = [
  "Nome", "Situação", "Convidar pelo grupo", "Cargo do convite", "Nível na Nominata", "Motivo", "Grupos em que está",
] as const;

const ABA = "Em mais de um grupo";

export function descreverOcorrencia(o: OcorrenciaRepetida): string {
  const nivel = o.nivel ? o.nivel.nivel : "fora da Nominata";
  return `${o.grupoRegra}: ${o.cargo || "cargo vazio"} (${nivel}${o.ex ? ", ex-" : ""})`;
}

export function linhasRepetidas(lista: readonly AutoridadeRepetida[]): Record<string, string>[] {
  return lista.map((a) => ({
    Nome: a.nome,
    "Situação": a.situacao === "decidido" ? "Decidido" : "Conferir",
    "Convidar pelo grupo": a.convidaPor?.grupoRegra ?? "",
    "Cargo do convite": a.convidaPor?.cargo ?? "",
    "Nível na Nominata": a.convidaPor?.nivel ? `${a.convidaPor.nivel.nivel} ${a.convidaPor.nivel.nominata}` : "",
    Motivo: a.motivo,
    "Grupos em que está": a.ocorrencias.map(descreverOcorrencia).join("; "),
  }));
}

export function gerarXlsxRepetidas(lista: readonly AutoridadeRepetida[]): ArrayBuffer {
  const linhas = linhasRepetidas(lista);
  const aba = linhas.length > 0
    ? XLSX.utils.json_to_sheet(linhas, { header: [...CABECALHO_REPETIDAS] })
    : XLSX.utils.aoa_to_sheet([[...CABECALHO_REPETIDAS]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, ABA);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/export-repetidos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export-repetidos.ts tests/export-repetidos.test.ts
git commit -m "feat: planilha das autoridades em mais de um grupo"
```

---

### Tarefa 4: Página `/repetidos`, link e etiqueta no painel, documentação

**Files:**
- Create: `app/carregar-retrato.tsx` (leitura do retrato extraída de `app/page.tsx`)
- Modify: `app/page.tsx`
- Create: `app/repetidos/page.tsx`
- Create: `components/tela-repetidos.tsx`
- Modify: `components/painel.tsx` (link no cabeçalho e etiqueta nas linhas)
- Modify: `components/linha-contato.tsx` (prop `repeticao`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `autoridadesRepetidas`, `etiquetaDeRepeticao`, `filtrarRepetidas`, `textoRepetidas`, `FiltroRepetidas`, `AutoridadeRepetida` (Tarefa 2); `gerarXlsxRepetidas`, `descreverOcorrencia` (Tarefa 3); `baixar`, `MIME_XLSX` de `components/baixar.ts`; `textoDataHora` de `lib/painel.ts`; `ModoApp` de `lib/modo.ts`.
- Produces: `carregarRetrato(rota: string): Promise<CargaRetrato>` e `Aviso` em `app/carregar-retrato.tsx`; `TelaRepetidos({ repetidas, geradoEm })`; prop opcional `repeticao?: Etiqueta` em `LinhaContato`.

- [ ] **Step 1: Extrair a leitura do retrato**

Criar `app/carregar-retrato.tsx` com o corpo atual de `Home` (mesma lógica, mesmos textos), devolvendo dados em vez de desenhar o painel:

```tsx
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { armazemPadrao, RetratoIlegivelError, type Armazem } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { modoDoApp, type ModoApp } from "@/lib/modo";
import { COOKIE_SESSAO, validarToken } from "@/lib/sessao";
import type { Retrato } from "@/lib/types";

export function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: { href: string; rotulo: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-cinza">{texto}</p>
      {acao && <Link href={acao.href} className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">{acao.rotulo}</Link>}
    </main>
  );
}

export type CargaRetrato =
  | { retrato: Retrato; modo: ModoApp; podePublicar: boolean }
  | { aviso: ReactElement };

/** Lê o último retrato (local ou publicado) para uma página; `rota` só identifica o log técnico. */
export async function carregarRetrato(rota: string): Promise<CargaRetrato> {
  const modo = modoDoApp();
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (modo === "web" && !token) {
    return { aviso: <Aviso titulo="Ambiente não configurado" texto="Falta a variável BLOB_READ_WRITE_TOKEN neste ambiente. Nada quebrou; só não há de onde ler a varredura publicada." /> };
  }
  if (modo === "web") {
    // Defesa em profundidade: o middleware já barrou, aqui confere de novo.
    const sessao = (await cookies()).get(COOKIE_SESSAO)?.value;
    if (!(await validarToken(sessao, process.env.APP_SEGREDO_COOKIE ?? "", Date.now()))) redirect("/entrar");
  }
  const armazem: Armazem = modo === "web" ? armazemEmBlob(clienteBlobPadrao(token as string)) : armazemPadrao();

  let retrato: Retrato | undefined;
  try {
    retrato = await armazem.lerRetrato();
  } catch (err) {
    if (err instanceof RetratoIlegivelError) {
      return {
        aviso: modo === "web"
          ? <Aviso titulo="A varredura publicada não pôde ser lida" texto="O retrato publicado existe, mas não é um retrato válido para esta versão do painel. Publique de novo a partir da máquina do GT." />
          : <Aviso titulo="O último retrato não pôde ser lido" texto="O arquivo .fiscal/retrato.json existe, mas não é um retrato válido. Faça uma nova varredura; ela substitui o arquivo." acao={{ href: "/nova-varredura", rotulo: "Nova varredura" }} />,
      };
    }
    if (modo === "web") {
      // Blob fora do ar: nada de cache, nada de retrato velho (spec §7).
      console.error(`[${rota}] retrato publicado não lido:`, err instanceof Error ? err.message : "erro desconhecido");
      return { aviso: <Aviso titulo="Não foi possível ler a varredura publicada" texto="O serviço de armazenamento não respondeu. Recarregue a página em instantes." /> };
    }
    throw err;
  }
  if (!retrato) {
    if (modo === "web") return { aviso: <Aviso titulo="Nenhuma varredura publicada ainda" texto="Quando a máquina do GT publicar uma varredura, ela aparece aqui." /> };
    redirect("/nova-varredura");
  }
  return { retrato, modo, podePublicar: modo === "local" && Boolean(token) };
}
```

E `app/page.tsx` inteiro passa a ser:

```tsx
import { carregarRetrato } from "@/app/carregar-retrato";
import { Painel } from "@/components/painel";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const carga = await carregarRetrato("/");
  if ("aviso" in carga) return carga.aviso;
  // O painel não usa a base de endereços (só o /prodasen); não vai ao cliente.
  const { baseEnderecos: _base, ...retratoDoPainel } = carga.retrato;
  return <Painel retrato={retratoDoPainel} modo={carga.modo} podePublicar={carga.podePublicar} />;
}
```

- [ ] **Step 2: Página `/repetidos`**

`app/repetidos/page.tsx`:

```tsx
import { carregarRetrato } from "@/app/carregar-retrato";
import { TelaRepetidos } from "@/components/tela-repetidos";
import { autoridadesRepetidas } from "@/lib/repetidos";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Repetidos() {
  const carga = await carregarRetrato("/repetidos");
  if ("aviso" in carga) return carga.aviso;
  return <TelaRepetidos repetidas={autoridadesRepetidas(carga.retrato.grupos)} geradoEm={carga.retrato.geradoEm} />;
}
```

`components/tela-repetidos.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { baixar, MIME_XLSX } from "@/components/baixar";
import { Etiqueta } from "@/components/etiqueta";
import { descreverOcorrencia, gerarXlsxRepetidas } from "@/lib/export-repetidos";
import { textoDataHora } from "@/lib/painel";
import { filtrarRepetidas, textoRepetidas, type AutoridadeRepetida, type FiltroRepetidas } from "@/lib/repetidos";

const FILTROS: readonly { id: FiltroRepetidas; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "conferir", rotulo: "A conferir" },
  { id: "decidido", rotulo: "Decididas" },
];

export function TelaRepetidos({ repetidas, geradoEm }: { repetidas: AutoridadeRepetida[]; geradoEm: string }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroRepetidas>("todas");
  const lista = useMemo(() => filtrarRepetidas(repetidas, busca, filtro), [repetidas, busca, filtro]);
  const aConferir = repetidas.filter((a) => a.situacao === "conferir").length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-acao underline">← Painel</Link>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Autoridades em mais de um grupo</h1>
          <p className="mt-1 text-sm text-cinza">
            Varredura de {textoDataHora(geradoEm)} · {textoRepetidas(repetidas.length)} · {aConferir} a conferir.
            Cargo atual vence cargo de ex-; entre cargos atuais, vale a Nominata do GT.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-acao px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => baixar("autoridades-em-mais-de-um-grupo.xlsx", gerarXlsxRepetidas(lista), MIME_XLSX)}>
          Baixar planilha
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome"
          className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
        />
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full px-3 py-1 text-sm ${filtro === f.id ? "bg-tinta text-white" : "border border-borda-forte bg-cartao"}`}>
            {f.rotulo}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="mt-8 text-sm text-cinza">Nenhuma autoridade nesta seleção.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-borda-forte bg-cartao">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-cinza">
              <tr>
                <th className="px-4 py-2">Autoridade</th>
                <th className="px-4 py-2">Grupos em que está</th>
                <th className="px-4 py-2">Convidar pelo grupo</th>
                <th className="px-4 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={`${a.nome}-${a.ocorrencias[0]?.grupo}`} className="border-t border-separador align-top">
                  <td className="px-4 py-3 font-medium text-tinta">{a.nome}</td>
                  <td className="px-4 py-3 text-cinza">
                    <ul>{a.ocorrencias.map((o) => <li key={`${o.grupo}-${o.grupoRegra}`}>{descreverOcorrencia(o)}</li>)}</ul>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-tinta">{a.convidaPor?.grupoRegra ?? "—"}</span>
                    <span className="block text-xs text-cinza">{a.motivo}</span>
                  </td>
                  <td className="px-4 py-3">
                    {a.situacao === "decidido"
                      ? <Etiqueta texto="Decidido" tom="ok" />
                      : <Etiqueta texto="Conferir" tom="atencao" explicacao={a.motivo} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Etiqueta na linha do contato**

Em `components/linha-contato.tsx`:
- acrescentar o import `import type { Etiqueta as EtiquetaPainel } from "@/lib/painel";` (o nome `Etiqueta` já é o componente);
- a assinatura de `LinhaContato` passa a
  `export function LinhaContato({ c, g, retrato, eleicaoLigada = false, repeticao }: { c: ResultadoContato; g: ResultadoGrupo; retrato: Retrato; eleicaoLigada?: boolean; repeticao?: EtiquetaPainel }) {`
- a linha `const etiquetas = [...etiquetasDoContato(c, g), ...]` passa a começar pela etiqueta de repetição:
  `const etiquetas = [...(repeticao ? [repeticao] : []), ...etiquetasDoContato(c, g), ...(eleicaoLigada ? [...etiquetasDeEleicao(c.eleicao), ...etiquetasDeGoverno(c.eleicaoGoverno)] : [])];`
- `situacaoDoContato(c, g)` continua igual (a etiqueta de repetição não entra na situação).

Se `lib/painel` já for importado nesse arquivo num bloco `import { ... } from "@/lib/painel"`, acrescente `type Etiqueta as EtiquetaPainel` dentro desse bloco em vez de criar outro import.

- [ ] **Step 4: Link e etiquetas no painel**

Em `components/painel.tsx`:
- import: `import { autoridadesRepetidas, etiquetaDeRepeticao, textoRepetidas } from "@/lib/repetidos";`
- junto dos outros `useMemo`: `const repetidas = useMemo(() => autoridadesRepetidas(retrato.grupos), [retrato]);`
- no cabeçalho, logo depois de `<Link href="/grupos" ...>Grupos cadastrados</Link>`:
  `{repetidas.length > 0 && <Link href="/repetidos" className="text-sm text-acao underline">{textoRepetidas(repetidas.length)}</Link>}`
- na linha `{g.contatos.map((c, i) => <LinhaContato key=... c={c} g={g} retrato={retrato} eleicaoLigada={eleicaoLigada} />)}` acrescentar `repeticao={etiquetaDeRepeticao(repetidas, c, g.grupo)}`.

- [ ] **Step 5: Documentação (`CLAUDE.md`)**

- Na tabela de specs, a linha de 2026-10-14 passa de "Vigente; a implementar" para "Vigente; implementado".
- Em "Princípios de implementação", acrescentar depois do item da Eleição 2026:
  `- **Autoridade em mais de um grupo é calculada na tela e não pinta o semáforo.** \`lib/repetidos.ts\` lê \`retrato.grupos\`, junta a mesma pessoa pelo nome (\`normalizarNome\`; o \`Id\` muda por grupo; nome parcial vira "Conferir") e escolhe o grupo do convite pela tabela \`data/precedencia.ts\` (Nominata do GT): cargo atual vence cargo de "ex-"; entre atuais, o nível mais alto; cargo fora da Nominata perde para quem está nela; empate, nenhum nível ou possível saída no vencedor ficam para "Conferir". Grupos de eleitos e o PILOTO ficam fora. Página \`/repetidos\` (local e web) e etiqueta vermelha "Autoridade a ser convidada pelo grupo X" na linha do grupo que não convida, fora de \`etiquetasDoContato\`.`
- Em "Layout do código": em `app/` acrescentar `/repetidos`; em `lib/` acrescentar `repetidos, export-repetidos`; em `data/` acrescentar a linha `data/precedencia.ts  ← níveis da Nominata do GT por grupo (grupo do convite de quem está em mais de um grupo)`.

- [ ] **Step 6: Verificação completa**

Run (PowerShell): `npm test; if ($?) { npm run typecheck }; if ($?) { npm run build }`
Expected: suíte verde, typecheck limpo, build concluído com a rota `/repetidos` listada.

- [ ] **Step 7: Commit**

```bash
git add app/carregar-retrato.tsx app/page.tsx app/repetidos/page.tsx components/tela-repetidos.tsx components/painel.tsx components/linha-contato.tsx CLAUDE.md
git commit -m "feat: página das autoridades em mais de um grupo e etiqueta no painel"
```

---

## Depois das tarefas (controlador)

1. Validação com o retrato real (`.fiscal/retrato.json`), por script no scratchpad que imprime **só contagens**: total, decididas, a conferir, pares de grupos e o grupo escolhido por par. Conferir contra os exemplos do spec §6.
2. Revisão final da branch, PR para `main`, merge pelo Clovis, deploy automático da Vercel e conferência de `/repetidos` na web (sem e-mail ou telefone no HTML).
