// Smart Parsing Pipeline for Amigo
// Level 1: Local keyword mapping
// Level 2: LLM (future - opt-in)

export type ParsedExpense = {
  name: string;
  amount: number;
  category: string | null;
  merchant: string | null;
};

// Hardcoded keyword mappings for Level 1 parsing
export const KEYWORD_MAP: Record<string, { merchant: string; category: string }> = {
  // Dining
  mcd: { merchant: "McDonald's", category: "Dining" },
  mcdonalds: { merchant: "McDonald's", category: "Dining" },
  burger: { merchant: "Burger King", category: "Dining" },
  kfc: { merchant: "KFC", category: "Dining" },
  subway: { merchant: "Subway", category: "Dining" },
  pizza: { merchant: "Pizza", category: "Dining" },
  starbucks: { merchant: "Starbucks", category: "Dining" },
  cafe: { merchant: "Café", category: "Dining" },
  restaurante: { merchant: "Restaurante", category: "Dining" },
  almoco: { merchant: "Almoço", category: "Dining" },
  jantar: { merchant: "Jantar", category: "Dining" },

  // Transport
  uber: { merchant: "Uber", category: "Transport" },
  bolt: { merchant: "Bolt", category: "Transport" },
  taxi: { merchant: "Taxi", category: "Transport" },
  gasolina: { merchant: "Gasolina", category: "Transport" },
  combustivel: { merchant: "Combustível", category: "Transport" },
  metro: { merchant: "Metro", category: "Transport" },
  comboio: { merchant: "Comboio", category: "Transport" },

  // Subscriptions
  spotify: { merchant: "Spotify", category: "Subscriptions" },
  netflix: { merchant: "Netflix", category: "Subscriptions" },
  youtube: { merchant: "YouTube Premium", category: "Subscriptions" },
  hbo: { merchant: "HBO Max", category: "Subscriptions" },
  disney: { merchant: "Disney+", category: "Subscriptions" },
  amazon: { merchant: "Amazon Prime", category: "Subscriptions" },

  // Utilities
  luz: { merchant: "Eletricidade", category: "Utilities" },
  agua: { merchant: "Água", category: "Utilities" },
  gas: { merchant: "Gás", category: "Utilities" },
  internet: { merchant: "Internet", category: "Utilities" },
  telefone: { merchant: "Telefone", category: "Utilities" },
  telemovel: { merchant: "Telemóvel", category: "Utilities" },

  // Housing
  renda: { merchant: "Renda", category: "Housing" },
  aluguer: { merchant: "Aluguer", category: "Housing" },
  condominio: { merchant: "Condomínio", category: "Housing" },

  // Shopping
  continente: { merchant: "Continente", category: "Groceries" },
  pingo: { merchant: "Pingo Doce", category: "Groceries" },
  lidl: { merchant: "Lidl", category: "Groceries" },
  aldi: { merchant: "Aldi", category: "Groceries" },
  mercado: { merchant: "Mercado", category: "Groceries" },
  supermercado: { merchant: "Supermercado", category: "Groceries" },

  // Health
  farmacia: { merchant: "Farmácia", category: "Health" },
  medico: { merchant: "Médico", category: "Health" },
  hospital: { merchant: "Hospital", category: "Health" },
  dentista: { merchant: "Dentista", category: "Health" },
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
