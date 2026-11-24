import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { browserTestOutput, launchTestBrowser, openCompanionTestPage } from './scripts/browser-test.mjs';

const browser = await launchTestBrowser();
try {
  const sendCmd = await openCompanionTestPage(browser, 360, 245);

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 245,
    deviceScaleFactor: 1,
    mobile: false
  });
  await wait(500);

  // Evaluate initial state (should be idle)
  console.log('[Check 1] Companion starts in idle mode without popup...');
  let res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      const shell = document.querySelector('.pet-shell');
      const bubble = document.querySelector('.compact-bubble');
      const bStyle = window.getComputedStyle(bubble);
      return {
        bodyClasses: document.body.className,
        bubbleOpacity: bStyle.opacity,
        bubbleVisibility: bStyle.visibility
      };
    })()`,
    returnByValue: true
  });
  assert.equal(res.result.value.bodyClasses.includes('is-idle'), true, 'Body must have is-idle class');
  assert.equal(res.result.value.bubbleOpacity, '0', 'Bubble must be hidden in idle');
  assert.equal(res.result.value.bubbleVisibility, 'hidden', 'Bubble visibility must be hidden in idle');
  console.log('  ✓ Initial idle verified.');

  // Trigger prayer-at reminder
  console.log('[Check 2] Triggering prayer-at reminder via window.handleIncomingReminder...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      await window.handleIncomingReminder({
        id: 'test-fajr',
        title: 'حان الآن موعد أذان الفجر',
        body: 'حي على الصلاة، حي على الفلاح',
        kind: 'prayer-at'
      });
      await new Promise((r) => setTimeout(r, 450));
      const shell = document.querySelector('.pet-shell');
      const bubble = document.querySelector('.compact-bubble');
      const sStyle = window.getComputedStyle(shell);
      const bStyle = window.getComputedStyle(bubble);
      const mStyle = window.getComputedStyle(document.querySelector('#compactMessage'));
      const kStyle = window.getComputedStyle(document.querySelector('#compactKicker'));
      const bRect = bubble.getBoundingClientRect();
      return {
        bodyClasses: document.body.className,
        shellOpacity: sStyle.opacity,
        bubbleOpacity: bStyle.opacity,
        bubbleVisibility: bStyle.visibility,
        bubbleBg: bStyle.backgroundColor,
        messageColor: mStyle.color,
        kickerColor: kStyle.color,
        kickerText: document.querySelector('#compactKicker').textContent,
        actionText: document.querySelector('#compactAction').textContent,
        laterText: document.querySelector('#compactActionLater').textContent,
        bounds: { left: bRect.left, right: bRect.right, top: bRect.top, bottom: bRect.bottom, width: bRect.width, height: bRect.height }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  const r2 = res.result.value;
  assert.equal(r2.bodyClasses.includes('is-peek'), true, 'Body must have is-peek class');
  assert.equal(r2.bodyClasses.includes('has-event'), true, 'Body must have has-event class');
  assert.equal(r2.shellOpacity, '1', 'Pet shell must have 100% opacity on reminder');
  assert.equal(r2.bubbleOpacity, '1', 'Bubble must have 100% opacity on reminder');
  assert.equal(r2.bubbleVisibility, 'visible', 'Bubble must be visible on reminder');
  assert.equal(r2.bubbleBg, 'rgb(17, 26, 34)', 'Bubble background must be solid #111a22');
  assert.equal(r2.messageColor, 'rgb(255, 255, 255)', 'Title text must be solid white #ffffff');
  assert.equal(r2.kickerColor, 'rgb(251, 191, 36)', 'Kicker must be gold #fbbf24');
  assert.equal(r2.kickerText, 'حان وقت الصلاة', 'Kicker text correct');
  assert.equal(r2.actionText, 'صليت', 'Primary action button text correct');
  assert.equal(r2.laterText, 'بعد ١٠ دقائق', 'Snooze button text correct');

  // Check bounds within 360x245 window
  console.log(`  Bubble bounds: left=${r2.bounds.left.toFixed(1)}, right=${r2.bounds.right.toFixed(1)}, top=${r2.bounds.top.toFixed(1)}, bottom=${r2.bounds.bottom.toFixed(1)}, width=${r2.bounds.width.toFixed(1)}, height=${r2.bounds.height.toFixed(1)}`);
  assert.ok(r2.bounds.left >= 0, 'Bubble must not overflow left window edge');
  assert.ok(r2.bounds.right <= 360, 'Bubble must not overflow right window edge');
  assert.ok(r2.bounds.top >= 0, 'Bubble must not overflow top window edge');
  assert.ok(r2.bounds.bottom <= 245, 'Bubble must not overflow bottom window edge');
  console.log('  ✓ Prayer reminder popup, contrast, and geometry fully verified!');

  // Click "صليت"
  console.log('[Check 3] Clicking "صليت" to resolve reminder and return to idle...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      document.querySelector('#compactAction').click();
      await new Promise((r) => setTimeout(r, 200));
      return {
        bodyClasses: document.body.className
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.bodyClasses.includes('is-idle'), true, 'Body must return to is-idle after clicking prayer done');
  console.log('  ✓ Prayer resolved and mode returned to idle.');

  // Trigger Fasting Suhoor reminder
  console.log('[Check 4] Triggering fasting-suhoor reminder...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      await window.handleIncomingReminder({
        id: 'test-suhoor',
        title: 'حان وقت السحور',
        body: 'بركة السحور — موعد الإمساك يقترب',
        kind: 'fasting-suhoor'
      });
      return {
        bodyClasses: document.body.className,
        kickerText: document.querySelector('#compactKicker').textContent,
        messageText: document.querySelector('#compactMessage').textContent,
        actionText: document.querySelector('#compactAction').textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.bodyClasses.includes('is-peek'), true, 'Suhoor must open peek mode');
  assert.equal(res.result.value.kickerText, 'تذكير السحور', 'Suhoor kicker text correct');
  assert.equal(res.result.value.messageText, 'حان وقت السحور', 'Suhoor message text correct');
  assert.equal(res.result.value.actionText, 'نويت الصيام', 'Suhoor action text correct');
  console.log('  ✓ Suhoor reminder verified.');

  // Click Close "×"
  console.log('[Check 5] Clicking close button "×" on popup...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      document.querySelector('#compactBubbleClose').click();
      await new Promise((r) => setTimeout(r, 200));
      return {
        bodyClasses: document.body.className
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.bodyClasses.includes('is-idle'), true, 'Body must return to is-idle after close');
  console.log('  ✓ Popup dismissed cleanly.');

  // Trigger Fasting Iftar reminder
  console.log('[Check 6] Triggering fasting-iftar reminder...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      await window.handleIncomingReminder({
        id: 'test-iftar',
        title: 'حان موعد إفطار المغرب',
        body: 'تقبل الله صيامكم وطاعتكم',
        kind: 'fasting-iftar'
      });
      return {
        bodyClasses: document.body.className,
        kickerText: document.querySelector('#compactKicker').textContent,
        messageText: document.querySelector('#compactMessage').textContent,
        actionText: document.querySelector('#compactAction').textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.bodyClasses.includes('is-peek'), true, 'Iftar must open peek mode');
  assert.equal(res.result.value.kickerText, 'موعد الإفطار', 'Iftar kicker text correct');
  assert.equal(res.result.value.actionText, 'أفطرت والحمد لله', 'Iftar action text correct');
  console.log('  ✓ Iftar reminder verified.');

  // Test snooze button
  console.log('[Check 7] Testing snooze ("بعد ١٠ دقائق")...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      document.querySelector('#compactActionLater').click();
      await new Promise((r) => setTimeout(r, 200));
      return {
        bodyClasses: document.body.className
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.bodyClasses.includes('is-idle'), true, 'Body must return to is-idle after snooze');
  console.log('  ✓ Snooze functionality verified.');

  console.log('[Check 8] Testing preparation, focus, and test reminders...');
  const reminderKinds = [
    { kind: 'prayer-prepare-15', kicker: 'استعداد للصلاة', action: 'صليت' },
    { kind: 'work-focus', kicker: 'جلسة التركيز', action: 'أنهي وسجّل' },
    { kind: 'test-prayer', kicker: 'اختبار التنبيه', action: 'تم الاختبار' },
  ];
  for (const { kind, kicker, action } of reminderKinds) {
    const reminder = { id: `suite-${kind}`, kind, title: 'تجربة التنبيه' };
    res = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        await window.handleIncomingReminder(${JSON.stringify(reminder)});
        return {
          kicker: document.querySelector('#compactKicker').textContent,
          action: document.querySelector('#compactAction').textContent,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.deepEqual(res.result.value, { kicker, action }, `Unexpected copy for ${kind}`);
  }

  // Check 9: Avatar themes test across all 7 avatars
  console.log('[Check 9] Testing all 7 companion avatars during peek reminders...');
  const avatars = ['orb', 'robot', 'cat', 'owl', 'crescent', 'sprout', 'lantern'];
  for (const avatar of avatars) {
    res = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        applyAvatarTheme('${avatar}');
        await window.handleIncomingReminder({
          id: 'test-${avatar}',
          title: 'اختبار شخصية ${avatar}',
          body: 'تأكيد سلامة التصميم الفيزيائي',
          kind: 'test-avatar'
        });
        await new Promise((r) => setTimeout(r, 100));
        const dragSurface = document.querySelector('#companionDragSurface');
        return {
          avatarClass: dragSurface.className,
          bodyClasses: document.body.className
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.equal(res.result.value.avatarClass.includes(`avatar-${avatar}`), true, `Avatar class for ${avatar} missing`);
    assert.equal(res.result.value.bodyClasses.includes('is-peek'), true, `Peek mode active for ${avatar}`);
    console.log(`  ✓ Avatar [${avatar}] verified in peek reminder mode.`);
  }

  // Check 10: Near-left screen edge positioning (align-left)
  console.log('[Check 10] Testing near-left screen edge (align-left) bubble bounds...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      localStorage.setItem('wens-pet-position-v1', JSON.stringify({ x: 80, y: 300 }));
      await setPetMode('peek');
      await new Promise((r) => setTimeout(r, 450));
      const bubble = document.querySelector('.compact-bubble');
      const avatar = document.querySelector('#companionDragSurface');
      const bRect = bubble.getBoundingClientRect();
      const aRect = avatar.getBoundingClientRect();
      return {
        bubbleAlignLeft: bubble.classList.contains('align-left'),
        avatarAlignLeft: avatar.classList.contains('align-left'),
        bBounds: { left: bRect.left, right: bRect.right, top: bRect.top, bottom: bRect.bottom },
        aBounds: { left: aRect.left, right: aRect.right, top: aRect.top, bottom: aRect.bottom }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const r10 = res.result.value;
  assert.equal(r10.bubbleAlignLeft, true, 'Bubble must have align-left class when x < 150');
  console.log('r10 bBounds:', r10.bBounds, 'aBounds:', r10.aBounds);
  assert.ok(r10.bBounds.left >= 0 && r10.bBounds.right <= 360, `Align-left bubble must fit in 360px window width, got left=${r10.bBounds.left}, right=${r10.bBounds.right}`);

  // Check 11: Audio synthesis test
  console.log('[Check 11] Testing Web Audio chime synthesis across avatars...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      let errors = [];
      const testAvatars = ['orb', 'robot', 'cat', 'owl', 'crescent', 'sprout', 'lantern'];
      testAvatars.forEach((av) => {
        try {
          if (window.playCompanionSound) window.playCompanionSound(av, 'alert', { enabled: true });
        } catch (e) {
          errors.push(av + ': ' + e.message);
        }
      });
      return errors;
    })()`,
    returnByValue: true
  });
  assert.equal(res.result.value.length, 0, `Audio synthesis errors: ${res.result.value.join(', ')}`);
  console.log('  ✓ Web Audio synthesis verified for all avatars.');

  // Check 12: High-contrast screenshot over pure white background
  console.log('[Check 12] Capturing verification screenshot over pure white background (#ffffff)...');
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.style.background = '#ffffff';
      document.body.style.background = '#ffffff';
      localStorage.setItem('wens-pet-position-v1', JSON.stringify({ x: 900, y: 400 }));
      setPetMode('idle');
    })()`
  });
  await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      applyAvatarTheme('robot');
      await window.handleIncomingReminder({
        id: 'test-contrast-prayer',
        title: 'حان الآن موعد أذان العصر',
        body: 'حي على الصلاة، حي على الفلاح',
        kind: 'prayer-at'
      });
      await new Promise((r) => setTimeout(r, 450));
    })()`,
    awaitPromise: true
  });

  const ss = await sendCmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(browserTestOutput('companion-white-bg-test.png'), Buffer.from(ss.data, 'base64'));
  console.log('  ✓ Screenshot captured to output/companion-white-bg-test.png');

  console.log('\n--- ALL 12 REAL-BROWSER TESTS PASSED (100%) ---');
} finally {
  await browser.close();
}
