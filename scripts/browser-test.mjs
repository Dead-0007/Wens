import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const outputUrl = new URL('../output/', import.meta.url);

export async function launchTestBrowser(executablePath = process.env.WENS_TEST_BROWSER) {
  return chromium.launch({
    ...(executablePath ? { executablePath } : { channel: 'msedge' }),
    headless: true,
    chromiumSandbox: true,
  });
}

export async function openCompanionTestPage(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(new URL('../dist-vnext/pet.html', import.meta.url).href);
  await page.locator('body.is-idle').waitFor();
  await mkdir(outputUrl, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  return cdp.send.bind(cdp);
}

export function browserTestOutput(name) {
  return fileURLToPath(new URL(name, outputUrl));
}
