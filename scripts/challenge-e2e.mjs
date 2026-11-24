import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launchTestBrowser } from './browser-test.mjs';

const reviewDir = path.resolve('.impeccable/review');
await mkdir(reviewDir, { recursive: true });
const browser = await launchTestBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.addInitScript(() => localStorage.clear());
await page.goto(process.env.WENS_CHALLENGE_TEST_URL || 'http://127.0.0.1:4179');
await page.getByRole('button', { name: /التحديات/ }).click();
await page.getByRole('heading', { name: 'تحديات وِنس' }).waitFor();

const personalForm = page.locator('#personalChallengeForm');
await personalForm.locator('[name="title"]').fill('تحدي شخصي تجريبي');
await personalForm.locator('[name="target"]').fill('2');
await personalForm.locator('[name="unit"]').fill('مرة');
await personalForm.getByRole('button', { name: 'ابدأ تحديي' }).click();
const personalActive = page.locator('.challenge-card').filter({ hasText: 'تحدي شخصي تجريبي' });
await personalActive.getByText('تحديك الشخصي').waitFor();
await page.locator('label[for="challengesEnabled"]').click();
await page.getByText('التحديات مقفولة').waitFor();
await page.getByRole('button', { name: 'شغّل التحديات' }).click();
await personalActive.getByRole('button', { name: /سجّل/ }).click();
await personalActive.getByText('فاضل ١ مرة').waitFor();
await personalActive.getByRole('button', { name: /شيله/ }).click();
if (await page.locator('.challenge-card').filter({ hasText: 'تحدي شخصي تجريبي' }).count()) throw new Error('Dismissed personal challenge stayed active.');

await page.locator('input[name="randomSource"][value="app"]').locator('..').click();
await page.locator('label[for="challengeRandomAuto"]').click();
let randomActive = page.locator('.challenge-card').filter({ hasText: 'راندوم · وِنس' });
await randomActive.waitFor();
await page.locator('label[for="challengeRandomAuto"]').click();
await randomActive.getByRole('button', { name: /شيله/ }).click();
await page.getByRole('button', { name: 'اختار لي دلوقتي' }).click();
randomActive = page.locator('.challenge-card').filter({ hasText: 'راندوم · وِنس' });
await randomActive.waitFor();
await page.getByRole('button', { name: 'اختار لي دلوقتي' }).click();
await page.getByText('عندك تحدي راندوم شغال').waitFor();
await randomActive.getByRole('button', { name: /شيله/ }).click();

await page.locator('input[name="randomSource"][value="developer"]').locator('..').click();
await page.getByRole('button', { name: 'اختار لي دلوقتي' }).click();
const developerRandom = page.locator('.challenge-card').filter({ hasText: 'راندوم · المطور' });
await developerRandom.waitFor();
await developerRandom.getByRole('button', { name: /شيله/ }).click();

await page.getByRole('button', { name: 'أدوات المطور' }).click();
const form = page.locator('#challengeBuilderForm');
await form.locator('[name="title"]').fill('تحدي قراءة مركّز');
await form.locator('[name="description"]').fill('اقرأ ثلاث صفحات وسجّل كل صفحة بعد ما تخلصها.');
await form.locator('[name="target"]').fill('3');
await form.locator('[name="unit"]').fill('صفحة');
await form.locator('[name="step"]').fill('1');
const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
await form.locator('[name="endsAt"]').fill(future);
await form.getByRole('button', { name: 'نشر محليًا' }).click();
await page.getByRole('heading', { name: 'تحدي قراءة مركّز' }).waitFor();

await form.locator('[name="title"]').fill('قيام ليل مرة');
await form.locator('[name="description"]').fill('تحدي مفتوح بدون موعد انتهاء؛ علّم عليه لما تتمه.');
await form.locator('[name="category"]').selectOption('night-prayer');
await form.locator('[name="target"]').fill('1');
await form.locator('[name="unit"]').fill('مرة');
await form.locator('[name="step"]').fill('1');
await form.locator('[name="endsAt"]').fill('');
await form.getByRole('button', { name: 'نشر محليًا' }).click();
await page.getByRole('button', { name: 'إخفاء أدوات المطور' }).click();

const timedCatalog = page.locator('.challenge-catalog-card').filter({ hasText: 'تحدي قراءة مركّز' });
await timedCatalog.getByRole('button', { name: 'انضم للتحدي' }).click();
const timedActive = page.locator('.challenge-card').filter({ hasText: 'تحدي قراءة مركّز' });
await timedActive.getByRole('button', { name: /سجّل/ }).click();
await timedActive.getByText('فاضل ٢ صفحة').waitFor();
if (!await timedActive.getByText(/فاضل .* يوم|فاضل .* ساعة/).count()) throw new Error('Timed challenge has no remaining-time indicator.');
await page.waitForTimeout(5500);
await page.screenshot({ path: path.join(reviewDir, 'desktop.png'), fullPage: true });

await timedActive.getByRole('button', { name: /سجّل/ }).click();
await timedActive.getByRole('button', { name: /سجّل/ }).click();
if (await page.locator('.challenge-card').filter({ hasText: 'تحدي قراءة مركّز' }).count()) throw new Error('Completed challenge did not disappear.');
const openCatalog = page.locator('.challenge-catalog-card').filter({ hasText: 'قيام ليل مرة' });
await openCatalog.getByRole('button', { name: 'انضم للتحدي' }).click();
const openActive = page.locator('.challenge-card').filter({ hasText: 'قيام ليل مرة' });
await openActive.getByText('مفيش موعد انتهاء').waitFor();
if (await openActive.getByText(/^فاضل .* (يوم|ساعة)$/).count()) throw new Error('Open challenge incorrectly shows a time countdown.');
await page.setViewportSize({ width: 760, height: 1000 });
await page.waitForTimeout(5500);
await page.screenshot({ path: path.join(reviewDir, 'mobile.png'), fullPage: true });

console.log('Challenge E2E passed: feature pause/resume, personal creation, app/developer random sources, weekly opt-in, progress, completion/dismissal, and responsive screenshots.');
await browser.close();
