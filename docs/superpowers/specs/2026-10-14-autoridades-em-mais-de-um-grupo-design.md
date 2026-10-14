# Autoridades em mais de um grupo: grupo do convite pela precedência

Data: 2026-10-14. Situação: aprovado em conversa (desenho), aguardando revisão deste texto.

## 1. Problema

A mesma autoridade aparece em mais de um grupo do Sistema Contatos: ministros do STF e do STJ que também estão no TSE, senadores que já presidiram o Senado, ministro do TCU que foi presidente do Senado. O convite da Posse 2027 é um só por pessoa, e o GT precisa saber **por qual grupo** e **em qual cargo** cada uma será chamada. Hoje o painel mostra cada linha no seu grupo, sem ligar uma à outra.

No retrato de 2026-10-12 (419 contatos, 18 grupos) a medição deu cerca de 10 pessoas: STF + TSE (3), STJ + TSE (2), Ex-Presidentes do Senado + Senadores (2), Ex-Presidentes do Senado + TCU (1), Ex-Presidentes da República + Ex-Presidentes do Senado (1) e Governadores + STJ (1, provável homônimo parcial).

## 2. Decisões do Clovis (2026-10-13)

1. **Fonte da verdade da precedência:** a Nominata do GT, `GT Posse/Nominata/Nominata 2027_Modelo após ajustes Daniel (1).xlsx` (idêntica a `tabela nominata posse.xlsx`): Ordem Geral de Precedência do Decreto 70.274/72 com os acréscimos do GT, 220 níveis de 1.1 a 11.11.
2. **Regra:** quem tem cargo atual vai pelo cargo atual, independentemente da Nominata. A Nominata só decide entre dois cargos atuais: a pessoa é chamada pelo cargo mais alto.
3. **Etiqueta:** vermelha só na linha do grupo que **não** convida ("Autoridade a ser convidada pelo grupo X"); a linha do grupo que convida leva etiqueta neutra.
4. **Consulta:** página própria, com link no painel.
5. **Fora:** os reeleitos (eixo Eleição 2026), que já estão no lugar certo pela Ata 14.

## 3. Abordagem

Cálculo **na tela, a partir do retrato**, por função pura, como o grupo virtual dos Deputados (`lib/painel-deputados.ts`). Não muda a varredura, não grava campo novo no retrato e funciona no retrato de 12/10 já publicado, local e na web: nome, cargo e grupo já vão para a web.

Descartadas: calcular na varredura e gravar no retrato (exige coleta nova a cada ajuste da tabela) e planilha à parte por script (fica fora do painel e da web).

## 4. Tabela de precedência (`data/precedencia.ts`)

Arquivo versionado, sem PII, conferido pelo Clovis antes do merge. Cada entrada liga **um grupo do Contatos** e, quando preciso, **o papel do cargo** a um nível da Nominata, e diz se o cargo é **atual** ou **de "ex-"**:

```ts
interface NivelPrecedencia {
  nivel: string;          // "4.9" — como na Nominata
  nominata: string;       // "Ministros do Supremo Tribunal Federal" — texto da Nominata
}
interface RegraPrecedencia {
  grupo: string;                       // nome do grupo, casado como em lib/catalogo.ts
  ex: boolean;                         // true: cargo de "ex-" (perde para qualquer cargo atual)
  presidente?: NivelPrecedencia;       // quando o cargo começa por "Presidente" (não "Vice-Presidente")
  nivel?: NivelPrecedencia;            // demais cargos do grupo; ausente = grupo fora da Nominata
}
```

O grupo do contato casa a regra pela mesma lógica de segmentos de `lib/catalogo.ts` (célula com vários grupos separados por ";", exato primeiro, contenção depois). "Presidente" é o cargo normalizado que começa por `presidente` e não por `vice-presidente`.

Proposta inicial (o Clovis confere; os itens marcados **a confirmar** saem sem nível até ele decidir):

| Grupo | Presidente | Demais | ex |
|---|---|---|---|
| Presidente da República | — | 1.1 | não |
| Vice-Presidente da República | — | 2.1 | não |
| Presidente do Senado | — | 3.1 (Presidente do Congresso Nacional) | não |
| Presidente da Câmara dos Deputados | — | 3.2 | não |
| Ministros do STF | 3.3 | 4.9 | não |
| Ex-Presidentes da República | — | 3.4 | sim |
| Ex-Presidentes do Senado | — | 3.5 (Ex-Presidentes do Congresso Nacional) | sim |
| Ministros de Estado | — | 4.1 | não |
| Ministros do TSE | 4.8 | 5.9 | não |
| Procurador-Geral da República | — | 4.10 | não |
| Defensor Público Geral da União | — | 4.10.1 | não |
| Governadores | — | 4.12 (4.11 quando o cargo cita o Distrito Federal) | não |
| Senadores (os três grupos e o rótulo "Senadores") | — | 4.13 | não |
| Ministros do STJ | 5.5.1 | 6.1.1 | não |
| Ministros do STM | 5.6 | 6.2 | não |
| Ministros do TST | 5.7 | 6.3 | não |
| Ministros do TCU | 5.8 | 6.4 | não |
| Diretor-Geral e Secretário-Geral da Mesa do Senado Federal | — | 6.13 | não |
| Presidentes das Assembleias Legislativas das UFs | — | 7.6 | não |
| Ex-Senadores | — | sem nível | sim |
| Embaixadores (os três grupos) | — | **a confirmar** (2.3 se são embaixadores estrangeiros) | não |
| Comandantes das Forças Armadas e EMCFA | — | **a confirmar** (a Nominata usa os títulos antigos) | não |
| CNJ, CNMP, OAB, conselhos, assessorias | — | sem nível (fora da Nominata) | não |

Grupos do eixo Eleição 2026 ("… Eleitos") e o grupo PILOTO não entram na tabela e são ignorados.

## 5. Quem é a mesma pessoa

O `Id` do Contatos muda de grupo para grupo (cada grupo tem registro próprio; medido em 12/10: nenhum `Id` em dois grupos). A identificação é pelo nome:

- **Nome igual** após `normalizarNome` → mesma pessoa.
- **Nome parcial**: as palavras de um nome (pelo menos 2, sem tratamentos e preposições) estão todas no outro → pessoa **a conferir** ("Conferir: pode ser homônimo"). O app não escolhe grupo nesse caso.
- **Célula com dois grupos** ("Presidente do Senado Federal; Senadores"): uma linha só, com uma ocorrência para cada segmento que casa uma regra da tabela. Segmentos que não casam (mailings de evento) são ignorados.
- Só contam ocorrências em grupos **diferentes**. Ocorrências dentro do mesmo grupo não fazem parte deste eixo.

## 6. Regra de escolha

Para cada pessoa com ocorrências em dois ou mais grupos:

1. Se há ao menos um cargo **atual**, os de "ex-" saem da disputa.
2. Entre os que restam, vence o **nível mais alto** da Nominata (comparação por número: 3.3 antes de 4.9, 4.10 depois de 4.9, 4.10.1 depois de 4.10).
3. Ocorrência **sem nível** perde para qualquer ocorrência com nível (o que não está na Nominata vem depois de tudo o que está).
4. Vira **"Conferir"**, sem grupo escolhido, quando:
   - os dois melhores têm o mesmo nível;
   - nenhum dos que restam tem nível;
   - o casamento foi por nome parcial (§5);
   - a ocorrência vencedora está como **possível saída** no retrato (o cargo pode não ser mais atual).

O motivo vai em texto ("Cargo atual vence cargo de ex-", "Presidente do TSE (4.8) antes de Ministros do STF (4.9)", "Mesmo nível: decidir à mão").

Exemplos com o retrato de 12/10:

| Caso | Fica em | Motivo |
|---|---|---|
| Senador que presidiu o Senado | Senadores | cargo atual vence ex- |
| Ministro do TCU que presidiu o Senado | Ministros do TCU | cargo atual vence ex- |
| Ministro do STF no TSE | Ministros do STF | 4.9 antes de 5.9 |
| Ministro do STF que preside o TSE | Ministros do TSE | 4.8 antes de 4.9 |
| Ministro do STJ no TSE | Ministros do TSE | 5.9 antes de 6.1.1 |
| Ex-Presidente da República e do Senado | Ex-Presidentes da República | 3.4 antes de 3.5 |

## 7. Módulo e tipos (`lib/repetidos.ts`, função pura)

```ts
interface OcorrenciaRepetida {
  grupo: string;            // grupo do retrato (ResultadoGrupo.grupo)
  grupoRegra?: string;      // segmento que casou a regra (célula com vários grupos)
  cargo: string;
  nivel?: NivelPrecedencia;
  ex: boolean;
  possivelSaida: boolean;
}
interface AutoridadeRepetida {
  nome: string;
  ocorrencias: OcorrenciaRepetida[];
  situacao: "decidido" | "conferir";
  convidaPor?: OcorrenciaRepetida;   // só quando decidido
  motivo: string;
}
function autoridadesRepetidas(grupos: readonly ResultadoGrupo[]): AutoridadeRepetida[];
function etiquetaDeRepeticao(repetidas: readonly AutoridadeRepetida[], c: ResultadoContato, grupo: string): Etiqueta | undefined;
```

`CampoEtiqueta` ganha `"grupo"`.

## 8. Tela

- **Página `/repetidos`** (Server Component, local e web; na web atrás da senha pelo `middleware.ts` existente). Título "Autoridades em mais de um grupo". Uma linha por pessoa: nome, grupos com cargo e nível, **grupo que convida**, motivo e situação (Decidido / Conferir). As "Conferir" vêm primeiro. Busca por nome e filtro Decidido/Conferir. Botão para baixar `.xlsx` com a mesma tabela (aba "Em mais de um grupo"), gerado no navegador como os exports existentes.
- **Painel (`/`)**: no cabeçalho, link "N autoridades em mais de um grupo" (só quando N > 0).
- **Etiquetas na linha do contato** (sempre visíveis, fora da chave "Eleição 2026"):
  - grupo que não convida: vermelha (`tom: "ruim"`) "Autoridade a ser convidada pelo grupo X";
  - grupo que convida: neutra "Convidada por este grupo; também em Y";
  - a conferir: atenção "Em mais de um grupo: conferir".
- Como os eixos Endereço e Eleição, a etiqueta **não muda** o semáforo, a situação da linha ("Tudo confere"/"N a revisar"), os filtros nem os cartões do resumo. Fica fora de `etiquetasDoContato` e é somada na renderização, como as etiquetas de eleição.

## 9. Segurança e dados

- Nenhum nome em log nem em prompt de IA; a IA não participa.
- Nada novo é publicado: a web já recebe nome, cargo e grupo do retrato enxuto. `lib/publicar.ts` não muda.
- A Nominata (xlsx) continua fora do git; só os níveis usados entram em `data/precedencia.ts`, com o número e o texto copiados.

## 10. Fora do escopo

- Unificar o cadastro ou apagar a linha do grupo que não convida (é tarefa do GT no Contatos).
- Deputados Federais (grupo virtual da planilha da Câmara) e os grupos de eleitos.
- Repetição dentro do mesmo grupo.
- Alterar a tabela de precedência pela tela.

## 11. Validação

- Testes de `lib/repetidos.ts` cobrindo cada regra do §6, o nome parcial, a célula com dois grupos, o grupo ignorado (PILOTO, eleitos), o cargo sem nível, o empate e a possível saída; testes de `data/precedencia.ts` (níveis válidos, sem grupo duplicado).
- Teste da etiqueta (vermelha/neutra/atenção) e de que a situação da linha não muda.
- Com o retrato de 12/10, só contagens: total de pessoas, decididas e a conferir, por par de grupos; conferir que os casos do §6 saem como na tabela de exemplos.
- `npm test`, `npm run typecheck`, `npm run build`; depois PR, merge, deploy automático pela Vercel e conferência de `/repetidos` na web.
