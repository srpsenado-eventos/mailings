/** Nomes entre aspas, separados por vírgula e "e" antes do último: `"a", "b" e "c"`. */
export function listarEntreAspas(nomes: readonly string[]): string {
  const entreAspas = nomes.map((n) => `"${n}"`);
  if (entreAspas.length <= 1) return entreAspas.join("");
  return `${entreAspas.slice(0, -1).join(", ")} e ${entreAspas[entreAspas.length - 1]}`;
}

/** Junta mensagens presentes (aviso da triagem, erro de leitura) com " | "; sem nenhuma, `null`. */
export function juntarMensagens(partes: readonly (string | null)[]): string | null {
  const presentes = partes.filter((p): p is string => p !== null && p.length > 0);
  return presentes.length > 0 ? presentes.join(" | ") : null;
}
