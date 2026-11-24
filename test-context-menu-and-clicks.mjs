import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { browserTestOutput, launchTestBrowser, openCompanionTestPage } from './scripts/browser-test.mjs';

const browser = await launchTestBrowser();
try {
  const sendCmd = await openCompanionTestPage(browser, 360, 260);

  await sendCmd('Page.enable');
  await sendCmd('Runtime.enable');
  await sendCmd('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 260,
    deviceScaleFactor: 1,
    mobile: false
  });
  await wait(500);

  // [Test 1] Initial state should be idle
  console.log('[Test 1] Initial state is idle...');
  let res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      return {
        bodyClasses: document.body.className,
        menuHidden: document.querySelector('#wensContextMenu').hidden,
        bubbleOpacity: window.getComputedStyle(document.querySelector('#eventBubble')).opacity
      };
    })()`,
    returnByValue: true
  });
  assert.ok(res.result.value.bodyClasses.includes('is-idle'), 'Should be idle');
  assert.equal(res.result.value.menuHidden, true, 'Context menu should be hidden initially');
  assert.equal(res.result.value.bubbleOpacity, '0', 'Bubble should be hidden initially');
  console.log('  ✓ Initial idle state confirmed.');

  // [Test 2] Left-click on avatar opens popup (peek mode)
  console.log('[Test 2] Left-click on companion avatar opens popup (peek mode)...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const avatar = document.querySelector('#companionDragSurface');
      avatar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await new Promise(r => setTimeout(r, 100));
      return {
        bodyClasses: document.body.className,
        bubbleOpacity: window.getComputedStyle(document.querySelector('#eventBubble')).opacity,
        bubbleVisibility: window.getComputedStyle(document.querySelector('#eventBubble')).visibility
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.ok(res.result.value.bodyClasses.includes('is-peek'), 'Left-click must switch to is-peek mode');
  assert.equal(res.result.value.bubbleOpacity, '1', 'Bubble must be visible with opacity 1');
  assert.equal(res.result.value.bubbleVisibility, 'visible', 'Bubble visibility must be visible');
  console.log('  ✓ Left-click opened popup successfully!');

  // [Test 3] Left-click on avatar again toggles it back to idle
  console.log('[Test 3] Left-click on avatar again toggles back to idle...');
  await wait(350);
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const avatar = document.querySelector('#companionDragSurface');
      avatar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await new Promise(r => setTimeout(r, 150));
      return {
        bodyClasses: document.body.className
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.ok(res.result.value.bodyClasses.includes('is-idle'), 'Second left-click must return to is-idle');
  console.log('  ✓ Toggled back to idle successfully.');

  // [Test 4] Right-click triggers Custom Context Menu and prevents default browser contextmenu
  console.log('[Test 4] Right-click opens Custom Context Menu and suppresses default browser menu...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const avatar = document.querySelector('#companionDragSurface');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      const dispatched = avatar.dispatchEvent(event);
      await new Promise(r => setTimeout(r, 100));
      const menu = document.querySelector('#wensContextMenu');
      const mStyle = window.getComputedStyle(menu);
      const mRect = menu.getBoundingClientRect();
      return {
        defaultPrevented: event.defaultPrevented,
        bodyClasses: document.body.className,
        menuHidden: menu.hidden,
        menuOpacity: mStyle.opacity,
        menuVisibility: mStyle.visibility,
        menuBg: mStyle.backgroundColor,
        menuBackdrop: mStyle.backdropFilter || mStyle.webkitBackdropFilter,
        bounds: { left: mRect.left, right: mRect.right, top: mRect.top, bottom: mRect.bottom, width: mRect.width, height: mRect.height }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const r4 = res.result.value;
  assert.equal(r4.defaultPrevented, true, 'Default browser contextmenu MUST be prevented');
  assert.ok(r4.bodyClasses.includes('is-menu'), 'Body class must include is-menu');
  assert.equal(r4.menuHidden, false, 'Context menu hidden attribute must be false');
  assert.equal(r4.menuOpacity, '1', 'Context menu opacity must be 1');
  assert.equal(r4.menuVisibility, 'visible', 'Context menu visibility must be visible');
  assert.ok(r4.menuBg.includes('rgba(14, 21, 29') || r4.menuBg.includes('rgb(14, 21, 29'), 'Menu background must be dark glassmorphism');
  assert.ok(r4.bounds.left >= 0, 'Menu must not overflow left');
  assert.ok(r4.bounds.right <= 360, 'Menu must not overflow right');
  assert.ok(r4.bounds.top >= 0, 'Menu must not overflow top');
  assert.ok(r4.bounds.bottom <= 260, 'Menu must not overflow bottom');
  console.log(`  Menu bounds: left=${r4.bounds.left}, right=${r4.bounds.right}, top=${r4.bounds.top}, bottom=${r4.bounds.bottom}, width=${r4.bounds.width}, height=${r4.bounds.height}`);
  console.log('  ✓ Custom context menu opened and default menu suppressed!');

  // [Test 5] Verify all 5 context menu items
  console.log('[Test 5] Verifying all 5 context menu options...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.context-menu-item')).map(btn => ({
        id: btn.id,
        text: btn.querySelector('.item-label')?.textContent.trim(),
        icon: btn.querySelector('.item-icon')?.textContent.trim(),
        isDanger: btn.classList.contains('danger')
      }));
      return items;
    })()`,
    returnByValue: true
  });
  const items = res.result.value;
  assert.ok(items.length >= 5, 'Must contain at least 5 options');
  const findItem = (id) => items.find(it => it.id === id);
  assert.ok(findItem('menuItemOpenMain'), 'Option menuItemOpenMain exists');
  assert.ok(findItem('menuItemDailyReview'), 'Option menuItemDailyReview exists');
  assert.ok(findItem('menuItemToggleSound'), 'Option menuItemToggleSound exists');
  assert.ok(findItem('menuItemHidePet'), 'Option menuItemHidePet exists');
  const quitItem = findItem('menuItemQuitApp');
  assert.ok(quitItem, 'Option menuItemQuitApp exists');
  assert.equal(quitItem.isDanger, true, 'Option menuItemQuitApp must have danger styling');
  console.log(`  ✓ All ${items.length} options verified:`);
  items.forEach(it => console.log(`     - [${it.icon}] ${it.text} (#${it.id})`));

  // [Test 6] Left-click while in menu mode closes menu and opens popup (Requirement 1 & 2 integration)
  console.log('[Test 6] Left-click on avatar while menu is open closes menu and opens popup peek mode...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const avatar = document.querySelector('#companionDragSurface');
      avatar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await new Promise(r => setTimeout(r, 100));
      return {
        bodyClasses: document.body.className,
        menuHidden: document.querySelector('#wensContextMenu').hidden,
        bubbleOpacity: window.getComputedStyle(document.querySelector('#eventBubble')).opacity
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.ok(res.result.value.bodyClasses.includes('is-peek'), 'Must switch to peek mode');
  assert.equal(res.result.value.menuHidden, true, 'Context menu must close');
  assert.ok(parseFloat(res.result.value.bubbleOpacity) >= 0.9, 'Popup bubble must open');
  console.log('  ✓ Menu closed and peek popup opened on avatar left-click.');

  // [Test 7] Sound toggle item functionality
  console.log('[Test 7] Testing sound toggle menu item...');
  // First right-click to open menu
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#companionDragSurface').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    })()`
  });
  await wait(100);
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const soundBtn = document.querySelector('#menuItemToggleSound');
      soundBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const saved = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
      return {
        soundSetting: saved.settings?.petInteractionSounds,
        toastVisible: !document.querySelector('#petToast').hidden,
        toastText: document.querySelector('#petToast').textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.soundSetting, false, 'Sounds should now be muted (false)');
  assert.ok(res.result.value.toastText.includes('كتم'), 'Toast should indicate muted sounds');
  console.log(`  ✓ Sound toggled to muted: "${res.result.value.toastText}"`);

  // Open menu again and toggle back
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#companionDragSurface').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    })()`
  });
  await wait(100);
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const soundBtn = document.querySelector('#menuItemToggleSound');
      soundBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const saved = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
      return {
        soundSetting: saved.settings?.petInteractionSounds,
        toastText: document.querySelector('#petToast').textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(res.result.value.soundSetting, true, 'Sounds should now be enabled (true)');
  assert.ok(res.result.value.toastText.includes('تشغيل'), 'Toast should indicate enabled sounds');
  console.log(`  ✓ Sound toggled back to enabled: "${res.result.value.toastText}"`);

  // [Test 8] Daily review item opens expanded view
  console.log('[Test 8] Daily review menu item opens expanded view...');
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#companionDragSurface').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    })()`
  });
  await wait(100);
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      const reviewBtn = document.querySelector('#menuItemDailyReview');
      reviewBtn.click();
      await new Promise(r => setTimeout(r, 100));
      return {
        bodyClasses: document.body.className,
        expandedHidden: document.querySelector('.expanded-view').hidden,
        title: document.querySelector('#checkinTitle').textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.ok(res.result.value.bodyClasses.includes('is-expanded'), 'Body must have is-expanded class');
  assert.equal(res.result.value.expandedHidden, false, 'Expanded view hidden must be false');
  console.log(`  ✓ Expanded view opened with title: "${res.result.value.title}"`);

  // Collapse back to idle
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#collapsePetButton').click();
    })()`
  });
  await wait(100);

  // [Test 9] Pressing Escape closes context menu
  console.log('[Test 9] Pressing Escape closes context menu...');
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#companionDragSurface').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    })()`
  });
  await wait(100);
  res = await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise(r => setTimeout(r, 100));
      return {
        bodyClasses: document.body.className,
        menuHidden: document.querySelector('#wensContextMenu').hidden
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.ok(res.result.value.bodyClasses.includes('is-idle'), 'Body must return to idle');
  assert.equal(res.result.value.menuHidden, true, 'Menu must be hidden');
  console.log('  ✓ Escape dismissed context menu cleanly.');

  // [Test 10] Capture visual verification screenshot of Context Menu
  console.log('[Test 10] Capturing visual screenshot of Custom Context Menu...');
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#companionDragSurface').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    })()`
  });
  await wait(200);
  const screenshotData = await sendCmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(browserTestOutput('companion-context-menu-verified.png'), Buffer.from(screenshotData.data, 'base64'));
  console.log('  ✓ Screenshot saved to output/companion-context-menu-verified.png');

  // [Test 11] Keyboard navigation: ArrowDown / ArrowUp cycles through menu items
  console.log('[Test 11] Testing keyboard ArrowDown / ArrowUp navigation in Context Menu...');
  res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      const activeId1 = document.activeElement?.id;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const activeId2 = document.activeElement?.id;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const activeId3 = document.activeElement?.id;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      const activeId4 = document.activeElement?.id;
      return { activeId1, activeId2, activeId3, activeId4 };
    })()`,
    returnByValue: true
  });
  const t11 = res.result.value;
  assert.equal(t11.activeId1, 'menuItemOpenMain', 'First item should be focused on open');
  assert.equal(t11.activeId2, 'menuItemShowIsland', 'ArrowDown should move focus to second item');
  assert.equal(t11.activeId3, 'menuItemDailyReview', 'ArrowDown should move focus to third item');
  assert.equal(t11.activeId4, 'menuItemShowIsland', 'ArrowUp should move focus back to second item');
  console.log(`  ✓ Keyboard arrow navigation works: [${t11.activeId1}] -> [${t11.activeId2}] -> [${t11.activeId3}] -> [${t11.activeId4}]`);

  // Dismiss menu with Escape
  await sendCmd('Runtime.evaluate', {
    expression: `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); })()`
  });
  await wait(100);

  // [Test 12] Expanded mode right-click: prevents default but does NOT collapse expanded view
  console.log('[Test 12] Right-click in expanded mode prevents default and preserves expanded view...');
  // First expand
  await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      document.querySelector('#companionDragSurface').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      await new Promise(r => setTimeout(r, 100));
      document.querySelector('#menuItemDailyReview').click();
      await new Promise(r => setTimeout(r, 100));
    })()`,
    awaitPromise: true
  });
  await wait(150);
  res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      window.dispatchEvent(evt);
      return {
        defaultPrevented: evt.defaultPrevented,
        bodyClasses: document.body.className,
        expandedHidden: document.querySelector('.expanded-view').hidden
      };
    })()`,
    returnByValue: true
  });
  const t12 = res.result.value;
  assert.equal(t12.defaultPrevented, true, 'Default browser menu must be prevented in expanded view');
  assert.ok(t12.bodyClasses.includes('is-expanded'), 'Body must remain in is-expanded mode');
  assert.equal(t12.expandedHidden, false, 'Expanded view must NOT be collapsed');
  console.log('  ✓ Expanded view preserved on right-click without browser menu!');

  // [Test 13] Strict 164x164 idle viewport verification (No clipping of .idle-tools, no empty .wens-mini-pill, no .wens-leaf on orb)
  console.log('[Test 13] Verifying strict 164x164 idle window bounds & non-overlap...');
  await sendCmd('Emulation.setDeviceMetricsOverride', {
    width: 164,
    height: 164,
    deviceScaleFactor: 2,
    mobile: false
  });
  await sendCmd('Runtime.evaluate', {
    expression: `(async () => {
      document.querySelector('#collapsePetButton').click();
      await new Promise(r => setTimeout(r, 200));
    })()`,
    awaitPromise: true
  });
  res = await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      const pill = document.querySelector('#companionMiniPill');
      const pillStyle = window.getComputedStyle(pill);
      const tools = document.querySelector('.idle-tools');
      const toolsDefaultOpacity = window.getComputedStyle(tools).opacity;
      const orbLeaf = document.querySelector('.avatar-orb .wens-leaf');
      const orbLeafDisplay = orbLeaf ? window.getComputedStyle(orbLeaf).display : 'none';

      // Simulate hover state on idleTools to measure bounding boxes at 164x164
      tools.classList.add('is-visible');
      const toolsRect = tools.getBoundingClientRect();
      const bodyRect = document.querySelector('.wens-body').getBoundingClientRect();
      const btnRects = Array.from(tools.querySelectorAll('button')).map(b => {
        const r = b.getBoundingClientRect();
        return { id: b.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
      return {
        pillHidden: pill.hidden,
        pillDisplay: pillStyle.display,
        toolsDefaultOpacity,
        orbLeafDisplay,
        toolsRect: { left: toolsRect.left, right: toolsRect.right, top: toolsRect.top, bottom: toolsRect.bottom, width: toolsRect.width, height: toolsRect.height },
        bodyRect: { left: bodyRect.left, right: bodyRect.right, top: bodyRect.top, bottom: bodyRect.bottom, width: bodyRect.width, height: bodyRect.height },
        btnRects
      };
    })()`,
    returnByValue: true
  });
  const t13 = res.result.value;
  assert.equal(t13.pillDisplay, 'none', 'Hidden #companionMiniPill must have display: none (no empty orange dot pill)');
  assert.equal(t13.toolsDefaultOpacity, '0', '.idle-tools must not stay stuck visible after returning to idle');
  assert.equal(t13.orbLeafDisplay, 'none', '.wens-leaf must be hidden on .avatar-orb');
  assert.ok(t13.toolsRect.left >= 0 && t13.toolsRect.right <= 164, `.idle-tools (${t13.toolsRect.left}..${t13.toolsRect.right}) must fit within 164px width without clipping`);
  assert.ok(t13.toolsRect.top >= 0 && t13.toolsRect.bottom <= t13.bodyRect.top, `.idle-tools bottom (${t13.toolsRect.bottom}) must not overlap .wens-body top (${t13.bodyRect.top})`);
  for (const b of t13.btnRects) {
    assert.ok(b.left >= 0 && b.right <= 164, `Button #${b.id} (${b.left}..${b.right}) must not clip horizontally in 164x164`);
  }
  console.log(`  ✓ 164x164 idle bounds verified: tools=[${t13.toolsRect.left.toFixed(1)}..${t13.toolsRect.right.toFixed(1)}, y=${t13.toolsRect.top.toFixed(1)}..${t13.toolsRect.bottom.toFixed(1)}], orb=[y=${t13.bodyRect.top.toFixed(1)}..${t13.bodyRect.bottom.toFixed(1)}]`);

  // Capture 164x164 hovered screenshot over dark purple gradient matching user's desktop
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      const toast = document.querySelector('#petToast');
      if (toast) toast.hidden = true;
      document.documentElement.style.background = 'linear-gradient(135deg, #6b11b4 0%, #3b0764 100%)';
    })()`
  });
  await wait(150);
  const idleHoverShot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(browserTestOutput('companion-164x164-hover-verified.png'), Buffer.from(idleHoverShot.data, 'base64'));

  // Remove hover class to capture clean 164x164 idle screenshot
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('.idle-tools').classList.remove('is-visible');
    })()`
  });
  await wait(200);
  const idleCleanShot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(browserTestOutput('companion-164x164-idle-verified.png'), Buffer.from(idleCleanShot.data, 'base64'));

  // Capture 164x164 idle orb over white/light grey background (matching user screenshot 2)
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.style.background = 'linear-gradient(180deg, #d1d5db 0%, #d1d5db 18%, #f3f4f6 18%, #e5e7eb 100%)';
    })()`
  });
  await wait(150);
  const orbWhiteBgShot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(browserTestOutput('companion-orb-white-bg-verified.png'), Buffer.from(orbWhiteBgShot.data, 'base64'));

  // Capture 360x245 peek mode over deep blue background (matching user screenshot 1)
  await sendCmd('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 245,
    deviceScaleFactor: 2,
    mobile: false
  });
  await sendCmd('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.style.background = 'linear-gradient(135deg, #07134a 0%, #0d2585 60%, #1d4ed8 100%)';
      const avatar = document.querySelector('#companionDragSurface');
      avatar.click();
    })()`
  });
  await wait(320);
  const peekBlueShot = await sendCmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(browserTestOutput('companion-peek-shadow-verified.png'), Buffer.from(peekBlueShot.data, 'base64'));
  console.log('  ✓ Captured 164x164 idle, hover, white-bg orb, and 360x245 peek shadow screenshots to output/');

  console.log('\n--- ALL CONTEXT MENU & CLICK INTERACTION TESTS PASSED (100%) ---');
} finally {
  await browser.close();
}
