import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto("http://localhost:3000/");
await page.waitForSelector("text=CodeMap");

const currentTheme = await page.evaluate(() => document.documentElement.classList.contains("dark") ? "dark" : "light");
console.log("current theme:", currentTheme);
await page.locator("header, aside").first().screenshot({ path: `/tmp/logo-${currentTheme}.png` });

await page.click('button[title="Toggle light/dark mode"]');
await page.waitForTimeout(300);
const newTheme = currentTheme === "dark" ? "light" : "dark";
await page.locator("header, aside").first().screenshot({ path: `/tmp/logo-${newTheme}.png` });

await browser.close();
