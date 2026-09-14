import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("/tmp/readme-verify", { recursive: true });

const base = "http://localhost:3000";
const email = `readme-test-${Date.now()}@example.com`;
const password = "TestPassword123!";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1900, height: 1300 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.on("console", msg => { if (msg.type() === "error") console.log("[console error]", msg.text()); });
page.on("pageerror", err => console.log("[page error]", String(err)));

console.log("sign up");
await page.goto(`${base}/sign-up`);
await page.fill("#name", "Readme Test");
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([page.waitForURL(base + "/", { timeout: 10000 }), page.click('button[type="submit"]')]);

console.log("import repo (codemap itself)");
await page.fill('input[type="url"]', "https://github.com/bosephburcios/code-analysis");
await page.click('button[type="submit"]');
await page.waitForSelector("text=Repository imported", { timeout: 30000 });
await Promise.all([page.waitForURL(/\/repos\/.+/, { timeout: 10000 }), page.click("text=Explore repository")]);

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
  if (!(await page.locator('button:has-text("Generating architecture")').count())) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(1000);
const archText = await page.locator("main").innerText();
console.log("architecture ready:", /\d+ components · \d+ connections/.exec(archText)?.[0]);

console.log("scroll to readme section");
await page.click('a[href="#readme"]');
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/readme-verify/readme-gate.png" });

console.log("click Generate README");
await page.locator('button:has-text("Generate README")').click();
for (let i = 0; i < 180; i++) {
  if (!(await page.locator('button:has-text("Generating README")').count())) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(1000);

const afterGenerate = await page.locator("main").innerText();
console.log("post-generate contains 'Regenerate':", afterGenerate.includes("Regenerate"));
console.log("post-generate error banner present:", await page.locator('[role="alert"]').count());
if (await page.locator('[role="alert"]').count()) {
  console.log("alert text:", await page.locator('[role="alert"]').first().innerText());
}

await page.screenshot({ path: "/tmp/readme-verify/preview.png", fullPage: true });

console.log("switch to Markdown tab");
await page.locator('#readme-tab-markdown').click();
await page.waitForTimeout(500);
const markdownText = await page.locator("#readme-panel-markdown").innerText();
console.log("markdown length:", markdownText.length);
console.log("markdown starts with:", markdownText.slice(0, 120).replace(/\n/g, "\\n"));
await page.screenshot({ path: "/tmp/readme-verify/markdown.png" });

console.log("copy markdown");
await page.locator('button:has-text("Copy Markdown")').click();
await page.waitForTimeout(300);
console.log("copy button now says Copied:", await page.locator('button:has-text("Copied")').count() > 0);

console.log("switch back to preview, regenerate one section (Tech Stack)");
await page.locator('#readme-tab-preview').click();
await page.waitForTimeout(300);
await page.locator('details:has-text("Regenerate individual sections")').locator("summary").click();
await page.waitForTimeout(200);
await page.locator('button:has-text("Tech Stack")').click();
for (let i = 0; i < 60; i++) {
  const stillSpinning = await page.locator('details:has-text("Regenerate individual sections") button:has-text("Tech Stack") svg.animate-spin').count();
  if (!stillSpinning) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(500);
console.log("section regenerate finished without page error");

console.log("export package");
const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
await page.locator('button:has-text("Export package")').click();
for (let i = 0; i < 60; i++) {
  if (!(await page.locator('button:has-text("Capturing"), button:has-text("Building package"), button:has-text("Exporting")').count())) break;
  await page.waitForTimeout(1000);
}
const download = await downloadPromise;
const downloadPath = "/tmp/readme-verify/export.zip";
await download.saveAs(downloadPath);
console.log("downloaded zip to", downloadPath);

console.log("confirm interactive architecture inspector still works (regression check on shared canvas/adapter code)");
await page.click('a[href="#architecture"]');
await page.waitForTimeout(300);
const node = page.locator(".react-flow__node.react-flow__node-component").first();
await node.click({ position: { x: 15, y: 10 }, force: true });
await page.waitForTimeout(600);
console.log("inspector opened:", await page.locator('[data-slot="sheet-title"]').count() > 0);

await browser.close();
console.log("done");
