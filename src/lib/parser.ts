// Smart Parsing Pipeline for Amigo
// Level 1: Local keyword mapping
// Level 2: LLM (future - opt-in)

export type ParsedExpense = {
  name: string;
  amount: number;
  category: string | null;
  merchant: string | null;
};

// Category name variants (subcategory name -> alternatives to try)
// This allows matching workspaces with Portuguese, French, or other language categories
export const CATEGORY_VARIANTS: Record<string, string[]> = {
  "Restaurants & Dining Out": ["Restaurants & Dining Out", "Restaurantes", "Comida", "Restauração", "Alimentação", "Restauration", "Repas"],
  "Car": ["Car", "Carro", "Voiture"],
  "Public Transport": ["Public Transport", "Transporte Público", "Transport en Commun"],
  "Taxi / Ride-sharing": ["Taxi / Ride-sharing", "Táxi / TVDE", "Taxi / VTC"],
  "Subscriptions": ["Subscriptions", "Subscrições", "Subscrição", "Assinaturas", "Abonnements"],
  "Utilities": ["Utilities", "Utilitários", "Serviços", "Services"],
  "Rent / Mortgage": ["Rent / Mortgage", "Renda / Hipoteca", "Loyer / Hypothèque", "Renda", "Casa"],
  "Groceries": ["Groceries", "Mercearia", "Supermercado", "Épicerie", "Courses"],
  "Medical & Pharmacy": ["Medical & Pharmacy", "Médico & Farmácia", "Médecin & Pharmacie", "Saúde", "Santé"],
  "Fast Food & Takeaway": ["Fast Food & Takeaway", "Fast Food"],
  "Coffee, Snacks & Breakfast": ["Coffee, Snacks & Breakfast", "Café, Snacks & Pequeno-almoço"],
  "Internet & Phone": ["Internet & Phone", "Internet & Telefone", "Internet & Téléphone"],
};

// Hardcoded keyword mappings for Level 1 parsing
export const KEYWORD_MAP: Record<string, { merchant: string; category: string }> = {
  // Restaurants & Dining Out
  mcd: { merchant: "McDonald's", category: "Fast Food & Takeaway" },
  mcdonalds: { merchant: "McDonald's", category: "Fast Food & Takeaway" },
  burger: { merchant: "Burger King", category: "Fast Food & Takeaway" },
  kfc: { merchant: "KFC", category: "Fast Food & Takeaway" },
  subway: { merchant: "Subway", category: "Fast Food & Takeaway" },
  pizza: { merchant: "Pizza", category: "Restaurants & Dining Out" },
  starbucks: { merchant: "Starbucks", category: "Coffee, Snacks & Breakfast" },
  cafe: { merchant: "Café", category: "Coffee, Snacks & Breakfast" },
  restaurante: { merchant: "Restaurante", category: "Restaurants & Dining Out" },
  almoco: { merchant: "Almoço", category: "Restaurants & Dining Out" },
  jantar: { merchant: "Jantar", category: "Restaurants & Dining Out" },

  // Transport
  uber: { merchant: "Uber", category: "Taxi / Ride-sharing" },
  bolt: { merchant: "Bolt", category: "Taxi / Ride-sharing" },
  taxi: { merchant: "Taxi", category: "Taxi / Ride-sharing" },
  gasolina: { merchant: "Gasolina", category: "Car" },
  combustivel: { merchant: "Combustível", category: "Car" },
  metro: { merchant: "Metro", category: "Public Transport" },
  comboio: { merchant: "Comboio", category: "Public Transport" },

  // Subscriptions
  spotify: { merchant: "Spotify", category: "Subscriptions" },
  netflix: { merchant: "Netflix", category: "Subscriptions" },
  youtube: { merchant: "YouTube Premium", category: "Subscriptions" },
  hbo: { merchant: "HBO Max", category: "Subscriptions" },
  disney: { merchant: "Disney+", category: "Subscriptions" },
  amazon: { merchant: "Amazon Prime", category: "Subscriptions" },

  // Utilities & Bills
  luz: { merchant: "Eletricidade", category: "Utilities" },
  agua: { merchant: "Água", category: "Utilities" },
  gas: { merchant: "Gás", category: "Utilities" },
  internet: { merchant: "Internet", category: "Internet & Phone" },
  telefone: { merchant: "Telefone", category: "Internet & Phone" },
  telemovel: { merchant: "Telemóvel", category: "Internet & Phone" },

  // Home
  renda: { merchant: "Renda", category: "Rent / Mortgage" },
  aluguer: { merchant: "Aluguer", category: "Rent / Mortgage" },
  condominio: { merchant: "Condomínio", category: "Rent / Mortgage" },

  // Groceries
  continente: { merchant: "Continente", category: "Groceries" },
  pingo: { merchant: "Pingo Doce", category: "Groceries" },
  lidl: { merchant: "Lidl", category: "Groceries" },
  aldi: { merchant: "Aldi", category: "Groceries" },
  mercadona: { merchant: "Mercadona", category: "Groceries" },
  mercado: { merchant: "Mercado", category: "Groceries" },
  supermercado: { merchant: "Supermercado", category: "Groceries" },

  // Health
  farmacia: { merchant: "Farmácia", category: "Medical & Pharmacy" },
  medico: { merchant: "Médico", category: "Medical & Pharmacy" },
  hospital: { merchant: "Hospital", category: "Medical & Pharmacy" },
  dentista: { merchant: "Dentista", category: "Medical & Pharmacy" },
  consulta: { merchant: "Consulta Médica", category: "Medical & Pharmacy" },
  consultas: { merchant: "Consultas", category: "Medical & Pharmacy" },
  clinica: { merchant: "Clínica", category: "Medical & Pharmacy" },
  oftalmologista: { merchant: "Oftalmologista", category: "Medical & Pharmacy" },
  dermatologista: { merchant: "Dermatologista", category: "Medical & Pharmacy" },
  fisioterapia: { merchant: "Fisioterapia", category: "Medical & Pharmacy" },
  pediatra: { merchant: "Pediatra", category: "Medical & Pharmacy" },
  psicologo: { merchant: "Psicólogo", category: "Medical & Pharmacy" },
  psiquiatra: { merchant: "Psiquiatra", category: "Medical & Pharmacy" },
  veterinario: { merchant: "Veterinário", category: "Medical & Pharmacy" },
  analises: { merchant: "Análises", category: "Medical & Pharmacy" },
  ecografia: { merchant: "Ecografia", category: "Medical & Pharmacy" },
  urgencias: { merchant: "Urgências", category: "Medical & Pharmacy" },
  ginecologista: { merchant: "Ginecologista", category: "Medical & Pharmacy" },
  radiologia: { merchant: "Radiologia", category: "Medical & Pharmacy" },
  exame: { merchant: "Exame Médico", category: "Medical & Pharmacy" },
};

/**
 * Level 1 Parser: Local keyword matching
 * Returns parsed expense data or null if no match found
 */
export function parseWithKeywords(input: string): ParsedExpense | null {
  const normalizedInput = input.toLowerCase().trim();

  // Try to extract amount from input (e.g., "mcd 12.50" or "12.50 mcd")
  const amountMatch = normalizedInput.match(/(\d+[.,]?\d*)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(",", ".")) : 0;

  // Remove numbers and clean the text for keyword matching
  const textOnly = normalizedInput.replace(/[\d.,€$]/g, "").trim();

  // Find matching keyword
  for (const [keyword, mapping] of Object.entries(KEYWORD_MAP)) {
    if (textOnly.includes(keyword)) {
      return {
        name: mapping.merchant,
        amount,
        category: mapping.category,
        merchant: mapping.merchant,
      };
    }
  }

  // No keyword match - return with original name
  return {
    name: textOnly || input,
    amount,
    category: null,
    merchant: null,
  };
}

/**
 * Parse quick-add input format: "name amount [account]"
 * Examples: "Lunch 15.50", "mcd 12€ millennium", "uber 8.50 account-a"
 */
export function parseQuickAdd(input: string): {
  name: string;
  amount: number;
  category: string | null;
  merchant: string | null;
  accountHint: string | null;
} {
  const parts = input.trim().split(/\s+/);

  let amount = 0;
  let accountHint: string | null = null;
  const nameParts: string[] = [];

  for (const part of parts) {
    // Check if it's an amount (number with optional currency symbol)
    const amountMatch = part.match(/^[\d.,]+[€$]?$|^[€$]?[\d.,]+$/);
    if (amountMatch) {
      amount = parseFloat(part.replace(/[€$,]/g, "").replace(",", "."));
    } else if (part.toLowerCase().startsWith("account-") || part.toLowerCase().includes("millennium") || part.toLowerCase().includes("caixa")) {
      // Account hint
      accountHint = part;
    } else {
      nameParts.push(part);
    }
  }

  const nameInput = nameParts.join(" ");
  const parsed = parseWithKeywords(nameInput);

  return {
    name: parsed?.name || nameInput,
    amount: amount || parsed?.amount || 0,
    category: parsed?.category || null,
    merchant: parsed?.merchant || null,
    accountHint,
  };
}
