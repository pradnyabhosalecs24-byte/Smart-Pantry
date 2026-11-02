// Turns a short sentence (typed or spoken) into Add-item fields, e.g.
//   "2 kg potatoes expiring friday"     → Potatoes, 2 kg, expiry = next Friday
//   "add half litre milk use by tomorrow" → Milk, 0.5 l, expiry = tomorrow
// Pure function so it is easy to unit-test. Anything it can't understand is simply left for the user to fill in.

export interface QuickAddResult {
  name: string;
  quantity: number | null;
  unit: string | null;
  expiryDate: string | null;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, half: 0.5, quarter: 0.25,
};

const UNIT_WORDS: [RegExp, string][] = [
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, "kg"],
  [/^(g|gm|gms|gram|grams|gramme|grammes)$/, "g"],
  [/^(l|ltr|ltrs|litre|litres|liter|liters)$/, "l"],
  [/^(ml|millilitre|millilitres|milliliter|milliliters)$/, "ml"],
  [/^(pc|pcs|piece|pieces|nos|no)$/, "pcs"],
  [/^(dozen|dozens)$/, "dozen"],
  [/^(pack|packs|packet|packets|pkt|pkts)$/, "pack"],
  [/^(bottle|bottles)$/, "bottle"],
  [/^(can|cans|tin|tins)$/, "can"],
  [/^(box|boxes)$/, "box"],
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fromIso = (s: string) => new Date(`${s}T00:00:00Z`);
const plus = (s: string, n: number) => {
  const d = fromIso(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const valid = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? iso(dt) : null;
};

/** A date written without a year means its next occurrence (today or later). */
function withYear(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4));
  const first = valid(y, m, d);
  if (first && first >= today) return first;
  return valid(y + 1, m, d);
}

export function parseDatePhrase(phrase: string, today: string): string | null {
  const p = phrase.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  if (!p) return null;
  if (p === "today") return today;
  if (p === "tomorrow" || p === "tmrw") return plus(today, 1);
  if (p === "day after tomorrow") return plus(today, 2);
  if (p === "next week") return plus(today, 7);
  const rel = p.match(/^in (\d+|a|an|one|two|three|four|five|six|seven|ten) (day|days|week|weeks|month|months)$/);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : NUMBER_WORDS[rel[1]];
    if (rel[2].startsWith("day")) return plus(today, n);
    if (rel[2].startsWith("week")) return plus(today, n * 7);
    const d = fromIso(today);
    d.setUTCMonth(d.getUTCMonth() + n);
    return iso(d);
  }
  const wd = WEEKDAYS.findIndex((w) => p === w || p === `next ${w}` || p === `this ${w}` || p === w.slice(0, 3));
  if (wd >= 0) {
    const cur = fromIso(today).getUTCDay();
    const diff = (wd - cur + 7) % 7 || 7; // "friday" said on a Friday means next week's Friday
    return plus(today, diff);
  }
  let m = p.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = p.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/); // day first, as written in India
  if (m) {
    if (!m[3]) return withYear(today, +m[2], +m[1]);
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  m = p.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/) ?? p.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/);
  if (m) {
    const [day, mon] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    const mi = MONTHS.findIndex((x) => mon.startsWith(x));
    if (mi < 0) return null;
    return m[3] ? valid(+m[3], mi + 1, day) : withYear(today, mi + 1, day);
  }
  return null;
}

const EXPIRY_LEAD = /\b(?:expir(?:es|ing|y|e)?|exp|best before|use by|good till|good until|valid till)\b(?: date)?(?: (?:on|by|at|is))?/;
const FILLER = /\b(please|add|added|adding|i bought|bought|got|of|some|the|to (?:my )?pantry|and)\b/g;

export function parseQuickAdd(text: string, today: string): QuickAddResult {
  let t = ` ${text.toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ")} `;
  let expiryDate: string | null = null;

  // Expiry: everything after "expiring", "use by", "best before"…
  const lead = t.match(EXPIRY_LEAD);
  if (lead && lead.index != null) {
    const rest = t.slice(lead.index + lead[0].length);
    // Try the longest phrase first: "5 november 2026", then "5 november", then "5"
    const words = rest.trim().split(" ");
    for (let n = Math.min(words.length, 4); n > 0 && !expiryDate; n--) {
      expiryDate = parseDatePhrase(words.slice(0, n).join(" "), today);
      if (expiryDate) t = t.slice(0, lead.index) + " " + words.slice(n).join(" ");
    }
    if (!expiryDate) t = t.slice(0, lead.index) + " " + rest;
  }

  // Quantity and unit: "2 kg", "2kg", "half litre", "a dozen", "500 grams"
  let quantity: number | null = null;
  let unit: string | null = null;
  const tokens = t.replace(/(\d)([a-z])/g, "$1 $2").trim().split(" ");
  const keep: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const num: number | null = /^\d+(\.\d+)?$/.test(w) ? Number(w) : quantity == null && w in NUMBER_WORDS && w !== "a" && w !== "an" ? NUMBER_WORDS[w] : null;
    const nextUnit = tokens[i + 1] ? UNIT_WORDS.find(([re]) => re.test(tokens[i + 1]))?.[1] : undefined;
    if ((w === "a" || w === "an") && nextUnit && quantity == null) {
      quantity = 1;
      unit = nextUnit;
      i++;
      continue;
    }
    if (num != null && quantity == null) {
      quantity = num;
      if (nextUnit) {
        unit = nextUnit;
        i++;
      }
      continue;
    }
    const u = UNIT_WORDS.find(([re]) => re.test(w))?.[1];
    if (u && quantity != null && !unit) {
      unit = u;
      continue;
    }
    keep.push(w);
  }

  const name = keep
    .join(" ")
    .replace(FILLER, " ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // "6 eggs" has no unit word: it's a count
  if (quantity != null && !unit) unit = "pcs";
  return { name, quantity, unit, expiryDate };
}

/** Suggests a default category and storage place from the item name (the user can change both). */
const GUESSES: [RegExp, string, string][] = [
  [/milk|curd|dahi|paneer|cheese|butter|ghee|yog(h)?urt|cream/, "Dairy", "Refrigerator"],
  [/frozen|ice cream|peas/, "Frozen Foods", "Freezer"],
  [/bread|bun|pav|cake|rusk/, "Bakery", "Kitchen Cabinet"],
  [/rice|atta|flour|maida|dal|lentil|wheat|oats|poha|rava|sooji|millet|ragi|pasta/, "Grains & Cereals", "Pantry Shelf"],
  [/juice|tea|coffee|soda|drink/, "Beverages", "Pantry Shelf"],
  [/salt|sugar|turmeric|masala|chilli powder|pepper|jeera|cumin|mustard|oil|sauce|ketchup|pickle|jam|honey/, "Spices & Condiments", "Kitchen Cabinet"],
  [/chips|biscuit|cookie|namkeen|snack|chocolate/, "Snacks", "Kitchen Cabinet"],
  [/beans|corn|tuna|canned|tin/, "Canned Foods", "Pantry Shelf"],
  [/potato|aloo|onion|tomato|banana|apple|orange|mango|grape|spinach|palak|carrot|cabbage|cauliflower|gobi|capsicum|cucumber|lemon|ginger|garlic|chilli|coriander|mint|brinjal|okra|bhindi|fruit|veg/, "Fruits & Vegetables", "Refrigerator"],
];

export function guessPlacement(name: string): { category: string; location: string } | null {
  const n = name.toLowerCase();
  const hit = GUESSES.find(([re]) => re.test(n));
  return hit ? { category: hit[1], location: hit[2] } : null;
}
