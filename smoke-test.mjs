import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const port = 4187;
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, WENS_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await wait(180);
  const html = await fetch(`http://127.0.0.1:${port}/`).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  });
  const [css, js, petHtml, petCss, petJs, overlayHtml, overlayCss, overlayJs, tauriConfig, tauriMain, tauriLib, tauriStorage, desktopSync, coreDb, coreSchema, moduleRuntime, vnextMain, moduleSchema, syncSchema, workspaceCargo, coreLan, coreSync, corePrayer, packageJson, androidBuildScript, androidReadme] = await Promise.all([readFile(new URL('./styles.css', import.meta.url), 'utf8'), readFile(new URL('./app.js', import.meta.url), 'utf8'), readFile(new URL('./pet.html', import.meta.url), 'utf8'), readFile(new URL('./pet.css', import.meta.url), 'utf8'), readFile(new URL('./pet.js', import.meta.url), 'utf8'), readFile(new URL('./overlay.html', import.meta.url), 'utf8'), readFile(new URL('./overlay.css', import.meta.url), 'utf8'), readFile(new URL('./overlay.js', import.meta.url), 'utf8'), readFile(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'), readFile(new URL('./src-tauri/src/main.rs', import.meta.url), 'utf8'), readFile(new URL('./src-tauri/src/lib.rs', import.meta.url), 'utf8'), readFile(new URL('./src-tauri/src/storage.rs', import.meta.url), 'utf8'), readFile(new URL('./sync-desktop-assets.mjs', import.meta.url), 'utf8'), readFile(new URL('./crates/core-rust/src/database.rs', import.meta.url), 'utf8'), readFile(new URL('./crates/core-rust/src/schema_v2.sql', import.meta.url), 'utf8'), readFile(new URL('./crates/module-runtime/src/lib.rs', import.meta.url), 'utf8'), readFile(new URL('./apps/app-ui/src/main.tsx', import.meta.url), 'utf8'), readFile(new URL('./contracts/module-manifest-v1.schema.json', import.meta.url), 'utf8'), readFile(new URL('./contracts/sync-envelope-v1.schema.json', import.meta.url), 'utf8'), readFile(new URL('./Cargo.toml', import.meta.url), 'utf8'), readFile(new URL('./crates/core-rust/src/lan.rs', import.meta.url), 'utf8'), readFile(new URL('./crates/core-rust/src/sync.rs', import.meta.url), 'utf8'), readFile(new URL('./crates/core-rust/src/prayer.rs', import.meta.url), 'utf8'), readFile(new URL('./package.json', import.meta.url), 'utf8'), readFile(new URL('./scripts/build-android-debug.ps1', import.meta.url), 'utf8'), readFile(new URL('./apps/android-shell/README.md', import.meta.url), 'utf8')]);
  const tauriSource = `${tauriMain}\n${tauriLib}`;
  const nativeReminderHandler = js.match(/function handleNativeReminder\(reminder\) \{[\s\S]*?\n\}/)?.[0] || '';
  const parsedTauri = JSON.parse(tauriConfig);
  const checks = [
    ['RTL document', html.includes('dir="rtl"')],
    ['Prayer view', html.includes('data-view-panel="prayer"')],
    ['Fasting view', html.includes('data-view-panel="fasting"')],
    ['Optional connectors', html.includes('الموصلات الاختيارية')],
    ['Desktop connector detection', js.includes('detectConnectorStatuses') && tauriSource.includes('connector_status')],
    ['Strict offline mode', js.includes('strictOffline') && js.includes('الوضع الصارم مفعّل')],
    ['Desktop SQLite compatibility bridge', js.includes('hydrateDesktopStorage') && tauriSource.includes('storage::storage_load') && tauriStorage.includes('legacy_snapshot')],
    ['Normalized SQLite v2 domains', ['projects', 'tasks', 'ideas', 'prayer_logs', 'fasting_entries', 'work_sessions', 'marketing_entries', 'modules', 'devices', 'change_journal'].every((table) => coreSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`))],
    ['Transactional 0.3 migration and rollback', (coreDb.includes('connection.transaction()') || coreDb.includes('transaction_with_behavior(TransactionBehavior::Immediate)')) && coreDb.includes('verify_counts') && coreDb.includes('wens-legacy-root-') && coreDb.includes('transaction.commit()')],
    ['Typed domain IPC', ['bootstrap_get', 'project_create', 'idea_create', 'prayer_day'].every((command) => tauriSource.includes(command))],
    ['Rust workspace boundaries', ['crates/core-rust', 'crates/module-runtime', 'src-tauri'].every((member) => workspaceCargo.includes(member))],
    ['System tray icon and test action', tauriSource.includes('TrayIconBuilder') && tauriSource.includes('default_window_icon') && tauriSource.includes('tray_builder.icon(icon.clone())') && tauriSource.includes('اختبر التنبيه الآن')],
    ['Desktop tray minimize and close protection', tauriSource.includes('WindowEvent::CloseRequested') && tauriSource.includes('api.prevent_close()') && tauriSource.includes('open_or_focus_main') && tauriSource.includes('on_tray_icon_event') && tauriSource.includes('وِنس مستمر في الخلفية')],
    ['Native Windows notification command', tauriSource.includes('tauri_plugin_notification::init') && tauriSource.includes('fn notification_send') && js.includes("invoke('notification_send'") && petJs.includes("invoke('notification_send'")],
    ['Background reminder scheduler', tauriSource.includes('struct ReminderScheduler') && tauriSource.includes('fn reminder_plan_update') && tauriSource.includes('fn start_reminder_scheduler') && tauriSource.includes('wens-reminder')],
    ['Prayer and fasting native reminder plan', js.includes('syncNativeReminderPlan') && js.includes('fasting-evening') && js.includes('fasting-suhoor') && js.includes('catchUpMs') && js.includes('REQUIRED_PRAYER_INDEXES = [0, 2, 3, 4, 5]')],
    ['Repeated obligatory-prayer reminder cadence', [60, 30, 15, 10, 5].every((minutes) => js.includes(`minutes: ${minutes},`)) && js.includes('PRAYER_REMINDER_LEADS.forEach') && js.includes('prayer-prepare-${minutes}') && js.includes('أذان ${prayerName} — دخل وقت الصلاة') && html.includes('تنبيهات متكررة: ٦٠، ٣٠، ١٥، ١٠، ٥ دقائق')],
    ['Sunrise is optional and never a wake reminder', js.includes("['الشروق', 'نافلة لو إنت صاحي · بلا تنبيه'") && petJs.includes('function checklistPrayerIndexes') && petJs.includes('now >= prayerTimes[1] && now < prayerTimes[2]') && petJs.includes('نافلة اختيارية لو أنت صاحي')],
    ['No obsolete Tauri notification namespace', !`${js}\n${petJs}`.includes('__TAURI__?.notification')],
    ['Always-on-top floating companion', tauriSource.includes('WebviewUrl::App("pet.html"') && tauriSource.includes('.always_on_top(true)') && tauriSource.includes('fn ensure_pet_window') && petHtml.includes('id="petShell"')],
    ['Interactive daily accountability', petHtml.includes('data-prayer-answer') && petHtml.includes('data-fasting-answer') && petHtml.includes('id="workNote"') && petJs.includes('function participation')],
    ['Daily completion checklist', petHtml.includes('id="prayerChecklist"') && petHtml.includes('id="dailyTaskList"') && petJs.includes('function togglePrayer') && petJs.includes('function toggleDailyTask') && petCss.includes('.prayer-check.done') && petCss.includes('.daily-task.done')],
    ['Floating work stopwatch', petHtml.includes('id="timerToggleButton"') && petJs.includes('function timerElapsed') && petJs.includes('workSessions')],
    ['Online weather with offline cache and manual economy', html.includes('id="weatherTemperature"') && html.includes('id="economyAssessment"') && html.includes('data-action="weather-refresh"') && html.includes('id="contextUpdateModal"') && js.includes('function refreshOnlineWeather') && js.includes('function renderLocalContext') && js.includes('function saveLocalContext') && js.includes('function weatherAssessment')],
    ['Local context history and trends', js.includes('localContext.history') && js.includes('function trendFor') && js.includes("slice(-90)") && petJs.includes('function localContextSummary')],
    ['Centered prayer overlay widget', overlayHtml.includes('id="nextPrayerName"') && overlayHtml.includes('id="wuduTime"') && overlayHtml.includes('id="followingPrayerName"') && overlayJs.includes('function upcomingPrayers') && tauriSource.includes('WebviewUrl::App("overlay.html"') && tauriSource.includes('overlay_set_visible')],
    ['True transparent overlay surfaces', overlayHtml.includes('class="overlay-card"') && overlayCss.includes('html, body') && overlayCss.includes('background: transparent') && tauriSource.includes('.inner_size(184.0, 28.0)') && tauriSource.includes('.shadow(false)')],
    ['On-demand floating companion bubble', petHtml.includes('id="eventBubble"') && petCss.includes('body.is-peek .compact-bubble') && petCss.includes('body.is-idle .expanded-view') && petJs.includes("setPetMode('peek'") && tauriSource.includes('.inner_size(164.0, 164.0)')],
    ['Original Wens companion identity', petHtml.includes('class="wens-body"') && petHtml.includes('class="wens-leaf"') && petCss.includes('.wens-face') && html.includes('class="room-wens"') && css.includes('.companion-wens') && !`${petHtml}\n${html}`.includes('&gt;_')],
    ['Draggable companion with position-preserving modes', petHtml.includes('id="companionDragSurface"') && petJs.includes("invoke('pet_start_dragging')") && tauriSource.includes('fn pet_start_dragging') && tauriSource.includes('resize_pet_preserving_anchor') && tauriSource.includes('"peek" => (360.0, 245.0)')],
    ['Event-driven reminder reveal', petJs.includes('function prayerWatch') && petJs.includes('activeReminder') && petJs.includes("await setPetMode('peek'") && petCss.includes('body.has-event .event-dot')],
    ['Compositor-safe progress motion', petCss.includes('transition: transform 280ms') && petJs.includes('style.transform = `scaleX(')],
    ['Configurable wudu lead time', js.includes('wuduLeadMinutes') && js.includes('data-overlay-widget') && overlayJs.includes('wuduLeadMinutes') && overlayJs.includes('wuduAt')],
    ['Pet and main state synchronization', petJs.includes("new BroadcastChannel(CHANNEL_NAME)") && js.includes("new BroadcastChannel('wens-state')") && tauriSource.includes('pet_set_mode')],
    ['Notification center popover', html.includes('id="notificationPopover"') && js.includes('toggleNotificationPopover') && js.includes('renderNotificationPopover')],
    ['Companion popup demo', html.includes('data-action="demo-popup"') && js.includes('showCompanionPopup') && js.includes('demoPopupExperience')],
    ['Delight motion with reduced mode', css.includes('pet-burst') && css.includes('companion-popup') && css.includes('prefers-reduced-motion')],
    ['Single instance scaffold', tauriSource.includes('tauri_plugin_single_instance::init') && tauriSource.includes('set_focus')],
    ['Connector staging preview', js.includes('openConnectorStage') && js.includes('showConnectorPreview') && js.includes('permissions')],
    ['Connector run and cancel', js.includes("invoke('connector_run'") && js.includes("invoke('connector_cancel'") && tauriSource.includes('fn connector_run') && tauriSource.includes('fn connector_cancel')],
    ['Connector import approval', js.includes('showConnectorResult') && js.includes('data-result-action="import"') && js.includes("status = 'imported'")],
    ['Connector read-only guard', tauriSource.includes('--sandbox') && tauriSource.includes('read-only') && js.includes('strictOffline')],
    ['Safe data-only wenspack runtime', moduleRuntime.includes('ModuleManifest') && moduleRuntime.includes('HashMismatch') && moduleRuntime.includes('UnsafePath') && moduleRuntime.includes('ExecutableContent') && moduleRuntime.includes('install_package') && moduleRuntime.includes('rollback_package') && tauriSource.includes('module_preview') && tauriSource.includes('module_install') && tauriSource.includes('module_rollback')],
    ['Offline sync conflict foundation', coreDb.includes('change_journal') && coreDb.includes('revision') && moduleRuntime.length > 0 && (await readFile(new URL('./crates/core-rust/src/sync.rs', import.meta.url), 'utf8')).includes('HybridLogicalClock')],
    ['Encrypted LAN transport foundation', coreLan.includes('EncryptedFrame') && coreLan.includes('TcpStream') && coreLan.includes('MAX_FRAME_BYTES') && coreSync.includes('SyncCrypto') && coreSync.includes('PairingPayload')],
    ['Public v1 contracts', JSON.parse(moduleSchema).title === 'ModuleManifest v1' && JSON.parse(syncSchema).title === 'SyncEnvelope v1'],
    ['React TypeScript vNext navigation', ['today', 'worship', 'work', 'projects', 'ideas', 'studio', 'history', 'devices', 'modules', 'settings'].every((view) => vnextMain.includes(`id:'${view}'`)) && vnextMain.includes('event.ctrlKey') && vnextMain.includes('CommandPalette')],
    ['Reduced motion', css.includes('prefers-reduced-motion')],
    ['Local persistence', js.includes('wens-local-v1')],
    ['Local Hijri calendar', js.includes('gregorianToHijri') && js.includes('hijriMonths')],
    ['Fasting reminders', js.includes('maybeNotifyFasting') && js.includes('lastFastingEvent')],
    ['Cairo DST-aware prayer times', js.includes("timeZone: 'Africa/Cairo'") && js.includes('getTimezoneOffsetHours') && js.includes('getConfiguredTimezoneOffset')],
    ['Egypt prayer method uses distinct Isha angle', js.includes('fajrAngle: 19.5, ishaAngle: 17.5') && petJs.includes('fajrAngle: 19.5, ishaAngle: 17.5') && overlayJs.includes('fajrAngle: 19.5, ishaAngle: 17.5') && corePrayer.includes('IshaRule::Angle(17.5)')],
    ['Backup restore', js.includes('backupData') && js.includes('restoreData') && js.includes('wens-backup.json')],
    ['Monthly prayer table', html.includes('data-action="month-prayer"') && js.includes('openMonthlyPrayer')],
    ['Project current task', html.includes('newProjectTask') && js.includes('currentTask')],
    ['Creative tools', ['openBriefTool', 'openMatrixTool', 'openStoryboardTool'].every((name) => js.includes(name))],
    ['Campaign metrics', js.includes('openMetricsTool') && js.includes('calculateMetrics') && html.includes('data-action="metrics"')],
    ['No browser prompt', !/\b(?:window\.)?prompt\s*\(/.test(js)],
    ['Network access is restricted by strict offline-first CSP', tauriConfig.includes("connect-src 'self'") && tauriConfig.includes('https://*.qurango.net') && tauriConfig.includes('https://*.radiojar.com') && !/\b(XMLHttpRequest|WebSocket)\s*\(/.test(`${js}\n${petJs}\n${overlayJs}`)],
    ['Location search and permission fallback', html.includes('id="locationSearchInput"') && html.includes('data-action="location-device"') && js.includes('navigator.geolocation.getCurrentPosition') && js.includes('function searchLocations') && js.includes('function applySelectedLocation')],
    ['Today unified review hub', html.includes('data-view-panel="today"') && js.includes('renderTodayView') && html.includes('id="todayPrayerChecklist"') && html.includes('id="todayTimerDisplay"')],
    ['Today hub is the migrated default', js.includes('uiSchemaVersion: 9') && js.includes("merged.view = 'today'") && js.includes("switchView(state.view || 'today')")],
    ['Single native reminder presentation policy', nativeReminderHandler.includes('notificationInbox') && !nativeReminderHandler.includes('showToast(') && !nativeReminderHandler.includes('showCompanionPopup(') && !nativeReminderHandler.includes('setPetMessage(')],
    ['No automatic startup companion popup', !js.includes('maybeShowDailyCompanionPopup') && !js.includes('setTimeout(maybeShowDailyCompanionPopup')],
    ['Unified fasting and focus accountability', js.includes("state.fasting.today = status === 'yes'") && js.includes("source: 'focus-session'") && js.includes('day.focusedMs =')],
    ['Seed demo content migration', js.includes('seededProjects') && js.includes('seededIdeas') && js.includes('merged.projects =') && js.includes('merged.ideas =')],
    ['Missed-prayer review section', html.includes('id="prayerBacklogList"') && html.includes('id="prayerBacklogForm"') && js.includes('renderPrayerBacklog')],
    ['Automatic unconfirmed prayer tracking', js.includes('reconcilePrayerBacklog') && js.includes("status: status === 'missed' ? 'missed' : 'unconfirmed'") && js.includes('prayerWindowEndsAt')],
    ['Missed prayer resolution states', js.includes("action === 'made-up'") && js.includes("day.prayers[item.prayerName] = 'made-up'") && petJs.includes('prayerIsComplete')],
    ['Dedicated missed worship view', html.includes('data-view="missed"') && html.includes('data-view-panel="missed"') && html.includes('id="missedNavCount"')],
    ['Isha day-rollover review', js.includes("reason: isIshaCarryOver && !windowEnded ? 'day-rollover' : 'window-ended'") && js.includes('وقت العشاء ما زال ممتدًا للفجر')],
    ['Direct prayer completion and missed actions', js.includes('data-prayer-status="done"') && js.includes('data-prayer-status="missed"') && js.includes('setPrayerStatusForDate')],
    ['Missed fasting review and resolution', html.includes('id="fastingBacklogForm"') && js.includes('reconcileFastingBacklog') && js.includes('updateFastingBacklogItem')],
    ['Configurable Quran ward', html.includes('id="quranEnabled"') && html.includes('id="quranTarget"') && js.includes('QURAN_TARGET_LABELS') && js.includes('toggleQuranToday')],
    ['Configurable daily adhkar', html.includes('id="adhkarEnabled"') && html.includes('data-adhkar-group="morning"') && js.includes('ADHKAR_GROUPS') && js.includes('toggleAdhkarToday')],
    ['Weekly worship completion calendar', html.includes('id="weeklyWorshipDays"') && js.includes('worshipDayProgress') && js.includes('renderWeeklyWorship')],
    ['Upcoming Islamic occasions and reminders', html.includes('id="occasionsList"') && js.includes('islamicOccasionsForDate') && js.includes("kind: 'islamic-occasion'")],
    ['Developer-published challenge catalog', html.includes('data-view-panel="challenges"') && html.includes('id="challengeBuilderForm"') && js.includes('normalizeChallengeDefinition') && js.includes('publishChallengeFromForm')],
    ['Challenge progress, completion, and dismissal', html.includes('id="activeChallengeList"') && js.includes('function progressChallenge') && js.includes("enrollment.status = 'completed'") && js.includes("enrollment.status = 'dismissed'")],
    ['Optional challenge duration and safe data export', js.includes("label: 'بدون مدة'") && js.includes("format: 'wens-challenge'") && js.includes('.wenschallenge.json') && js.includes("payload?.format !== 'wens-challenge'")],
    ['Challenge feature can be enabled or paused', html.includes('id="challengesEnabled"') && html.includes('id="challengeDisabledState"') && js.includes('function setChallengesEnabled') && js.includes('تقدمك القديم محفوظ')],
    ['User-created personal challenges', html.includes('id="personalChallengeForm"') && js.includes('function createPersonalChallenge') && js.includes("'user'")],
    ['Local random challenge sources and weekly opt-in', html.includes('name="randomSource"') && html.includes('id="challengeRandomAuto"') && js.includes('LOCAL_RANDOM_CHALLENGE_TEMPLATES') && js.includes('function generateRandomChallenge') && js.includes('function maybeGenerateWeeklyRandomChallenge')],
    ['Offline Qibla compass', html.includes('id="qiblaAngle"') && js.includes('calculateQiblaBearing') && js.includes('renderQibla')],
    ['Creative drafts vault', html.includes('id="studioVaultModal"') && html.includes('data-action="open-vault"') && js.includes('openStudioVault') && js.includes('copyVaultItem') && js.includes('deleteVaultItem')],
    ['Dynamic weekly rhythm engine', html.includes('id="weekBars"') && html.includes('id="weekTotal"') && js.includes('renderWeekRhythm')],
    ['Interactive project filters', html.includes('data-filter="all"') && html.includes('data-filter="in-progress"') && js.includes('projectFilter')],
    ['Tauri shell config', parsedTauri.identifier === 'com.wens.offline' && parsedTauri.build?.devUrl === 'http://127.0.0.1:4179' && parsedTauri.build?.frontendDist === '../dist-vnext'],
    ['Desktop asset sync', ['pet.html', 'pet.css', 'pet.js', 'overlay.html', 'overlay.css', 'overlay.js'].every((file) => desktopSync.includes(file))],
    ['Android debug build path', packageJson.includes('build:android:debug') && androidBuildScript.includes('assembleArm64Debug') && androidBuildScript.includes('rustBuildArm64Debug') && androidReadme.includes('src-tauri/gen/android')],
    ['Shared utilities module', (await readFile(new URL('./shared.js', import.meta.url), 'utf8')).includes('WensShared') && html.includes('<script src="shared.js"></script>') && petHtml.includes('<script src="shared.js"></script>')]
  ];
  const failed = checks.filter(([, pass]) => !pass);
  for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (failed.length) process.exitCode = 1;
} finally {
  child.kill();
}
