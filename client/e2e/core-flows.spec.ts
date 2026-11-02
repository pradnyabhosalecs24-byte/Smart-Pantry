import { expect, test, type Page } from "@playwright/test";

const unique = () => Math.random().toString(36).slice(2, 8);
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(`e2e-${unique()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("pantry123");
  await page.getByLabel("Confirm password").fill("pantry123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your pantry is empty")).toBeVisible();
}

async function openAddItem(page: Page) {
  // Full button on desktop, icon button on phones — both are labelled "Add item"
  await page.getByRole("button", { name: "Add item" }).locator("visible=true").first().click();
}

test("add an item, see it on the dashboard, record use, and data survives a reload", async ({ page }) => {
  await register(page);

  await openAddItem(page);
  await page.getByRole("button", { name: "Add to pantry" }).click();
  await expect(page.getByText("Item name is required")).toBeVisible();

  await page.getByLabel("Item name").fill("Curd");
  await page.getByLabel("Quantity").fill("400");
  await page.getByLabel("Unit").selectOption("g");
  await page.getByLabel("Category").selectOption({ label: "Dairy" });
  await page.getByLabel("Stored in").selectOption({ label: "Refrigerator" });
  await page.getByRole("textbox", { name: "Expiry date" }).fill(isoIn(3));
  await page.getByRole("button", { name: "Add to pantry" }).click();
  await expect(page.getByText("Curd added to your pantry")).toBeVisible();
  await expect(page.getByText("Use these first")).toBeVisible();

  await page.goto("/pantry");
  await page.getByRole("button", { name: "Record use of Curd" }).locator("visible=true").first().click();
  await page.getByLabel("Quantity").fill("0.1");
  await page.getByRole("dialog").getByLabel("Unit").selectOption("kg");
  await page.getByRole("dialog").getByRole("button", { name: "Record use" }).click();
  await expect(page.getByText("Recorded 0.1 kg of Curd as used")).toBeVisible();

  await page.reload();
  await expect(page.getByText("300 g").locator("visible=true").first()).toBeVisible();
});

test("demo data, expired-food safeguard and shopping list purchase", async ({ page }) => {
  await register(page);
  await page.getByRole("button", { name: "Try with demo data" }).click();
  await expect(page.getByText("Use these first")).toBeVisible();

  await page.goto("/pantry?search=Paneer");
  await page.getByRole("button", { name: "Record use of Paneer" }).locator("visible=true").first().click();
  await page.getByLabel("Quantity").fill("50");
  await page.getByRole("dialog").getByRole("button", { name: "Record use" }).click();
  await expect(page.getByText("past its expiry date")).toBeVisible();
  await page.getByRole("button", { name: "Record as wasted" }).click();
  await expect(page.getByText("Recorded as wasted")).toBeVisible();

  await page.goto("/shopping");
  await page.getByRole("button", { name: "Add low-stock items" }).click();
  await page.getByRole("button", { name: "Mark Toor Dal as bought" }).click();
  await page.getByRole("textbox", { name: "Expiry date" }).fill(isoIn(150));
  await page.getByRole("button", { name: "Add to pantry" }).click();
  await expect(page.getByText("Toor Dal added to your pantry")).toBeVisible();
});

test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
  await page.goto("/pantry");
  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("explore recipes by ingredient, scale servings, cook along and update the pantry", async ({ page }) => {
  await register(page);
  await openAddItem(page);
  await page.getByLabel("Item name").fill("Potatoes");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit").selectOption("kg");
  await page.getByRole("textbox", { name: "Expiry date" }).fill(isoIn(10));
  await page.getByRole("button", { name: "Add to pantry" }).click();
  await expect(page.getByText("Potatoes added to your pantry")).toBeVisible();

  await page.goto("/recipes");
  await page.getByLabel("Ingredient").fill("potato");
  await page.getByRole("button", { name: "Find dishes" }).click();
  await expect(page.getByRole("link", { name: /Aloo Paratha/ })).toBeVisible();
  await page.getByRole("link", { name: /Jeera Aloo/ }).click();

  await expect(page.getByText("300 g").first()).toBeVisible();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await expect(page.getByText("600 g").first()).toBeVisible();

  await page.getByRole("button", { name: "Start cook-along" }).click();
  const player = page.getByRole("dialog", { name: "Cook along: Jeera Aloo" });
  await expect(player.getByText("Step 1 of 5")).toBeVisible();
  for (let i = 0; i < 4; i++) await player.getByRole("button", { name: /Next step|Finish/ }).click();
  await player.getByRole("button", { name: "Finish" }).click();
  await player.getByRole("button", { name: "I cooked this, update pantry" }).click();

  const dialog = page.getByRole("dialog", { name: "Update your pantry" });
  await expect(dialog.getByLabel("Amount of Potatoes used")).toHaveValue("0.6");
  await dialog.getByRole("button", { name: /^Record/ }).click();
  await expect(page.getByText("as used for Jeera Aloo")).toBeVisible();
});
