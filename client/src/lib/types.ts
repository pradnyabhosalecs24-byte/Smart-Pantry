export type ItemStatus = "EXPIRED" | "EXPIRING" | "SAFE" | "NO_DATE" | "NO_EXPIRY" | "OUT_OF_STOCK";
export type BatchStatus = Exclude<ItemStatus, "OUT_OF_STOCK">;

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Batch {
  id: string;
  quantity: number;
  initialQuantity: number;
  purchaseDate: string | null;
  expiryDate: string | null;
  openedAt: string | null;
  effectiveExpiry: string | null;
  expiryReason: "PRINTED" | "OPENED" | null;
  status: BatchStatus;
  daysLeft: number | null;
  cost: number | null;
  createdAt: string;
}

export interface Item {
  id: string;
  name: string;
  brand: string | null;
  unit: string;
  quantity: number;
  minStock: number;
  lowStock: boolean;
  status: ItemStatus;
  daysLeft: number | null;
  nextExpiry: string | null;
  nextStart: string | null;
  purchaseDate: string | null;
  noExpiry: boolean;
  openedShelfLifeDays: number | null;
  effectiveOpenedShelfLifeDays: number | null;
  category: { id: string; name: string };
  location: { id: string; name: string };
  barcode: string | null;
  notes: string | null;
  imageId: string | null;
  isDemo: boolean;
  version: number;
  stockValue: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  batches: Batch[];
}

export interface CompactItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
  status: ItemStatus;
  daysLeft: number | null;
  nextExpiry: string | null;
  nextStart: string | null;
  lowStock: boolean;
  category: string;
  location: string;
  imageId: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  openedShelfLifeDays: number | null;
  itemCount: number;
}

export interface Location {
  id: string;
  name: string;
  itemCount: number;
}

export interface Activity {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  message: string;
  /** Household member who made the change, when it wasn't the owner */
  actorName: string | null;
  createdAt: string;
}

export interface Prediction {
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  dailyRate: number;
  daysLeft: number;
  runOutDate: string;
  basedOnDays: number;
  eventCount: number;
  confidence: "low" | "medium" | "high";
}

export interface Dashboard {
  today: string;
  warningDays: number;
  currency: string;
  counts: { total: number; safe: number; expiring: number; expired: number; noDate: number; noExpiry: number; outOfStock: number; lowStock: number };
  statusBreakdown: { status: ItemStatus; label: string; count: number }[];
  categoryBreakdown: { category: string; items: number; inStock: number; lowStock: number; value: number; valueKnown: boolean }[];
  expiringSoon: CompactItem[];
  lowStock: CompactItem[];
  recentItems: CompactItem[];
  recentActivity: Activity[];
  predictions: Prediction[];
  waste30: { events: number; estimatedCost: number; withoutPrice: number };
  stockValue: number;
  unreadNotifications: number;
  hasDemoData: boolean;
}

export interface ShoppingEntry {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  itemId: string | null;
  note: string | null;
  status: "PENDING" | "PURCHASED";
  purchasedAt: string | null;
  addedToPantry: boolean;
  createdAt: string;
}

export interface UsageEvent {
  id: string;
  itemId: string | null;
  itemName: string;
  categoryName: string;
  type: "CONSUMED" | "WASTED";
  quantity: number;
  unit: string;
  reason: string | null;
  estimatedCost: number | null;
  note: string | null;
  isDemo: boolean;
  occurredAt: string;
}

export interface Notification {
  id: string;
  type: "EXPIRING" | "EXPIRED" | "LOW_STOCK" | "RUNNING_OUT";
  title: string;
  message: string;
  itemId: string | null;
  readAt: string | null;
  emailStatus: string;
  createdAt: string;
}

export interface Settings {
  warningDays: number;
  timezone: string;
  currency: string;
  notifyExpiring: boolean;
  notifyLowStock: boolean;
  notifyRunOut: boolean;
  emailReminders: boolean;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items?: T[];
}

export type CookAction = "wash" | "chop" | "grate" | "boil" | "fry" | "temper" | "simmer" | "mix" | "mash" | "knead" | "roll" | "bake" | "blend" | "soak" | "steam" | "rest" | "serve";

export interface RecipeSummary {
  id: string;
  source: "library";
  name: string;
  cuisine: string;
  course: string;
  diet: "Veg" | "Egg" | "Vegan";
  minutes: number;
  servings: number;
  ingredientCount: number;
  stepCount: number;
  signature: CookAction;
}

export interface OnlineSummary {
  id: string;
  source: "themealdb";
  name: string;
  image: string;
}

export interface PantryMatch {
  itemId: string;
  itemName: string;
  available: number;
  unit: string;
  status: ItemStatus;
  daysLeft?: number | null;
  needed?: number | null;
  enough?: boolean | null;
}

export interface LibraryRecipeDetail {
  recipe: RecipeSummary & {
    video: string;
    steps: { text: string; action: CookAction; minutes?: number; uses: { name: string; qty: number | null; unit: string }[] }[];
  };
  servings: number;
  ingredients: { name: string; qty: number | null; unit: string; optional: boolean; pantry: PantryMatch | null }[];
}

export interface OnlineRecipeDetail {
  recipe: {
    id: string;
    source: "themealdb";
    name: string;
    category: string | null;
    cuisine: string | null;
    image: string | null;
    youtubeId: string | null;
    sourceUrl: string | null;
    steps: { text: string; action: CookAction; minutes?: number }[];
  };
  ingredients: { name: string; measure: string; pantry: PantryMatch | null }[];
}

export interface RecipeSuggestion {
  recipe: { id: string; name: string; cuisine: string; minutes: number; servings: number; ingredients: { name: string; optional?: boolean }[]; steps: { text: string; action: CookAction }[] };
  matched: { ingredient: string; itemId: string; itemName: string; status: ItemStatus; daysLeft: number | null }[];
  missing: string[];
  urgentCount: number;
  score: number;
}

export interface Analytics {
  range: { from: string; to: string; days: number };
  currency: string;
  summary: {
    consumedEvents: number;
    wastedEvents: number;
    wasteRate: number;
    wastedEstimatedCost: number;
    wastedWithoutPrice: number;
    wastedByUnit: { unit: string; quantity: number }[];
    purchaseCost: number;
    purchasesWithoutPrice: number;
    lowStockItems: number;
    stockValue: number;
  };
  monthly: { month: string; consumed: number; wasted: number; wastedCost: number; purchaseCost: number }[];
  trend: { week: string; added: number; consumed: number; wasted: number }[];
  topWasted: { name: string; count: number; quantity: number; unit: string; estimatedCost: number; costKnown: boolean }[];
  topConsumed: { name: string; count: number; quantity: number; unit: string; estimatedCost: number; costKnown: boolean }[];
  wasteReasons: { reason: string; count: number }[];
  statusBreakdown: { status: ItemStatus; label: string; count: number }[];
  categoryBreakdown: Dashboard["categoryBreakdown"];
}
