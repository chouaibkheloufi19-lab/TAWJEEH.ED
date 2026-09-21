const FUNCTION_SECTION_TITLES: Record<string, string> = {
  domain: "D_f · مجموعة التعريف | Domaine",
  limits: "lim · النهايات | Limites",
  derivative: "f′ · الاشتقاق | Dérivée",
  variations: "Δf · اتجاه التغيرات | Variations",
  equations: "E_f · المعادلات والمتراجحات | Équations · Inéquations",
  "relative-position": "C_f/Δ · الوضع النسبي | Position relative",
  tangent: "T_a · المماس | Tangente",
  graph: "C_f · التمثيل البياني | Courbe",
  asymptotes: "Δ, T_a · المقارب والمماس | Asymptote · Tangente",
  synthesis: "Σ · تركيب الدراسة | Synthèse",
};

function sectionKey(id: string, title: string): string {
  const value = `${id} ${title}`.toLocaleLowerCase();
  if (/domain|مجموعة التعريف|مجال التعريف|تعريف الدالة/.test(value)) return "domain";
  if (/relative|position|الوضع النسبي/.test(value)) return "relative-position";
  if (/asymptote|مقارب/.test(value) && !/graph|تمثيل بياني/.test(value)) return "asymptotes";
  if (/tangent|مماس/.test(value) && !/graph|تمثيل بياني/.test(value)) return "tangent";
  if (/graph|courbe|تمثيل بياني|منحنى/.test(value)) return "graph";
  if (/variation|تغير|اتجاه/.test(value)) return "variations";
  if (/equation|inequation|معادلات|متراجحات/.test(value)) return "equations";
  if (/derivative|dérivée|اشتقاق|مشتقة/.test(value)) return "derivative";
  if (/limit|limite|نهايات|نهاية/.test(value)) return "limits";
  if (/synthesis|synthèse|تركيب|خلاصة الدراسة/.test(value)) return "synthesis";
  return "";
}

export function normalizeFunctionSectionTitle(id: string, title: string): string {
  return FUNCTION_SECTION_TITLES[sectionKey(id, title)] ?? title.trim();
}