export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// O endereço /site/:slug sai do nome da pousada — quando a pousada é
// renomeada, o link antigo (já divulgado) continua abrindo o site certo.
export const LEGACY_SLUGS: Record<string, string> = {
  "pesqueiro-vagalume": "pousada-vagalume", // renomeada em 20/10/2026
};

export const resolveSlug = (slug: string): string => LEGACY_SLUGS[slug] || slug;
