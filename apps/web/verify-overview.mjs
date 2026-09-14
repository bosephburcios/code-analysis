import { chromium } from "playwright";
const base = "http://localhost:3000";
const email = `overview-test-${Date.now()}@example.com`;
const password = "TestPassword123!";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1900, height: 1300 } })).newPage();
page.on("console", (msg) => { if (msg.type() === "error") console.log("[console error]", msg.text()); });
page.on("pageerror", (err) => console.log("[page error]", String(err)));

console.log("sign up");
await page.goto(`${base}/sign-up`);
await page.fill("#name", "Overview Test");
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL(base + "/", { timeout: 10000 }),
  page.click('button[type="submit"]'),
]);

console.log("import repo");
await page.fill('input[type="url"]', "https://github.com/bosephburcios/code-analysis");
await page.click('button[type="submit"]');
await page.waitForSelector("text=Repository imported", { timeout: 30000 });
await Promise.all([
  page.waitForURL(/\/repos\/.+/, { timeout: 10000 }),
  page.click("text=Explore repository"),
]);

console.log("wait for raw analysis");
for (let i = 0; i < 90; i++) {
  const text = await page.locator("main").innerText();
  if (/\d+ components · \d+ connections/.test(text) && !text.includes("0 components")) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(500);

console.log("generate architecture");
await page.locator('button:has-text("Generate architecture")').click();
for (let i = 0; i < 150; i++) {
  const still = await page.locator('button:has-text("Generating architecture")').count();
  if (!still) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(1500);

console.log("scroll to overview + components sections");
await page.click('a[href="#overview"]');
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/overview-section.png", fullPage: false });

await page.click('a[href="#components"]');
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/components-section.png", fullPage: false });

console.log("test search filter");
await page.fill('input[aria-label="Search components"]', "prisma");
await page.waitForTimeout(300);
const statusText = await page.locator('p[role="status"]').last().innerText();
console.log("status after search 'prisma':", statusText);
await page.screenshot({ path: "/tmp/components-search.png", fullPage: false });

console.log("clear search, test role filter");
await page.fill('input[aria-label="Search components"]', "");
await page.waitForTimeout(200);
const roleButtons = await page.locator('button:has-text("Backend API")').first();
if (await roleButtons.count()) {
  await roleButtons.click();
  await page.waitForTimeout(300);
  const filteredStatus = await page.locator('p[role="status"]').last().innerText();
  console.log("status after role filter 'Backend API':", filteredStatus);
}

console.log("expand a component's details & evidence");
await page.locator("summary", { hasText: "Details & evidence" }).first().click();
for (let i = 0; i < 20; i++) {
  if (!(await page.locator("text=Loading evidence").count())) break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(300);
const detailsText = await page.locator("details", { hasText: "Details & evidence" }).first().innerText();
console.log("expanded details text (first 800 chars):\n", detailsText.slice(0, 800));
await page.screenshot({ path: "/tmp/components-expanded.png", fullPage: false });

console.log("confirm interactive inspector evidence still works");
await page.click('a[href="#architecture"]').catch(() => {});
await page.waitForTimeout(300);
const node = page.locator(".react-flow__node.react-flow__node-component").first();
await node.click({ position: { x: 15, y: 10 }, force: true });
await page.waitForTimeout(600);
for (let i = 0; i < 20; i++) {
  if (!(await page.locator("text=Loading evidence").count())) break;
  await page.waitForTimeout(500);
}
const inspectorOpen = await page.locator('[data-slot="sheet-title"]').count();
console.log("inspector opened and evidence area present:", !!inspectorOpen);

await browser.close();
console.log("done");
