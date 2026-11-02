// Built-in recipe library (works offline). Every recipe has quantities for its base servings,
// and every step has an "action" that the app animates in the cook-along player.
// Matching to the pantry is rule-based (keywords in item names), so ingredients are never invented.

export type CookAction =
  | "wash"
  | "chop"
  | "grate"
  | "boil"
  | "fry"
  | "temper"
  | "simmer"
  | "mix"
  | "mash"
  | "knead"
  | "roll"
  | "bake"
  | "blend"
  | "soak"
  | "steam"
  | "rest"
  | "serve";

export const COOK_ACTIONS: CookAction[] = ["wash", "chop", "grate", "boil", "fry", "temper", "simmer", "mix", "mash", "knead", "roll", "bake", "blend", "soak", "steam", "rest", "serve"];

export interface RecipeIngredient {
  name: string;
  keywords: string[];
  /** quantity for the recipe's base servings; null = "to taste" */
  qty: number | null;
  unit: string; // g, kg, ml, l, pcs, tsp, tbsp, cup, pinch
  optional?: boolean;
}

export interface RecipeStep {
  text: string;
  action: CookAction;
  minutes?: number;
  /** ingredient names used in this step (shown with scaled amounts) */
  uses?: string[];
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  course: "Breakfast" | "Main" | "Side" | "Snack" | "Dessert" | "Drink" | "Soup";
  diet: "Veg" | "Egg" | "Vegan";
  minutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** phrase used for the "Watch on YouTube" search link */
  video: string;
}

const i = (name: string, keywords: string[], qty: number | null, unit: string, optional = false): RecipeIngredient => ({ name, keywords, qty, unit, optional });
const s = (text: string, action: CookAction, minutes?: number, uses?: string[]): RecipeStep => ({ text, action, minutes, uses });

// Common ingredients, reused across recipes
const potato = (g: number) => i("Potatoes", ["potato", "aloo", "batata"], g, "g");
const onion = (pcs: number, opt = false) => i("Onion", ["onion", "pyaz", "kanda"], pcs, "pcs", opt);
const tomato = (pcs: number, opt = false) => i("Tomato", ["tomato", "tamatar"], pcs, "pcs", opt);
const oil = (tbsp: number) => i("Cooking oil", ["oil"], tbsp, "tbsp", true);
const ghee = (tbsp: number, opt = true) => i("Ghee", ["ghee"], tbsp, "tbsp", opt);
const chilli = (pcs: number) => i("Green chilli", ["chilli", "chili"], pcs, "pcs", true);
const coriander = () => i("Coriander leaves", ["coriander", "cilantro", "dhania"], 2, "tbsp", true);
const salt = () => i("Salt", ["salt"], null, "tsp", true);
const turmeric = () => i("Turmeric powder", ["turmeric", "haldi"], 0.25, "tsp", true);
const cumin = (tsp = 1) => i("Cumin seeds", ["cumin", "jeera"], tsp, "tsp", true);
const mustard = () => i("Mustard seeds", ["mustard", "rai"], 0.5, "tsp", true);
const curryLeaves = () => i("Curry leaves", ["curry leaves", "curry leaf"], 8, "pcs", true);
const milk = (ml: number, opt = false) => i("Milk", ["milk", "doodh"], ml, "ml", opt);
const rice = (g: number) => i("Rice", ["rice", "basmati", "chawal"], g, "g");
const egg = (pcs: number) => i("Eggs", ["egg", "anda"], pcs, "pcs");
const bread = (pcs: number) => i("Bread slices", ["bread"], pcs, "pcs");
const curd = (g: number, opt = false) => i("Curd", ["curd", "yogurt", "yoghurt", "dahi"], g, "g", opt);
const atta = (g: number) => i("Wheat flour (atta)", ["atta", "wheat flour", "flour"], g, "g");
const gingerGarlic = () => i("Ginger-garlic paste", ["ginger", "garlic"], 1, "tsp", true);
const garamMasala = () => i("Garam masala", ["garam masala", "masala"], 0.5, "tsp", true);
const chilliPowder = () => i("Red chilli powder", ["chilli powder", "chili powder", "red chilli"], 0.5, "tsp", true);

export const RECIPES: Recipe[] = [
  // ---------------- Potato dishes ----------------
  {
    id: "aloo-paratha", name: "Aloo Paratha", cuisine: "Punjabi", course: "Breakfast", diet: "Veg", minutes: 40, servings: 2, video: "aloo paratha recipe",
    ingredients: [atta(200), potato(250), onion(0.5, true), chilli(1), coriander(), i("Ajwain", ["ajwain", "carom"], 0.25, "tsp", true), salt(), ghee(2, false)],
    steps: [
      s("Knead the flour with a little salt and water into a soft dough. Cover it.", "knead", 5, ["Wheat flour (atta)"]),
      s("Boil the potatoes until a knife slides in easily.", "boil", 15, ["Potatoes"]),
      s("Peel and mash the potatoes with chopped chilli, coriander, onion, ajwain and salt.", "mash", 4, ["Potatoes", "Green chilli", "Coriander leaves", "Onion"]),
      s("Divide dough into balls, fill each with the potato mix, seal and roll out gently.", "roll", 6),
      s("Cook on a hot tawa, flipping once, then brush with ghee until golden spots appear.", "fry", 3, ["Ghee"]),
      s("Serve hot with curd or pickle.", "serve"),
    ],
  },
  {
    id: "jeera-aloo", name: "Jeera Aloo", cuisine: "North Indian", course: "Side", diet: "Vegan", minutes: 25, servings: 2, video: "jeera aloo recipe",
    ingredients: [potato(300), cumin(1.5), chilli(1), turmeric(), i("Amchur (dry mango powder)", ["amchur", "mango powder"], 0.5, "tsp", true), coriander(), oil(2), salt()],
    steps: [
      s("Boil the potatoes until just tender, then peel and cube them.", "boil", 12, ["Potatoes"]),
      s("Heat oil and add cumin seeds until they crackle.", "temper", 1, ["Cumin seeds", "Cooking oil"]),
      s("Add potatoes, chilli, turmeric and salt. Toss on medium heat until edges crisp.", "fry", 6, ["Potatoes", "Green chilli"]),
      s("Sprinkle amchur and coriander and toss once more.", "mix", 1, ["Amchur (dry mango powder)", "Coriander leaves"]),
      s("Serve with roti or dal-rice.", "serve"),
    ],
  },
  {
    id: "aloo-gobi", name: "Aloo Gobi", cuisine: "North Indian", course: "Main", diet: "Vegan", minutes: 35, servings: 3, video: "aloo gobi recipe",
    ingredients: [potato(250), i("Cauliflower", ["cauliflower", "gobi"], 300, "g"), onion(1), tomato(1), gingerGarlic(), turmeric(), chilliPowder(), garamMasala(), cumin(), oil(3), salt(), coriander()],
    steps: [
      s("Cut cauliflower into florets and potatoes into cubes. Rinse well.", "chop", 5, ["Cauliflower", "Potatoes"]),
      s("Heat oil, add cumin, then onion and ginger-garlic until soft.", "temper", 4, ["Cumin seeds", "Onion", "Ginger-garlic paste"]),
      s("Add tomato and spices and cook until the oil separates.", "fry", 4, ["Tomato", "Turmeric powder", "Red chilli powder"]),
      s("Add potato and cauliflower, cover and cook on low, stirring now and then.", "simmer", 15, ["Potatoes", "Cauliflower"]),
      s("Finish with garam masala and coriander.", "mix", 1, ["Garam masala", "Coriander leaves"]),
      s("Serve with chapati.", "serve"),
    ],
  },
  {
    id: "aloo-tikki", name: "Aloo Tikki", cuisine: "Indian Street", course: "Snack", diet: "Vegan", minutes: 35, servings: 3, video: "aloo tikki recipe",
    ingredients: [potato(400), i("Bread crumbs or poha", ["bread crumb", "poha", "cornflour"], 3, "tbsp", true), chilli(1), i("Peas", ["peas", "matar"], 50, "g", true), garamMasala(), coriander(), oil(3), salt()],
    steps: [
      s("Boil, peel and mash the potatoes until smooth.", "boil", 15, ["Potatoes"]),
      s("Mix in peas, chilli, coriander, garam masala, salt and crumbs.", "mix", 3, ["Peas", "Green chilli", "Coriander leaves", "Bread crumbs or poha"]),
      s("Shape into flat round patties.", "roll", 4),
      s("Shallow-fry on medium heat until crisp and golden on both sides.", "fry", 8, ["Cooking oil"]),
      s("Serve with green chutney and sweet chutney.", "serve"),
    ],
  },
  {
    id: "batata-vada", name: "Batata Vada", cuisine: "Maharashtrian", course: "Snack", diet: "Vegan", minutes: 40, servings: 3, video: "batata vada recipe",
    ingredients: [potato(350), i("Besan (gram flour)", ["besan", "gram flour"], 100, "g"), gingerGarlic(), chilli(2), mustard(), curryLeaves(), turmeric(), oil(10), salt()],
    steps: [
      s("Boil, peel and roughly mash the potatoes.", "boil", 15, ["Potatoes"]),
      s("Temper mustard seeds, curry leaves, chilli and ginger-garlic, then add turmeric.", "temper", 2, ["Mustard seeds", "Curry leaves", "Green chilli"]),
      s("Mix the tempering into the potatoes with salt and shape into balls.", "mix", 4, ["Potatoes"]),
      s("Whisk besan with salt, turmeric and water into a thick batter.", "mix", 2, ["Besan (gram flour)"]),
      s("Dip each ball in batter and deep-fry until golden.", "fry", 8, ["Cooking oil"]),
      s("Serve hot with chutney or in a pav as vada pav.", "serve"),
    ],
  },
  {
    id: "dum-aloo", name: "Dum Aloo", cuisine: "Kashmiri", course: "Main", diet: "Veg", minutes: 45, servings: 3, video: "dum aloo recipe",
    ingredients: [i("Baby potatoes", ["potato", "aloo"], 400, "g"), curd(150), onion(1), tomato(2), gingerGarlic(), chilliPowder(), garamMasala(), oil(3), salt(), coriander()],
    steps: [
      s("Boil the baby potatoes until just tender, peel and prick them with a fork.", "boil", 12, ["Baby potatoes"]),
      s("Fry the potatoes until lightly golden and set aside.", "fry", 5, ["Baby potatoes", "Cooking oil"]),
      s("Blend onion and tomato into a paste and cook it with ginger-garlic and spices.", "blend", 8, ["Onion", "Tomato", "Ginger-garlic paste"]),
      s("Lower the heat and stir in whisked curd so it doesn't split.", "mix", 2, ["Curd"]),
      s("Add potatoes, cover tightly and cook on low (dum).", "simmer", 12, ["Baby potatoes"]),
      s("Garnish with coriander and serve with rice or naan.", "serve", undefined, ["Coriander leaves"]),
    ],
  },
  {
    id: "aloo-masala", name: "Potato Masala (Dosa Filling)", cuisine: "South Indian", course: "Side", diet: "Vegan", minutes: 30, servings: 3, video: "potato masala for dosa recipe",
    ingredients: [potato(350), onion(2), chilli(2), mustard(), i("Chana dal", ["chana dal", "bengal gram"], 1, "tsp", true), curryLeaves(), turmeric(), oil(2), salt()],
    steps: [
      s("Boil, peel and lightly crush the potatoes.", "boil", 15, ["Potatoes"]),
      s("Temper mustard seeds, chana dal and curry leaves in oil.", "temper", 2, ["Mustard seeds", "Chana dal", "Curry leaves"]),
      s("Add sliced onion and chilli and cook until soft.", "fry", 5, ["Onion", "Green chilli"]),
      s("Add turmeric, salt, potatoes and a splash of water; stir together.", "mix", 3, ["Potatoes", "Turmeric powder"]),
      s("Fill into dosa or serve with puri.", "serve"),
    ],
  },
  {
    id: "potato-roast", name: "Potato Roast (Urulai Roast)", cuisine: "Tamil", course: "Side", diet: "Vegan", minutes: 30, servings: 2, video: "urulai roast recipe",
    ingredients: [potato(300), chilliPowder(), turmeric(), mustard(), curryLeaves(), oil(3), salt()],
    steps: [
      s("Peel and cut potatoes into small cubes; rinse and pat dry.", "chop", 5, ["Potatoes"]),
      s("Temper mustard seeds and curry leaves in oil.", "temper", 1, ["Mustard seeds", "Curry leaves"]),
      s("Add potatoes, turmeric and salt; cover and cook until tender.", "simmer", 10, ["Potatoes"]),
      s("Uncover, add chilli powder and roast until crisp, stirring gently.", "fry", 8, ["Red chilli powder"]),
      s("Serve with sambar rice or curd rice.", "serve"),
    ],
  },
  {
    id: "mashed-potatoes", name: "Creamy Mashed Potatoes", cuisine: "Western", course: "Side", diet: "Veg", minutes: 25, servings: 2, video: "creamy mashed potatoes recipe",
    ingredients: [potato(400), milk(80), i("Butter", ["butter"], 30, "g"), i("Garlic", ["garlic", "lahsun"], 1, "pcs", true), i("Black pepper", ["pepper"], null, "tsp", true), salt()],
    steps: [
      s("Peel and cube the potatoes, then boil in salted water until very soft.", "boil", 15, ["Potatoes"]),
      s("Warm the milk with butter and crushed garlic.", "simmer", 2, ["Milk", "Butter", "Garlic"]),
      s("Drain potatoes and mash, pouring in the warm milk gradually until smooth.", "mash", 4, ["Potatoes", "Milk"]),
      s("Season with salt and pepper.", "mix", 1),
      s("Serve warm.", "serve"),
    ],
  },
  {
    id: "potato-soup", name: "Potato Leek-style Soup", cuisine: "Western", course: "Soup", diet: "Veg", minutes: 30, servings: 3, video: "potato soup recipe easy",
    ingredients: [potato(350), onion(1), milk(200), i("Butter", ["butter"], 20, "g", true), i("Garlic", ["garlic"], 2, "pcs", true), i("Black pepper", ["pepper"], null, "tsp", true), salt()],
    steps: [
      s("Chop the onion and garlic; peel and dice the potatoes.", "chop", 5, ["Onion", "Garlic", "Potatoes"]),
      s("Soften onion and garlic in butter without browning.", "fry", 4, ["Butter", "Onion", "Garlic"]),
      s("Add potatoes and enough water to cover; simmer until soft.", "simmer", 15, ["Potatoes"]),
      s("Blend until smooth, then stir in the milk and warm through.", "blend", 3, ["Milk"]),
      s("Season and serve hot.", "serve"),
    ],
  },
  {
    id: "aloo-sabzi", name: "Aloo Sabzi", cuisine: "Indian", course: "Main", diet: "Vegan", minutes: 25, servings: 2, video: "aloo sabzi recipe",
    ingredients: [potato(300), onion(1, true), tomato(1, true), cumin(), turmeric(), chilliPowder(), oil(2), salt(), coriander()],
    steps: [
      s("Boil and cube the potatoes.", "boil", 12, ["Potatoes"]),
      s("Temper cumin in oil; add onion and tomato if using and cook soft.", "temper", 5, ["Cumin seeds", "Onion", "Tomato"]),
      s("Add potatoes with turmeric, chilli and salt; cook 5 minutes.", "fry", 5, ["Potatoes"]),
      s("Garnish with coriander and serve with puri or roti.", "serve", undefined, ["Coriander leaves"]),
    ],
  },

  // ---------------- Everyday Indian ----------------
  {
    id: "tomato-rice", name: "Tomato Rice", cuisine: "South Indian", course: "Main", diet: "Vegan", minutes: 30, servings: 2, video: "tomato rice recipe",
    ingredients: [rice(150), tomato(3), onion(1), mustard(), curryLeaves(), chilli(1), oil(2), salt()],
    steps: [
      s("Cook the rice and spread it to cool.", "boil", 15, ["Rice"]),
      s("Temper mustard seeds and curry leaves; add onion and chilli.", "temper", 3, ["Mustard seeds", "Curry leaves", "Onion"]),
      s("Add chopped tomatoes and cook until mushy.", "fry", 6, ["Tomato"]),
      s("Fold in the rice gently and warm through.", "mix", 2, ["Rice"]),
      s("Serve with raita or papad.", "serve"),
    ],
  },
  {
    id: "masala-omelette", name: "Masala Omelette", cuisine: "Indian", course: "Breakfast", diet: "Egg", minutes: 10, servings: 1, video: "masala omelette recipe",
    ingredients: [egg(2), onion(0.5), tomato(0.5, true), chilli(1), coriander(), oil(1), salt()],
    steps: [
      s("Finely chop onion, tomato, chilli and coriander.", "chop", 3, ["Onion", "Tomato", "Green chilli"]),
      s("Whisk eggs with salt and the chopped vegetables.", "mix", 1, ["Eggs"]),
      s("Pour into a hot oiled pan and cook until set, then fold.", "fry", 3, ["Cooking oil"]),
      s("Serve with toast.", "serve"),
    ],
  },
  {
    id: "egg-bhurji", name: "Egg Bhurji", cuisine: "Indian", course: "Breakfast", diet: "Egg", minutes: 15, servings: 2, video: "egg bhurji recipe",
    ingredients: [egg(4), onion(1), tomato(1), chilli(1), turmeric(), i("Pav bhaji masala", ["pav bhaji masala", "masala"], 0.5, "tsp", true), oil(1), salt(), coriander()],
    steps: [
      s("Chop the onion, tomato and chilli.", "chop", 3, ["Onion", "Tomato", "Green chilli"]),
      s("Cook onion and chilli in oil, then tomato and spices until soft.", "fry", 5, ["Onion", "Tomato"]),
      s("Pour in beaten eggs and keep scrambling until just set.", "mix", 3, ["Eggs"]),
      s("Garnish and serve with pav or roti.", "serve", undefined, ["Coriander leaves"]),
    ],
  },
  {
    id: "egg-curry", name: "Egg Curry", cuisine: "Indian", course: "Main", diet: "Egg", minutes: 30, servings: 2, video: "egg curry recipe",
    ingredients: [egg(4), onion(1), tomato(2), gingerGarlic(), chilliPowder(), garamMasala(), i("Coconut milk", ["coconut"], 100, "ml", true), oil(2), salt()],
    steps: [
      s("Hard-boil the eggs, cool and peel.", "boil", 10, ["Eggs"]),
      s("Cook onion and ginger-garlic, then tomato and spices into a thick masala.", "fry", 8, ["Onion", "Tomato", "Ginger-garlic paste"]),
      s("Add water or coconut milk and the eggs; simmer.", "simmer", 6, ["Coconut milk", "Eggs"]),
      s("Serve with rice or chapati.", "serve"),
    ],
  },
  {
    id: "dal-tadka", name: "Dal Tadka", cuisine: "Indian", course: "Main", diet: "Veg", minutes: 35, servings: 3, video: "dal tadka recipe",
    ingredients: [i("Toor dal", ["dal", "lentil", "toor", "moong", "masoor"], 150, "g"), tomato(1), onion(0.5, true), i("Garlic", ["garlic"], 3, "pcs", true), cumin(), turmeric(), ghee(1), salt()],
    steps: [
      s("Rinse and soak the dal for 15 minutes.", "soak", 15, ["Toor dal"]),
      s("Pressure-cook dal with turmeric, salt and water until soft.", "boil", 12, ["Toor dal"]),
      s("Heat ghee; add cumin, garlic, onion and tomato for the tadka.", "temper", 4, ["Ghee", "Cumin seeds", "Garlic", "Onion", "Tomato"]),
      s("Pour the tadka over the dal and simmer together.", "simmer", 3),
      s("Serve with rice or jeera rice.", "serve"),
    ],
  },
  {
    id: "chana-masala", name: "Chana Masala", cuisine: "Punjabi", course: "Main", diet: "Vegan", minutes: 40, servings: 3, video: "chana masala recipe",
    ingredients: [i("Chickpeas (chana)", ["chana", "chickpea", "kabuli"], 200, "g"), onion(1), tomato(2), gingerGarlic(), i("Chana masala powder", ["chana masala", "masala"], 1, "tsp", true), oil(2), salt(), coriander()],
    steps: [
      s("Soak chickpeas overnight, then pressure-cook until soft.", "soak", 20, ["Chickpeas (chana)"]),
      s("Fry onion and ginger-garlic until golden.", "fry", 6, ["Onion", "Ginger-garlic paste"]),
      s("Add tomatoes and chana masala and cook until thick.", "fry", 6, ["Tomato", "Chana masala powder"]),
      s("Add chickpeas with some cooking water and simmer.", "simmer", 10, ["Chickpeas (chana)"]),
      s("Garnish and serve with rice or bhature.", "serve", undefined, ["Coriander leaves"]),
    ],
  },
  {
    id: "palak-paneer", name: "Palak Paneer", cuisine: "North Indian", course: "Main", diet: "Veg", minutes: 35, servings: 3, video: "palak paneer recipe",
    ingredients: [i("Spinach", ["spinach", "palak"], 250, "g"), i("Paneer", ["paneer"], 200, "g"), onion(1), gingerGarlic(), i("Cream or milk", ["cream", "milk"], 3, "tbsp", true), garamMasala(), oil(2), salt()],
    steps: [
      s("Wash the spinach well.", "wash", 2, ["Spinach"]),
      s("Blanch spinach for 2 minutes, cool and blend to a purée.", "blend", 4, ["Spinach"]),
      s("Cook onion and ginger-garlic with spices.", "fry", 6, ["Onion", "Ginger-garlic paste"]),
      s("Add the purée and simmer, then add paneer cubes and cream.", "simmer", 6, ["Paneer", "Cream or milk"]),
      s("Serve with roti or jeera rice.", "serve"),
    ],
  },
  {
    id: "paneer-bhurji", name: "Paneer Bhurji", cuisine: "North Indian", course: "Main", diet: "Veg", minutes: 15, servings: 2, video: "paneer bhurji recipe",
    ingredients: [i("Paneer", ["paneer"], 200, "g"), onion(1), tomato(1), i("Capsicum", ["capsicum", "bell pepper"], 0.5, "pcs", true), turmeric(), garamMasala(), oil(1), salt()],
    steps: [
      s("Crumble the paneer with your fingers.", "mash", 2, ["Paneer"]),
      s("Cook onion, capsicum and tomato with spices until soft.", "fry", 6, ["Onion", "Capsicum", "Tomato"]),
      s("Stir in the paneer and cook 2–3 minutes.", "mix", 3, ["Paneer"]),
      s("Serve with paratha or in a wrap.", "serve"),
    ],
  },
  {
    id: "veg-pulao", name: "Vegetable Pulao", cuisine: "Indian", course: "Main", diet: "Vegan", minutes: 35, servings: 3, video: "veg pulao recipe",
    ingredients: [rice(200), i("Carrot", ["carrot", "gajar"], 1, "pcs"), i("Peas", ["peas", "matar"], 80, "g"), i("Beans", ["beans"], 50, "g", true), onion(1, true), i("Whole spices", ["bay leaf", "clove", "cardamom", "cinnamon"], 1, "tsp", true), ghee(1), salt()],
    steps: [
      s("Rinse and soak the rice for 20 minutes.", "soak", 20, ["Rice"]),
      s("Chop the carrot, beans and onion.", "chop", 4, ["Carrot", "Beans", "Onion"]),
      s("Fry whole spices in ghee, then the vegetables.", "fry", 4, ["Whole spices", "Carrot", "Peas"]),
      s("Add drained rice and twice its volume of water; cover and cook.", "steam", 15, ["Rice"]),
      s("Rest 5 minutes, fluff and serve with raita.", "rest", 5),
    ],
  },
  {
    id: "curd-rice", name: "Curd Rice", cuisine: "South Indian", course: "Main", diet: "Veg", minutes: 10, servings: 2, video: "curd rice recipe",
    ingredients: [i("Cooked rice", ["rice"], 250, "g"), curd(200), i("Cucumber", ["cucumber"], 0.5, "pcs", true), mustard(), curryLeaves(), salt()],
    steps: [
      s("Mash the cooled rice with curd and salt.", "mash", 2, ["Cooked rice", "Curd"]),
      s("Temper mustard seeds and curry leaves and pour over.", "temper", 1, ["Mustard seeds", "Curry leaves"]),
      s("Fold in grated cucumber.", "grate", 2, ["Cucumber"]),
      s("Serve chilled or at room temperature.", "serve"),
    ],
  },
  {
    id: "lemon-rice", name: "Lemon Rice", cuisine: "South Indian", course: "Main", diet: "Vegan", minutes: 15, servings: 2, video: "lemon rice recipe",
    ingredients: [i("Cooked rice", ["rice"], 250, "g"), i("Lemon", ["lemon", "lime"], 1, "pcs"), i("Peanuts", ["peanut", "groundnut"], 2, "tbsp", true), mustard(), curryLeaves(), turmeric(), oil(1), salt()],
    steps: [
      s("Temper mustard seeds, peanuts and curry leaves in oil.", "temper", 2, ["Mustard seeds", "Peanuts", "Curry leaves"]),
      s("Add turmeric, then the rice; mix well.", "mix", 2, ["Cooked rice"]),
      s("Turn off the heat and stir in lemon juice and salt.", "mix", 1, ["Lemon"]),
      s("Serve with papad.", "serve"),
    ],
  },
  {
    id: "poha", name: "Kanda Poha", cuisine: "Maharashtrian", course: "Breakfast", diet: "Vegan", minutes: 15, servings: 2, video: "kanda poha recipe",
    ingredients: [i("Poha", ["poha", "flattened rice"], 150, "g"), onion(1), potato(80), i("Peanuts", ["peanut"], 2, "tbsp", true), mustard(), curryLeaves(), turmeric(), i("Lemon", ["lemon"], 0.5, "pcs", true), oil(1), salt()],
    steps: [
      s("Rinse the poha in a sieve and let it drain.", "wash", 2, ["Poha"]),
      s("Temper mustard, peanuts and curry leaves; add onion and diced potato.", "temper", 6, ["Onion", "Potatoes", "Peanuts"]),
      s("Add poha with turmeric and salt and toss gently.", "mix", 3, ["Poha"]),
      s("Finish with a squeeze of lemon and serve.", "serve", undefined, ["Lemon"]),
    ],
  },
  {
    id: "rava-upma", name: "Rava Upma", cuisine: "South Indian", course: "Breakfast", diet: "Vegan", minutes: 20, servings: 2, video: "rava upma recipe",
    ingredients: [i("Rava (semolina)", ["rava", "sooji", "semolina"], 120, "g"), onion(1), chilli(1), mustard(), curryLeaves(), i("Carrot", ["carrot"], 0.5, "pcs", true), oil(2), salt()],
    steps: [
      s("Dry-roast the rava until fragrant and set aside.", "fry", 4, ["Rava (semolina)"]),
      s("Temper mustard seeds and curry leaves; add onion, chilli and carrot.", "temper", 4, ["Onion", "Green chilli", "Carrot"]),
      s("Add 2½ times water with salt and bring to a boil.", "boil", 3),
      s("Stream in the rava while stirring so no lumps form; cover for 2 minutes.", "mix", 3, ["Rava (semolina)"]),
      s("Serve with chutney.", "serve"),
    ],
  },
  {
    id: "bread-upma", name: "Bread Upma", cuisine: "South Indian", course: "Breakfast", diet: "Vegan", minutes: 15, servings: 2, video: "bread upma recipe",
    ingredients: [bread(4), onion(1), tomato(1, true), chilli(1), mustard(), curryLeaves(), turmeric(), oil(1), salt()],
    steps: [
      s("Cut the bread into small cubes.", "chop", 2, ["Bread slices"]),
      s("Temper mustard seeds; sauté onion, chilli and tomato.", "temper", 5, ["Onion", "Green chilli", "Tomato"]),
      s("Add turmeric, salt and the bread; toss until coated.", "mix", 2, ["Bread slices"]),
      s("Serve immediately.", "serve"),
    ],
  },
  {
    id: "onion-pakoda", name: "Onion Pakoda", cuisine: "Indian", course: "Snack", diet: "Vegan", minutes: 20, servings: 3, video: "onion pakoda recipe",
    ingredients: [onion(2), i("Besan (gram flour)", ["besan", "gram flour"], 100, "g"), chilli(1), chilliPowder(), i("Ajwain", ["ajwain"], 0.25, "tsp", true), oil(10), salt()],
    steps: [
      s("Slice the onions thinly.", "chop", 4, ["Onion"]),
      s("Mix onions with salt and let them release moisture.", "rest", 5, ["Onion"]),
      s("Add besan and spices, sprinkling water only if needed.", "mix", 2, ["Besan (gram flour)"]),
      s("Drop small portions into hot oil and fry until crisp.", "fry", 8, ["Cooking oil"]),
      s("Serve hot with tea.", "serve"),
    ],
  },
  {
    id: "masala-chai", name: "Masala Chai", cuisine: "Indian", course: "Drink", diet: "Veg", minutes: 8, servings: 2, video: "masala chai recipe",
    ingredients: [milk(200), i("Tea powder", ["tea"], 2, "tsp"), i("Sugar", ["sugar"], 2, "tsp", true), i("Ginger", ["ginger", "adrak"], 1, "pcs", true), i("Cardamom", ["cardamom", "elaichi"], 2, "pcs", true)],
    steps: [
      s("Boil 200 ml water with crushed ginger and cardamom.", "boil", 2, ["Ginger", "Cardamom"]),
      s("Add tea powder and simmer for a minute.", "simmer", 1, ["Tea powder"]),
      s("Add milk and sugar and bring back to a boil.", "boil", 2, ["Milk", "Sugar"]),
      s("Strain into cups and serve.", "serve"),
    ],
  },
  {
    id: "milk-kheer", name: "Rice Kheer", cuisine: "Indian Dessert", course: "Dessert", diet: "Veg", minutes: 40, servings: 3, video: "rice kheer recipe",
    ingredients: [milk(750), rice(40), i("Sugar", ["sugar", "jaggery"], 60, "g"), i("Cardamom", ["cardamom", "elaichi"], 3, "pcs", true), i("Dry fruits", ["cashew", "almond", "raisin"], 2, "tbsp", true)],
    steps: [
      s("Rinse the rice and soak for 15 minutes.", "soak", 15, ["Rice"]),
      s("Simmer rice in milk on low heat, stirring often.", "simmer", 30, ["Milk", "Rice"]),
      s("Add sugar and crushed cardamom when thick and creamy.", "mix", 2, ["Sugar", "Cardamom"]),
      s("Garnish with dry fruits; serve warm or chilled.", "serve", undefined, ["Dry fruits"]),
    ],
  },
  {
    id: "carrot-halwa", name: "Gajar Halwa", cuisine: "Indian Dessert", course: "Dessert", diet: "Veg", minutes: 45, servings: 3, video: "gajar ka halwa recipe",
    ingredients: [i("Carrot", ["carrot", "gajar"], 500, "g"), milk(400), i("Sugar", ["sugar"], 80, "g"), ghee(2, false), i("Cardamom", ["cardamom"], 3, "pcs", true)],
    steps: [
      s("Wash, peel and grate the carrots.", "grate", 8, ["Carrot"]),
      s("Cook carrots in milk until the milk is absorbed.", "simmer", 25, ["Carrot", "Milk"]),
      s("Add sugar and ghee and stir until glossy.", "fry", 8, ["Sugar", "Ghee"]),
      s("Add cardamom and serve warm.", "serve", undefined, ["Cardamom"]),
    ],
  },
  {
    id: "raita", name: "Cucumber Raita", cuisine: "Indian", course: "Side", diet: "Veg", minutes: 5, servings: 2, video: "cucumber raita recipe",
    ingredients: [curd(200), i("Cucumber", ["cucumber"], 1, "pcs"), i("Mint", ["mint", "pudina"], 1, "tbsp", true), i("Roasted cumin powder", ["cumin", "jeera"], 0.5, "tsp", true), salt()],
    steps: [
      s("Grate the cucumber and squeeze out excess water.", "grate", 3, ["Cucumber"]),
      s("Whisk curd with salt and cumin powder; fold in cucumber and mint.", "mix", 2, ["Curd", "Cucumber"]),
      s("Chill before serving.", "serve"),
    ],
  },
  {
    id: "tomato-chutney", name: "Tomato Chutney", cuisine: "South Indian", course: "Side", diet: "Vegan", minutes: 20, servings: 3, video: "tomato chutney recipe",
    ingredients: [tomato(4), onion(1), i("Garlic", ["garlic"], 3, "pcs", true), i("Dry red chilli", ["chilli"], 2, "pcs", true), mustard(), curryLeaves(), oil(2), salt()],
    steps: [
      s("Chop the tomatoes and onion.", "chop", 4, ["Tomato", "Onion"]),
      s("Fry onion, garlic and red chilli, then tomatoes until mushy.", "fry", 8, ["Onion", "Garlic", "Tomato"]),
      s("Cool and blend to a coarse paste.", "blend", 2),
      s("Pour a mustard and curry leaf tempering on top.", "temper", 1, ["Mustard seeds", "Curry leaves"]),
      s("Serve with dosa, idli or rice.", "serve"),
    ],
  },

  // ---------------- Global & quick ----------------
  {
    id: "banana-smoothie", name: "Banana Milk Smoothie", cuisine: "Global", course: "Drink", diet: "Veg", minutes: 5, servings: 2, video: "banana smoothie recipe",
    ingredients: [i("Banana", ["banana", "kela"], 2, "pcs"), milk(300), curd(60, true), i("Honey", ["honey"], 1, "tbsp", true)],
    steps: [
      s("Peel and slice the bananas.", "chop", 1, ["Banana"]),
      s("Blend bananas with cold milk, curd and honey until smooth.", "blend", 1, ["Banana", "Milk", "Curd", "Honey"]),
      s("Pour and serve immediately.", "serve"),
    ],
  },
  {
    id: "banana-pancakes", name: "Banana Pancakes", cuisine: "Global", course: "Breakfast", diet: "Egg", minutes: 15, servings: 2, video: "banana pancakes 3 ingredients",
    ingredients: [i("Banana", ["banana"], 2, "pcs"), egg(2), atta(40), milk(50, true), i("Honey", ["honey"], 1, "tbsp", true)],
    steps: [
      s("Mash the ripe bananas well.", "mash", 2, ["Banana"]),
      s("Whisk in eggs, flour and milk to a thick batter.", "mix", 2, ["Eggs", "Wheat flour (atta)", "Milk"]),
      s("Cook small pancakes on a lightly greased pan, flipping once.", "fry", 8),
      s("Serve with honey.", "serve", undefined, ["Honey"]),
    ],
  },
  {
    id: "french-toast", name: "French Toast", cuisine: "Global", course: "Breakfast", diet: "Egg", minutes: 15, servings: 2, video: "french toast recipe",
    ingredients: [bread(4), egg(2), milk(60), i("Sugar or honey", ["sugar", "honey"], 1, "tbsp", true), i("Butter", ["butter"], 15, "g", true)],
    steps: [
      s("Whisk eggs with milk and a little sugar.", "mix", 2, ["Eggs", "Milk"]),
      s("Dip each bread slice in the mixture.", "soak", 2, ["Bread slices"]),
      s("Pan-fry in butter until golden on both sides.", "fry", 6, ["Butter"]),
      s("Serve warm.", "serve"),
    ],
  },
  {
    id: "pasta-tomato", name: "Tomato Basil Pasta", cuisine: "Italian", course: "Main", diet: "Veg", minutes: 20, servings: 2, video: "tomato basil pasta recipe",
    ingredients: [i("Pasta", ["pasta", "spaghetti", "penne", "macaroni"], 200, "g"), tomato(3), i("Garlic", ["garlic"], 3, "pcs", true), i("Cheese", ["cheese", "parmesan"], 30, "g", true), oil(2), salt()],
    steps: [
      s("Boil pasta in salted water until al dente.", "boil", 10, ["Pasta"]),
      s("Cook garlic in oil, add chopped tomatoes and simmer into a sauce.", "simmer", 8, ["Garlic", "Tomato"]),
      s("Toss the pasta in the sauce.", "mix", 1, ["Pasta"]),
      s("Top with cheese and serve.", "serve", undefined, ["Cheese"]),
    ],
  },
  {
    id: "cheese-toast", name: "Chilli Cheese Toast", cuisine: "Indian Street", course: "Snack", diet: "Veg", minutes: 10, servings: 2, video: "chilli cheese toast recipe",
    ingredients: [bread(4), i("Cheese", ["cheese"], 60, "g"), i("Capsicum", ["capsicum"], 0.5, "pcs", true), chilli(1), i("Butter", ["butter"], 15, "g", true)],
    steps: [
      s("Butter the bread slices.", "mix", 1, ["Bread slices", "Butter"]),
      s("Grate cheese and top with chopped capsicum and chilli.", "grate", 3, ["Cheese", "Capsicum", "Green chilli"]),
      s("Toast on a pan or in the oven until the cheese melts.", "bake", 5),
      s("Cut and serve hot.", "serve"),
    ],
  },
  {
    id: "veg-sandwich", name: "Vegetable Sandwich", cuisine: "Global", course: "Snack", diet: "Veg", minutes: 10, servings: 2, video: "veg sandwich recipe",
    ingredients: [bread(4), i("Cucumber", ["cucumber"], 1, "pcs"), tomato(1), potato(100), i("Butter or chutney", ["butter", "chutney"], 2, "tbsp", true), salt()],
    steps: [
      s("Boil and slice the potato; slice cucumber and tomato.", "chop", 4, ["Potatoes", "Cucumber", "Tomato"]),
      s("Spread butter or chutney on the bread.", "mix", 1, ["Bread slices", "Butter or chutney"]),
      s("Layer the vegetables with salt and pepper and close.", "mix", 2),
      s("Cut and serve, or toast it.", "serve"),
    ],
  },
  {
    id: "fruit-salad", name: "Fresh Fruit Salad", cuisine: "Global", course: "Dessert", diet: "Vegan", minutes: 10, servings: 2, video: "fruit salad recipe",
    ingredients: [i("Apple", ["apple"], 1, "pcs"), i("Banana", ["banana"], 1, "pcs"), i("Orange or grapes", ["orange", "grape"], 1, "cup", true), i("Lemon", ["lemon"], 0.5, "pcs", true)],
    steps: [
      s("Wash all the fruit.", "wash", 2),
      s("Chop into bite-size pieces.", "chop", 5, ["Apple", "Banana", "Orange or grapes"]),
      s("Toss with a squeeze of lemon so it doesn't brown.", "mix", 1, ["Lemon"]),
      s("Serve plain or with chilled curd.", "serve"),
    ],
  },
  {
    id: "mixed-veg-soup", name: "Mixed Vegetable Soup", cuisine: "Global", course: "Soup", diet: "Vegan", minutes: 25, servings: 3, video: "mixed vegetable soup recipe",
    ingredients: [i("Carrot", ["carrot"], 1, "pcs"), i("Beans", ["beans"], 60, "g"), i("Cabbage", ["cabbage"], 80, "g", true), onion(1, true), tomato(1, true), i("Black pepper", ["pepper"], null, "tsp", true), salt()],
    steps: [
      s("Finely chop all the vegetables.", "chop", 6, ["Carrot", "Beans", "Cabbage", "Onion", "Tomato"]),
      s("Simmer in 750 ml water with salt until tender.", "simmer", 12),
      s("Blend half for body if you like, and season with pepper.", "blend", 2),
      s("Serve hot.", "serve"),
    ],
  },
];

// ---------------- Matching & helpers ----------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when a pantry item's name matches one of an ingredient's keywords (word start, case-insensitive). */
export function nameMatches(itemName: string, keywords: string[]): boolean {
  return keywords.some((k) => new RegExp(`(^|[^a-z])${escapeRe(k.toLowerCase())}`, "i").test(itemName.toLowerCase()));
}

/** Normalises what the user typed ("Potatoes", " aloo ") for searching. */
export function normaliseIngredient(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Recipes from the library that use the ingredient (by keyword or ingredient name). */
export function recipesWithIngredient(query: string): Recipe[] {
  const q = normaliseIngredient(query);
  if (!q) return [];
  const singular = q.replace(/(oes|es|s)$/, (m) => (m === "oes" ? "o" : ""));
  const terms = [...new Set([q, singular])].filter((t) => t.length >= 2);
  return RECIPES.filter((r) =>
    r.ingredients.some((ing) => terms.some((t) => ing.keywords.some((k) => k.startsWith(t) || t.startsWith(k)) || ing.name.toLowerCase().includes(t))),
  ).sort((a, b) => rank(b) - rank(a) || a.minutes - b.minutes);

  /** 2 = the dish is named after it (Aloo Paratha for "potato"), 1 = essential ingredient, 0 = optional. */
  function rank(r: Recipe): number {
    const hit = r.ingredients.find((ing) => terms.some((t) => ing.keywords.some((k) => k.startsWith(t) || t.startsWith(k))));
    if (!hit) return 0;
    if (hit.keywords.some((k) => nameMatches(r.name, [k])) || terms.some((t) => r.name.toLowerCase().includes(t))) return 2;
    return hit.optional ? 0 : 1;
  }
}

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

// Recipe units → base units, for converting recipe amounts into the pantry item's unit
const RECIPE_UNITS: Record<string, { group: string; factor: number }> = {
  g: { group: "mass", factor: 1 },
  kg: { group: "mass", factor: 1000 },
  ml: { group: "volume", factor: 1 },
  l: { group: "volume", factor: 1000 },
  tsp: { group: "volume", factor: 5 },
  tbsp: { group: "volume", factor: 15 },
  cup: { group: "volume", factor: 240 },
  pcs: { group: "count", factor: 1 },
  dozen: { group: "count", factor: 12 },
};

/** Converts a recipe amount into the pantry item's unit, or null when they can't be compared (e.g. tsp vs kg). */
export function recipeAmountIn(qty: number, recipeUnit: string, pantryUnit: string): number | null {
  const a = RECIPE_UNITS[recipeUnit];
  const b = RECIPE_UNITS[pantryUnit];
  if (!a || !b || a.group !== b.group) return null;
  return Math.round(((qty * a.factor) / b.factor) * 1000) / 1000;
}

export interface PantryForRecipes {
  id: string;
  name: string;
  status: string;
  daysLeft: number | null;
  quantity?: number;
  unit?: string;
}

export interface RecipeSuggestion {
  recipe: Recipe;
  matched: { ingredient: string; itemId: string; itemName: string; status: string; daysLeft: number | null }[];
  missing: string[];
  urgentCount: number;
  score: number;
}

/** Best pantry item for an ingredient: in date, soonest to expire first (so it gets used up). */
export function bestPantryMatch<T extends PantryForRecipes>(items: T[], keywords: string[]): T | undefined {
  return items
    .filter((it) => ["EXPIRING", "SAFE", "NO_EXPIRY", "NO_DATE"].includes(it.status) && nameMatches(it.name, keywords))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))[0];
}

/**
 * Scores each recipe by the pantry items it would use. Items expiring soon score highest,
 * so the top suggestion is the one that saves the most food. Expired items are never suggested.
 */
export function suggestRecipes(items: PantryForRecipes[], limit = 8): RecipeSuggestion[] {
  const out: RecipeSuggestion[] = [];
  for (const recipe of RECIPES) {
    const matched: RecipeSuggestion["matched"] = [];
    const missing: string[] = [];
    let requiredMissing = 0;
    for (const ingr of recipe.ingredients) {
      if (ingr.qty == null && ingr.optional) continue; // "salt to taste" never decides a suggestion
      const c = bestPantryMatch(items, ingr.keywords);
      if (c) matched.push({ ingredient: ingr.name, itemId: c.id, itemName: c.name, status: c.status, daysLeft: c.daysLeft });
      else {
        missing.push(ingr.name + (ingr.optional ? " (optional)" : ""));
        if (!ingr.optional) requiredMissing++;
      }
    }
    const urgentCount = matched.filter((m) => m.status === "EXPIRING").length;
    if (matched.length === 0 || requiredMissing > 1) continue;
    out.push({ recipe, matched, missing, urgentCount, score: urgentCount * 3 + matched.length - requiredMissing * 2 });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes).slice(0, limit);
}

/** Guesses the cooking action of a free-text step (used for online recipes) so it can be animated. */
export function inferAction(text: string): CookAction {
  const t = text.toLowerCase();
  const rules: [RegExp, CookAction][] = [
    [/\b(preheat|bake|oven|roast|grill)\b/, "bake"],
    [/\b(boil|blanch|poach)\b/, "boil"],
    [/\b(simmer|stew|reduce|braise)\b/, "simmer"],
    [/\b(fry|saut[eé]|sear|brown|toast|pan)\b/, "fry"],
    [/\b(temper|crackle|splutter)\b/, "temper"],
    [/\b(blend|pur[eé]e|process|liquidi[sz]e)\b/, "blend"],
    [/\b(mash|crush)\b/, "mash"],
    [/\b(knead|dough)\b/, "knead"],
    [/\b(roll|shape|form)\b/, "roll"],
    [/\b(grate|zest|shred)\b/, "grate"],
    [/\b(chop|dice|slice|cut|mince)\b/, "chop"],
    [/\b(steam)\b/, "steam"],
    [/\b(soak|marinate)\b/, "soak"],
    [/\b(rest|cool|chill|set aside|leave)\b/, "rest"],
    [/\b(wash|rinse|clean)\b/, "wash"],
    [/\b(serve|garnish|plate)\b/, "serve"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "mix";
}

/** Pulls a duration ("for 10 minutes", "20-25 mins") out of a step, for the step timer. */
export function inferMinutes(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:-|to|–)?\s*(\d+)?\s*(?:min|mins|minutes)\b/i);
  if (m) return Number(m[2] ?? m[1]);
  const h = text.match(/(\d+)\s*(?:hour|hours|hr|hrs)\b/i);
  return h ? Number(h[1]) * 60 : undefined;
}
