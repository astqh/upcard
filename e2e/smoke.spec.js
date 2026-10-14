import { test, expect } from "@playwright/test";

// Plays a hand to the end by standing (or declining insurance). Leaves the table on "Next hand".
async function playHandToEnd(page) {
  await page.getByRole("button", { name: "Deal", exact: true }).click();
  const next = page.getByRole("button", { name: "Next hand" });
  for (let i = 0; i < 20; i++) {
    if (await next.isVisible()) return;
    const decline = page.getByRole("button", { name: "Decline" });
    const stand = page.getByRole("button", { name: "Stand", exact: true });
    if (await decline.isVisible()) await decline.click();
    else if (await stand.isEnabled().catch(() => false)) await stand.click();
    else await page.waitForTimeout(50);
  }
  await expect(next).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => { throw e; });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Upcard" })).toBeVisible();
});

test("footer shows a version stamp", async ({ page }) => {
  await expect(page.getByTestId("version")).toHaveText(/^v\d+\.\d+\.\d+ · [0-9a-z]{7}$/);
});

test("plays 40 Trainer hands with no errors", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.getByRole("button", { name: "Trainer" }).click();
  for (let i = 0; i < 40; i++) {
    await playHandToEnd(page);
    await page.getByRole("button", { name: "Next hand" }).click();
  }
  expect(errors).toEqual([]);
});

test("chips mode hides the play record until End session", async ({ page }) => {
  // A hand with no decision to make (a blackjack) records no moves, so play until the button shows.
  const end = page.getByRole("button", { name: "End session and see how I did" });
  for (let i = 0; i < 10 && !(await end.first().isVisible()); i++) {
    await playHandToEnd(page);
  }
  await expect(end.first()).toBeVisible();
  await expect(page.getByText(/Hidden while you are playing for chips/)).toBeVisible();
  await expect(page.getByText("Moves this session")).toHaveCount(0);
  await expect(page.getByText("Session review")).toHaveCount(0);
  await end.first().click();
  await expect(page.getByText("Session review")).toBeVisible();
  await expect(page.getByText("Moves this session")).toBeVisible();
});

test("calculator keyboard entry: A,5,7,K removes 4 cards and recommends Double", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText("How you enter cards").locator("xpath=following-sibling::select").selectOption("keyboard");
  await page.getByRole("button", { name: "Table" }).click();
  await page.getByText("Mode", { exact: true }).locator("xpath=following-sibling::select").selectOption("calculator");
  const cards = page.getByText(/\d+ cards left/);
  await expect(cards).toContainText("312 cards left");
  await page.getByRole("button", { name: "Start hand" }).click();
  // Order of entry: your first card, dealer upcard, your second card, dealer hole card.
  for (const key of ["a", "5", "7", "k"]) await page.keyboard.press(key);
  await expect(cards).toContainText("308 cards left");
  await expect(page.getByText("Recommended play")).toBeVisible();
  await expect(page.getByText("Double", { exact: true }).first()).toBeVisible();
  await expect(page.locator("span", { hasText: /^Double$/ }).first()).toHaveCSS("font-size", "30px");
});

test("settings survive a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Rules" }).click();
  const decks = page.getByText("Decks", { exact: true }).locator("xpath=following-sibling::select");
  await decks.selectOption("8");
  await page.reload();
  await page.getByRole("button", { name: "Rules" }).click();
  await expect(decks).toHaveValue("8");
});

test("no sideways scroll at 390 px wide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const tab of ["Table", "Rules", "Counting", "Bankroll", "Simulator", "FAQ", "Settings"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wide, `${tab} scrolls sideways`).toBe(false);
  }
});
