// Created for every new account. Opened shelf-life values are conservative general guides;
// users can edit them per category or per item.
export const DEFAULT_CATEGORIES: { name: string; openedShelfLifeDays: number | null }[] = [
  { name: "Fruits & Vegetables", openedShelfLifeDays: null },
  { name: "Dairy", openedShelfLifeDays: 4 },
  { name: "Grains & Cereals", openedShelfLifeDays: 90 },
  { name: "Snacks", openedShelfLifeDays: 14 },
  { name: "Beverages", openedShelfLifeDays: 7 },
  { name: "Canned Foods", openedShelfLifeDays: 3 },
  { name: "Spices & Condiments", openedShelfLifeDays: 180 },
  { name: "Frozen Foods", openedShelfLifeDays: null },
  { name: "Bakery", openedShelfLifeDays: 4 },
  { name: "Other", openedShelfLifeDays: null },
];

export const DEFAULT_LOCATIONS = ["Refrigerator", "Freezer", "Kitchen Cabinet", "Pantry Shelf"];
