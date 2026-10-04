import { notFound } from "next/navigation";
import { NovaVarreduraTela } from "@/components/nova-varredura-tela";
import { modoDoApp } from "@/lib/modo";

export const dynamic = "force-dynamic";

export default function NovaVarreduraPage() {
  if (modoDoApp() === "web") notFound();
  return <NovaVarreduraTela />;
}
