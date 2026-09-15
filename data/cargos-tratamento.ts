/**
 * Exceções de casamento cargo → tabela de protocolo.
 *
 * Chave: o cargo **como aparece na planilha** do Sistema Contatos, normalizado
 * (minúsculas, sem acento — o mesmo que `normalizarTexto` produz).
 * Valor: o `cargoDestinatario` exato de uma entrada de `data/tratamentos.ts`.
 *
 * A exceção tem precedência sobre o casamento exato e sobre a similaridade. Serve para
 * quando a taxonomia da planilha não bate com a da tabela — por exemplo, se "Ministro do STF"
 * precisar cair em "Ministro de Tribunal Superior".
 *
 * Começa vazio de propósito: cada entrada é uma decisão de cerimonial e deve ser confirmada
 * pelo Clovis, não adivinhada. Para descobrir o que falta, rode uma análise e veja os campos
 * marcados como "sem regra" — eles listam exatamente os cargos ainda não mapeados.
 *
 * Exemplo de entrada:
 *   "ministro do stf": "Ministro de Tribunal Superior",
 */
export const EXCECOES_CARGO: Readonly<Record<string, string>> = {};
