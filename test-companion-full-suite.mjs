import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('--- Starting Comprehensive Companion Test Suite ---');

// 1. Inspect Files
const petHtml = fs.readFileSync('pet.html', 'utf8');
const petCss = fs.readFileSync('pet.css', 'utf8');
const libRs = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');

// 2. Structural & Architectural Invariants
console.log('[Test 1] Checking avatars & geometry...');
const avatars = ['orb', 'robot', 'cat', 'owl', 'crescent', 'sprout', 'lantern'];
avatars.forEach((avatar) => {
  assert.ok(petHtml.includes(`data-avatar="${avatar}"`), `Picker button for ${avatar} missing`);
});

// Crescent must NOT have plus/star symbols
assert.ok(!petHtml.includes('crescent-star'), 'Crescent should not contain .crescent-star element');
assert.ok(!petHtml.includes('star-point'), 'Crescent should not contain .star-point element');

// 3. Contrast & Legibility Over Light Backgrounds
console.log('[Test 2] Checking contrast & solid background on light wallpaper...');
assert.ok(petCss.includes('background: #111a22 !important;'), 'Compact bubble must have solid #111a22 background');
assert.ok(petCss.includes('body.is-peek .pet-shell'), 'Peek shell must override idle opacity');
assert.ok(petCss.includes('opacity: 1 !important;'), 'Must force 100% opacity on active events');
assert.ok(petCss.includes('color: #ffffff !important;'), 'Title must be pure white with high contrast');
assert.ok(petCss.includes('color: #fbbf24 !important;'), 'Kicker must be high-contrast gold');
assert.ok(petCss.includes('color: #f1f5f9 !important;'), 'Meta text must be bright high-contrast');

// 4. Compact Bubble Sizing & Alignment
console.log('[Test 3] Checking bubble sizing & bounds protection...');
assert.ok(!petCss.includes('.compact-bubble.size-large {\n  width: 310px;'), 'Size large must not force 310px width that overflows 360px window');
assert.ok(petCss.includes('.compact-bubble.align-left'), 'Must support align-left for near-screen-edge positioning');

// 5. Rust IPC Dispatch Verification
console.log('[Test 4] Verifying unified reminder dispatch in Rust lib.rs...');
assert.ok(libRs.includes('fn dispatch_reminder_event('), 'dispatch_reminder_event must be defined');
assert.ok(libRs.includes('pet_set_mode(app.clone(), "peek".to_string())'), 'Must trigger peek mode in dispatch');
const dispatch = libRs.slice(libRs.indexOf('fn dispatch_reminder_event('), libRs.indexOf('fn notification_send('));
assert.equal(dispatch.match(/tauri::Emitter::emit\(app, "wens-reminder", &payload\)/g)?.length, 1,
  'Desktop must send one reminder event');

console.log('\n--- Companion structure checks passed ---');
