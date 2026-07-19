/**
 * Category emoji — the second tier of the merchant badge.
 *
 * Badge priority in MerchantAvatar:
 *   1. real brand logo (lib/merchant-brands)
 *   2. this: an emoji for what the expense *is* — travel ✈️, fast food 🍔
 *   3. the plain initial, when we can't tell
 *
 * Resolution walks category name first (exact match against every default
 * category in all three languages, then legacy names, then loose keywords),
 * and falls back to keywords in the raw expense name — so an uncategorised
 * "voo Lisboa" or "gasolina" still gets a glyph.
 *
 * Emojis come from the DEFAULT_CATEGORY_HIERARCHY icon field so the badge and
 * the category picker always agree.
 */

import {
  DEFAULT_CATEGORY_HIERARCHY,
  LEGACY_CATEGORY_MIGRATION,
} from "@/lib/category-hierarchy";

/** Normalize for matching: lowercase, strip accents and punctuation. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// key -> emoji, for every parent and child in the default tree.
const EMOJI_BY_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const parent of DEFAULT_CATEGORY_HIERARCHY) {
    map[parent.key] = parent.icon;
    for (const child of parent.children) map[child.key] = child.icon;
  }
  return map;
})();

// normalized category name (all 3 languages, parents + children) -> emoji.
const EMOJI_BY_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const parent of DEFAULT_CATEGORY_HIERARCHY) {
    for (const label of Object.values(parent.translations)) {
      map[normalize(label)] = parent.icon;
    }
    for (const child of parent.children) {
      for (const label of Object.values(child.translations)) {
        map[normalize(label)] = child.icon;
      }
    }
  }
  // Legacy / renamed categories still sitting in older workspaces.
  for (const [name, key] of Object.entries(LEGACY_CATEGORY_MIGRATION)) {
    const emoji = EMOJI_BY_KEY[key];
    if (emoji) map[normalize(name)] ??= emoji;
  }
  return map;
})();

/**
 * Loose keyword rules, checked against the category name and then the expense
 * name. Order matters — first hit wins, so put the specific terms above the
 * generic ones ("supermercado" before "mercado", "fast food" before "food").
 * Terms are matched on word boundaries to avoid false positives.
 */
const KEYWORD_EMOJI: { emoji: string; terms: string[] }[] = [
  // Travel — the one Kiko called out
  { emoji: "🏨", terms: ["hotel", "hostel", "resort", "stay", "alojamento", "airbnb", "booking", "hebergement"] },
  { emoji: "✈️", terms: ["travel", "flight", "flights", "airline", "airport", "voo", "voos", "viagem", "viagens", "ferias", "aeroporto", "voyage", "vol", "vacances", "ryanair", "easyjet"] },
  // Food, most specific first
  { emoji: "🍔", terms: ["fast food", "takeaway", "take away", "burger", "hamburguer", "mcdonalds", "snack bar", "glovo", "ubereats", "uber eats", "bolt food", "deliveroo"] },
  { emoji: "🍕", terms: ["pizza", "pizzaria", "pizzeria"] },
  { emoji: "🍣", terms: ["sushi", "japones", "japonais"] },
  { emoji: "☕", terms: ["coffee", "cafe", "cafeteria", "pastelaria", "padaria", "bakery", "boulangerie", "brunch", "pequeno almoco", "petit dejeuner", "breakfast"] },
  { emoji: "🍺", terms: ["bar", "bares", "pub", "cerveja", "beer", "biere", "drinks", "copos"] },
  { emoji: "🛒", terms: ["groceries", "grocery", "supermercado", "supermarket", "supermarche", "mercearia", "hipermercado", "courses", "epicerie", "compras semana"] },
  { emoji: "🍽️", terms: ["restaurant", "restaurants", "restaurante", "restauracao", "dining", "food", "comida", "almoco", "jantar", "lunch", "dinner", "repas", "alimentacao", "refeicao"] },
  // Transport
  { emoji: "⛽", terms: ["fuel", "gas", "gasolina", "gasoleo", "diesel", "combustivel", "gpl", "essence", "carburant", "abastecimento", "posto", "galp", "repsol", "cepsa", "bp"] },
  { emoji: "🅿️", terms: ["parking", "estacionamento", "portagem", "portagens", "toll", "tolls", "peage", "peages", "via verde"] },
  { emoji: "🚕", terms: ["taxi", "uber", "bolt", "tvde", "ride sharing", "vtc"] },
  { emoji: "🚌", terms: ["bus", "autocarro", "metro", "comboio", "train", "cp", "carris", "passe", "transporte publico", "public transport"] },
  { emoji: "🚗", terms: ["car", "carro", "voiture", "auto", "automovel", "oficina", "garagem", "pneus", "inspecao", "revisao", "lavagem"] },
  // Home
  { emoji: "🏠", terms: ["rent", "renda", "mortgage", "hipoteca", "loyer", "casa", "home", "maison", "condominio"] },
  { emoji: "🛋️", terms: ["furniture", "mobilia", "moveis", "ikea", "electrodomesticos", "eletrodomesticos", "appliances", "meubles"] },
  { emoji: "🔨", terms: ["renovation", "obras", "renovacao", "remodelacao", "bricolage"] },
  { emoji: "🔧", terms: ["maintenance", "manutencao", "repair", "repairs", "reparacao", "reparacoes", "entretien"] },
  { emoji: "🧱", terms: ["materials", "materiais", "materiaux", "supplies"] },
  // Bills
  { emoji: "💡", terms: ["utilities", "utilitarios", "electricity", "electricidade", "eletricidade", "luz", "agua", "water", "gas natural", "edp", "epal", "servicos"] },
  { emoji: "📱", terms: ["phone", "telefone", "telemovel", "internet", "mobile", "telecom", "telecomunicacoes", "vodafone", "meo", "nos", "fibra"] },
  { emoji: "📺", terms: ["subscription", "subscriptions", "subscricao", "subscricoes", "abonnement", "abonnements", "netflix", "spotify", "streaming"] },
  // Health & body
  { emoji: "💊", terms: ["pharmacy", "farmacia", "pharmacie", "medical", "medico", "medecin", "health", "saude", "sante", "dentista", "dentist", "clinica", "hospital", "analises"] },
  { emoji: "🏃", terms: ["gym", "ginasio", "fitness", "sport", "sports", "desporto", "padel", "crossfit", "yoga", "piscina"] },
  { emoji: "💇", terms: ["barber", "barbeiro", "barbearia", "hair", "cabeleireiro", "coiffeur", "personal care", "cuidados pessoais", "spa", "estetica"] },
  // Shopping
  { emoji: "👗", terms: ["clothing", "clothes", "roupa", "vestuario", "vetements", "beauty", "beleza", "zara", "sapatos", "shoes"] },
  { emoji: "💻", terms: ["electronics", "eletronica", "electronica", "tech", "tecnologia", "informatica", "computer", "computador", "gadget", "worten"] },
  { emoji: "🛍️", terms: ["shopping", "compras", "achats", "amazon", "aliexpress"] },
  // Entertainment
  { emoji: "🎬", terms: ["cinema", "movie", "movies", "concert", "concerto", "festival", "teatro", "theatre", "event", "evento", "eventos", "sortie", "sorties", "bilhete", "bilhetes", "ticket", "tickets"] },
  { emoji: "🎨", terms: ["hobby", "hobbies", "loisirs", "arte", "art", "pintura", "fotografia", "photography", "musica", "music", "guitarra", "instrumento"] },
  { emoji: "🎮", terms: ["game", "games", "jogos", "gaming", "playstation", "xbox", "nintendo", "steam"] },
  // Money & admin
  { emoji: "🏛️", terms: ["tax", "taxes", "imposto", "impostos", "impots", "irs", "iva", "financas", "seguranca social"] },
  { emoji: "📊", terms: ["accounting", "contabilidade", "comptabilite", "contabilista"] },
  { emoji: "🛡️", terms: ["insurance", "seguro", "seguros", "assurance"] },
  { emoji: "🏦", terms: ["bank", "banco", "banque", "bank fees", "comissao", "comissoes", "juros", "emprestimo", "credito", "loan"] },
  { emoji: "💸", terms: ["transferencia", "transfer", "trf", "mbway", "mb way", "paypal", "levantamento", "atm", "virement"] },
  { emoji: "📈", terms: ["investment", "investments", "investimento", "investimentos", "invest", "crypto", "bybit", "binance", "etf", "acoes", "poupanca", "savings"] },
  { emoji: "📮", terms: ["ctt", "correios", "postage", "portes", "envio", "shipping", "poste"] },
  // Learning, gifts, pets, kids
  { emoji: "📚", terms: ["course", "courses training", "curso", "cursos", "formacao", "training", "education", "educacao", "escola", "school", "universidade", "propinas"] },
  { emoji: "📖", terms: ["book", "books", "livro", "livros", "livres", "material escolar"] },
  { emoji: "🎁", terms: ["gift", "gifts", "presente", "presentes", "cadeau", "cadeaux", "donation", "doacao", "doacoes", "prenda"] },
  { emoji: "🐾", terms: ["pet", "pets", "animal", "animais", "animaux", "veterinario", "vet", "racao", "cao", "gato"] },
  { emoji: "🧸", terms: ["kids", "children", "criancas", "filhos", "bebe", "baby", "enfants", "creche", "brinquedo", "brinquedos"] },
  // Income
  { emoji: "💰", terms: ["income", "salary", "salario", "ordenado", "vencimento", "revenu", "salaire", "receita", "receitas", "pagamento recebido", "reembolso", "refund"] },
];

function matchesTerm(text: string, tokens: string[], term: string): boolean {
  if (term.includes(" ")) {
    return (
      text === term ||
      text.startsWith(term + " ") ||
      text.endsWith(" " + term) ||
      text.includes(" " + term + " ")
    );
  }
  return tokens.includes(term);
}

function keywordEmoji(raw: string): string | null {
  const text = normalize(raw);
  if (!text) return null;
  const tokens = text.split(" ");
  for (const { emoji, terms } of KEYWORD_EMOJI) {
    for (const term of terms) {
      if (matchesTerm(text, tokens, term)) return emoji;
    }
  }
  return null;
}

/**
 * Resolve an emoji for a badge, or null to fall back to the initial.
 * `category` wins over `name` — the user's own filing beats a guess.
 */
export function resolveCategoryEmoji(
  category?: string | null,
  name?: string | null
): string | null {
  if (category) {
    const key = normalize(category);
    // "Other"/"Uncategorized" carry no meaning — better to show the initial.
    const exact = EMOJI_BY_NAME[key];
    if (exact && exact !== "❓") return exact;
    const byKeyword = keywordEmoji(category);
    if (byKeyword) return byKeyword;
  }
  if (name) return keywordEmoji(name);
  return null;
}
