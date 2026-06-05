import type { Semaforo } from "@/lib/types";

const CORES: Record<Semaforo, string> = {
  verde: "bg-green-100 text-green-800",
  amarelo: "bg-yellow-100 text-yellow-800",
  vermelho: "bg-red-100 text-red-800",
  novo: "bg-blue-100 text-blue-800",
  indeterminado: "bg-gray-100 text-gray-700",
};

const ROTULOS: Record<Semaforo, string> = {
  verde: "OK", amarelo: "Revisar", vermelho: "Divergência", novo: "Novo",
  indeterminado: "Não verificado",
};

export function SemaforoBadge({ status }: { status: Semaforo }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${CORES[status]}`}>
      {ROTULOS[status]}
    </span>
  );
}
