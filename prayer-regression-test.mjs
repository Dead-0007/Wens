import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sources = ['app.js', 'pet.js', 'overlay.js'];
const sharedSource = fs.readFileSync('shared.js', 'utf8');
const cairoTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit'
});

function extractCalculator(path) {
  const source = fs.readFileSync(path, 'utf8');
  const start = source.indexOf('function calculatePrayerTimes(');
  assert.notEqual(start, -1, `${path}: calculatePrayerTimes is missing`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        const context = vm.createContext({
          Date,
          Math,
          window: { addEventListener() {} },
          state: {
            settings: {
              latitude: 30.0444,
              longitude: 31.2357,
              timeZone: 'Africa/Cairo',
              calcMethod: 'egypt',
              fajrOffset: 0,
              maghribOffset: 0,
              ishaOffset: 0
            }
          },
          getTimezoneOffsetHours: () => 3,
          timezoneOffsetHours: () => 3
        });
        vm.runInContext(sharedSource, context, { filename: 'shared.js' });
        return vm.runInContext(`(${source.slice(start, index + 1)})`, context, { filename: path });
      }
    }
  }
  throw new Error(`${path}: calculatePrayerTimes has an unterminated body`);
}

function cairoMinutes(date) {
  const fields = Object.fromEntries(cairoTime.formatToParts(date).map(({ type, value }) => [type, value]));
  return Number(fields.hour) * 60 + Number(fields.minute);
}

function calculatorOutput(path, calculate, day) {
  if (path === 'app.js') {
    const date = new Date(2026, 7, day);
    // Legacy produces host-local Date containers holding Cairo wall times.
    return Array.from(calculate(date, 30.0444, 31.2357, 3, 'egypt'), (time) =>
      time.getHours() * 60 + time.getMinutes()
    );
  }
  // The packaged widgets produce real instants from the selected city's day.
  const now = new Date(Date.UTC(2026, 7, day, 9));
  return Array.from(calculate(now), cairoMinutes);
}

const authority = [
  [275, 374, 781, 998, 1189, 1275], [276, 374, 781, 998, 1188, 1274],
  [277, 375, 781, 998, 1187, 1273], [278, 375, 781, 998, 1186, 1272],
  [279, 376, 781, 998, 1185, 1271], [280, 377, 781, 998, 1185, 1270],
  [281, 377, 781, 998, 1184, 1269], [282, 378, 781, 997, 1183, 1268],
  [283, 378, 780, 997, 1182, 1267], [284, 379, 780, 997, 1181, 1266],
  [284, 380, 780, 997, 1180, 1264], [285, 380, 780, 997, 1179, 1263],
  [286, 381, 780, 996, 1178, 1262], [287, 381, 780, 996, 1177, 1261],
  [288, 382, 779, 996, 1176, 1260], [289, 383, 779, 996, 1175, 1258],
  [290, 383, 779, 995, 1174, 1257], [291, 384, 779, 995, 1173, 1256],
  [291, 384, 779, 995, 1172, 1255], [292, 385, 778, 994, 1171, 1253],
  [293, 386, 778, 994, 1170, 1252], [294, 386, 778, 993, 1169, 1251],
  [295, 387, 778, 993, 1168, 1250], [295, 387, 777, 993, 1167, 1248],
  [296, 388, 777, 992, 1166, 1247], [297, 388, 777, 992, 1165, 1246],
  [298, 389, 776, 991, 1164, 1244], [299, 389, 776, 991, 1162, 1243],
  [299, 390, 776, 990, 1161, 1242], [300, 391, 776, 990, 1160, 1240],
  [301, 391, 775, 989, 1159, 1239]
];

const calculators = sources.map((path) => [path, extractCalculator(path)]);
for (const [path, calculate] of calculators) {
  authority.forEach((expected, dayIndex) => {
    const actual = calculatorOutput(path, calculate, dayIndex + 1);
    actual.forEach((minutes, prayerIndex) => {
      const drift = Math.abs(minutes - expected[prayerIndex]);
      assert.ok(
        drift <= 1,
        `${path}: 2026-08-${String(dayIndex + 1).padStart(2, '0')} prayer ${prayerIndex} drifted by ${drift} minutes`
      );
    });
  });
}

for (let dayIndex = 0; dayIndex < authority.length; dayIndex += 1) {
  const outputs = calculators.map(([path, calculate]) => calculatorOutput(path, calculate, dayIndex + 1));
  outputs.slice(1).forEach((output) => assert.deepEqual(output, outputs[0], 'UI prayer calculators diverged'));
}

console.log(`Prayer regression: ${sources.length} production calculators × 31 days × 6 times matched the official Cairo table.`);
