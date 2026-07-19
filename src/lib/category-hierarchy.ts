// Default category tree — data only, no server imports.
// Split out of default-categories.ts so client components (e.g. merchant
// avatars) can read the icon/translation table without pulling in Prisma.

type SupportedLanguage = "en" | "pt-PT" | "fr-FR";

type SubcategoryDef = {
  key: string;
  icon: string;
  translations: Record<SupportedLanguage, string>;
};

type ParentCategoryDef = {
  key: string;
  icon: string;
  color: string;
  translations: Record<SupportedLanguage, string>;
  children: SubcategoryDef[];
};

// Hierarchical default categories with translations
const DEFAULT_CATEGORY_HIERARCHY: ParentCategoryDef[] = [
  {
    key: "food_dining",
    icon: "🍽️",
    color: "#f59e0b",
    translations: { en: "Food & Dining", "pt-PT": "Alimentação & Restauração", "fr-FR": "Alimentation & Restaurants" },
    children: [
      { key: "groceries", icon: "🛒", translations: { en: "Groceries", "pt-PT": "Mercearia", "fr-FR": "Courses" } },
      { key: "restaurants", icon: "🍽️", translations: { en: "Restaurants & Dining Out", "pt-PT": "Restaurantes", "fr-FR": "Restaurants" } },
      { key: "fast_food", icon: "🍔", translations: { en: "Fast Food & Takeaway", "pt-PT": "Fast Food & Takeaway", "fr-FR": "Restauration Rapide" } },
      { key: "coffee_snacks_breakfast", icon: "☕", translations: { en: "Coffee, Snacks & Breakfast", "pt-PT": "Café, Snacks & Pequeno-almoço", "fr-FR": "Café, Snacks & Petit-déjeuner" } },
    ],
  },
  {
    key: "home",
    icon: "🏠",
    color: "#6366f1",
    translations: { en: "Home", "pt-PT": "Casa", "fr-FR": "Maison" },
    children: [
      { key: "rent_mortgage", icon: "🏠", translations: { en: "Rent / Mortgage", "pt-PT": "Renda / Hipoteca", "fr-FR": "Loyer / Hypothèque" } },
      { key: "furniture_appliances", icon: "🛋️", translations: { en: "Furniture & Appliances", "pt-PT": "Mobília & Eletrodomésticos", "fr-FR": "Meubles & Électroménager" } },
      { key: "renovation", icon: "🔨", translations: { en: "Renovation", "pt-PT": "Obras", "fr-FR": "Rénovation" } },
      { key: "materials_supplies", icon: "🧱", translations: { en: "Materials & Supplies", "pt-PT": "Materiais", "fr-FR": "Matériaux" } },
      { key: "maintenance_repairs", icon: "🔧", translations: { en: "Maintenance & Repairs", "pt-PT": "Manutenção & Reparações", "fr-FR": "Entretien & Réparations" } },
    ],
  },
  {
    key: "transport",
    icon: "🚗",
    color: "#10b981",
    translations: { en: "Transport", "pt-PT": "Transporte", "fr-FR": "Transport" },
    children: [
      { key: "car", icon: "🚗", translations: { en: "Car", "pt-PT": "Carro", "fr-FR": "Voiture" } },
      { key: "public_transport", icon: "🚌", translations: { en: "Public Transport", "pt-PT": "Transporte Público", "fr-FR": "Transport en Commun" } },
      { key: "taxi_ridesharing", icon: "🚕", translations: { en: "Taxi / Ride-sharing", "pt-PT": "Táxi / TVDE", "fr-FR": "Taxi / VTC" } },
      { key: "tolls_parking", icon: "🅿️", translations: { en: "Tolls & Parking", "pt-PT": "Portagens & Estacionamento", "fr-FR": "Péages & Stationnement" } },
    ],
  },
  {
    key: "health_wellness",
    icon: "💪",
    color: "#ef4444",
    translations: { en: "Health & Wellness", "pt-PT": "Saúde & Bem-estar", "fr-FR": "Santé & Bien-être" },
    children: [
      { key: "medical_pharmacy", icon: "💊", translations: { en: "Medical & Pharmacy", "pt-PT": "Médico & Farmácia", "fr-FR": "Médecin & Pharmacie" } },
      { key: "fitness_sports", icon: "🏃", translations: { en: "Fitness & Sports", "pt-PT": "Fitness & Desporto", "fr-FR": "Fitness & Sport" } },
      { key: "personal_care", icon: "💇", translations: { en: "Personal Care", "pt-PT": "Cuidados Pessoais", "fr-FR": "Soins Personnels" } },
    ],
  },
  {
    key: "shopping",
    icon: "🛍️",
    color: "#ec4899",
    translations: { en: "Shopping", "pt-PT": "Compras", "fr-FR": "Shopping" },
    children: [
      { key: "clothing_beauty", icon: "👗", translations: { en: "Clothing & Beauty", "pt-PT": "Roupa & Beleza", "fr-FR": "Vêtements & Beauté" } },
      { key: "electronics_tech", icon: "💻", translations: { en: "Electronics & Tech", "pt-PT": "Eletrónica & Tecnologia", "fr-FR": "Électronique & Tech" } },
      { key: "general_shopping", icon: "🛍️", translations: { en: "General Shopping", "pt-PT": "Compras Gerais", "fr-FR": "Achats Divers" } },
    ],
  },
  {
    key: "entertainment",
    icon: "🎭",
    color: "#8b5cf6",
    translations: { en: "Entertainment", "pt-PT": "Entretenimento", "fr-FR": "Divertissement" },
    children: [
      { key: "hobbies", icon: "🎨", translations: { en: "Hobbies", "pt-PT": "Hobbies", "fr-FR": "Loisirs" } },
      { key: "events_outings", icon: "🎬", translations: { en: "Events & Outings", "pt-PT": "Eventos & Saídas", "fr-FR": "Événements & Sorties" } },
      { key: "travel_vacation", icon: "✈️", translations: { en: "Travel & Vacation", "pt-PT": "Viagens & Férias", "fr-FR": "Voyages & Vacances" } },
    ],
  },
  {
    key: "bills_subscriptions",
    icon: "📱",
    color: "#06b6d4",
    translations: { en: "Bills & Subscriptions", "pt-PT": "Contas & Subscrições", "fr-FR": "Factures & Abonnements" },
    children: [
      { key: "utilities", icon: "💡", translations: { en: "Utilities", "pt-PT": "Serviços", "fr-FR": "Services" } },
      { key: "internet_phone", icon: "📱", translations: { en: "Internet & Phone", "pt-PT": "Internet & Telefone", "fr-FR": "Internet & Téléphone" } },
      { key: "subscriptions", icon: "📺", translations: { en: "Subscriptions", "pt-PT": "Subscrições", "fr-FR": "Abonnements" } },
    ],
  },
  {
    key: "finance_taxes",
    icon: "💰",
    color: "#0070f3",
    translations: { en: "Finance & Taxes", "pt-PT": "Finanças & Impostos", "fr-FR": "Finances & Impôts" },
    children: [
      { key: "taxes", icon: "🏛️", translations: { en: "Taxes", "pt-PT": "Impostos", "fr-FR": "Impôts" } },
      { key: "accounting", icon: "📊", translations: { en: "Accounting", "pt-PT": "Contabilidade", "fr-FR": "Comptabilité" } },
      { key: "insurance", icon: "🛡️", translations: { en: "Insurance", "pt-PT": "Seguros", "fr-FR": "Assurance" } },
      { key: "bank_fees", icon: "🏦", translations: { en: "Bank Fees", "pt-PT": "Taxas Bancárias", "fr-FR": "Frais Bancaires" } },
    ],
  },
  {
    key: "education",
    icon: "🎓",
    color: "#f97316",
    translations: { en: "Education", "pt-PT": "Educação", "fr-FR": "Éducation" },
    children: [
      { key: "courses_training", icon: "📚", translations: { en: "Courses & Training", "pt-PT": "Cursos & Formação", "fr-FR": "Cours & Formation" } },
      { key: "books_materials", icon: "📖", translations: { en: "Books & Materials", "pt-PT": "Livros & Materiais", "fr-FR": "Livres & Matériel" } },
    ],
  },
  {
    key: "gifts_donations",
    icon: "🎁",
    color: "#d946ef",
    translations: { en: "Gifts & Donations", "pt-PT": "Presentes & Doações", "fr-FR": "Cadeaux & Dons" },
    children: [],
  },
  {
    key: "other",
    icon: "❓",
    color: "#64748b",
    translations: { en: "Other", "pt-PT": "Outros", "fr-FR": "Autre" },
    children: [],
  },
];


// Map old flat default category names (all languages) to new subcategory keys
// Used during migration to adopt existing categories under parents
const LEGACY_CATEGORY_MIGRATION: Record<string, string> = {
  // English defaults
  "Groceries": "groceries",
  "Dining": "restaurants",
  "Transport": "car",
  "Health": "medical_pharmacy",
  "Insurance": "insurance",
  "Utilities": "utilities",
  "Entertainment": "hobbies",
  "Shopping": "general_shopping",
  "Subscriptions": "subscriptions",
  "Education": "courses_training",
  "Travel": "travel_vacation",
  "Personal Care": "personal_care",
  "Gifts": "gifts_donations",
  "Pets": "other",
  "Rent": "rent_mortgage",
  "Miscellaneous": "other",
  "Leisure": "events_outings",
  "Photography": "hobbies",
  "Musical Instruments": "hobbies",
  "Technology": "electronics_tech",
  "Telecommunications": "internet_phone",
  // Portuguese defaults
  "Mercearia": "groceries",
  "Restaurantes": "restaurants",
  "Transporte": "car",
  "Saúde": "medical_pharmacy",
  "Seguros": "insurance",
  "Serviços": "utilities",
  "Entretenimento": "hobbies",
  "Compras": "general_shopping",
  "Subscrições": "subscriptions",
  "Subscrição": "subscriptions",
  "Educação": "courses_training",
  "Viagens": "travel_vacation",
  "Cuidados Pessoais": "personal_care",
  "Presentes": "gifts_donations",
  "Animais": "other",
  "Renda": "rent_mortgage",
  // Portuguese custom categories
  "Comida": "restaurants",
  "Desporto": "fitness_sports",
  "Electrodomésticos": "furniture_appliances",
  "Eletrodomésticos": "furniture_appliances",
  "Fotografia": "hobbies",
  "Instrumentos Musicais": "hobbies",
  "Tecnologia": "electronics_tech",
  "Telecomunicações": "internet_phone",
  "Utilitários": "utilities",
  "Roupa / Beauty": "clothing_beauty",
  "Roupa": "clothing_beauty",
  "Roupa & Beleza": "clothing_beauty",
  // French defaults
  "Courses": "groceries",
  "Restaurants": "restaurants",
  "Santé": "medical_pharmacy",
  "Assurance": "insurance",
  "Services": "utilities",
  "Divertissement": "hobbies",
  "Abonnements": "subscriptions",
  "Éducation": "courses_training",
  "Voyages": "travel_vacation",
  "Soins Personnels": "personal_care",
  "Cadeaux": "gifts_donations",
  "Animaux": "other",
  "Loyer": "rent_mortgage",
  // Tolls & Parking (all languages)
  "Tolls": "tolls_parking",
  "Parking": "tolls_parking",
  "Tolls & Parking": "tolls_parking",
  "Portagens": "tolls_parking",
  "Estacionamento": "tolls_parking",
  "Portagens & Estacionamento": "tolls_parking",
  "Péages": "tolls_parking",
  "Péages & Stationnement": "tolls_parking",
};

export { DEFAULT_CATEGORY_HIERARCHY, LEGACY_CATEGORY_MIGRATION };
export type { ParentCategoryDef, SubcategoryDef, SupportedLanguage };
