/** Nomes entre aspas, separados por vírgula e "e" antes do último: `"a", "b" e "c"`. */
export function listarEntreAspas(nomes: readonly string[]): string {
  const entreAspas = nomes.map((n) => `"${n}"`);
  if (entreAspas.length <= 1) return entreAspas.join("");
  return `${entreAspas.slice(0, -1).join(", ")} e ${entreAspas[entreAspas.length - 1]}`;
}
