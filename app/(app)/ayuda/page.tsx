import { AyudaView } from "@/components/ayuda-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABS = ["faq", "novedades"] as const;

export default async function AyudaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [profile, sp] = await Promise.all([getCurrentProfile(), searchParams]);
  const tabInicial = TABS.find((t) => t === sp.tab) ?? "faq";
  return <AyudaView esGestor={esGestor(profile)} tabInicial={tabInicial} />;
}
