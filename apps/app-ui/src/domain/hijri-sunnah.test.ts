import { describe, it, expect } from 'vitest';
import { gregorianToHijri } from './hijri-calendar';
import { getUpcomingSunnahDays } from './sunnah-occasions';

describe('Authoritative Umm al-Qura Hijri Calendar', () => {
  it('correctly maps Jumada al-Ula 1448 AH dates for October 2026 without any drift', () => {
    // 1 Jumada al-Ula 1448 AH starts on Monday, October 12, 2026
    const oct12 = gregorianToHijri(new Date(2026, 9, 12));
    expect(oct12.year).toBe(1448);
    expect(oct12.month).toBe(5);
    expect(oct12.day).toBe(1);
    expect(oct12.monthName).toBe('جمادى الأولى');

    // Friday, October 23, 2026 is 12 Jumada al-Ula (NOT a White Day)
    const oct23 = gregorianToHijri(new Date(2026, 9, 23));
    expect(oct23.day).toBe(12);
    expect(oct23.month).toBe(5);

    // Saturday, October 24, 2026 is 13 Jumada al-Ula (Day 1 of White Days)
    const oct24 = gregorianToHijri(new Date(2026, 9, 24));
    expect(oct24.day).toBe(13);
    expect(oct24.month).toBe(5);

    // Sunday, October 25, 2026 is 14 Jumada al-Ula (Day 2 of White Days)
    const oct25 = gregorianToHijri(new Date(2026, 9, 25));
    expect(oct25.day).toBe(14);
    expect(oct25.month).toBe(5);

    // Monday, October 26, 2026 is 15 Jumada al-Ula (Day 3 of White Days)
    const oct26 = gregorianToHijri(new Date(2026, 9, 26));
    expect(oct26.day).toBe(15);
    expect(oct26.month).toBe(5);
  });
});

describe('Sunnah Occasions - White Days Schedule Integrity', () => {
  it('correctly identifies upcoming White Days on Friday, October 23, 2026', () => {
    const friday = new Date(2026, 9, 23, 10, 0, 0);
    const result = getUpcomingSunnahDays(friday, 0);

    expect(result.whiteDays.isCurrent).toBe(false);
    expect(result.whiteDays.startDateStr).toBe('2026-10-24');
    expect(result.whiteDays.endDateStr).toBe('2026-10-26');
    expect(result.whiteDays.diffDays).toBe(1);
    expect(result.whiteDays.countdown).toBe('غدًا (متبقي يوم واحد)');

    const items = result.whiteDays.items;
    expect(items).toHaveLength(3);

    // Day 1: Saturday 2026-10-24
    expect(items[0].dateStr).toBe('2026-10-24');
    expect(items[0].hijriDay).toBe(13);
    expect(items[0].isToday).toBe(false);
    expect(items[0].isPassed).toBe(false);
    expect(items[0].countdown).toBe('غدًا (متبقي يوم واحد)');

    // Day 2: Sunday 2026-10-25
    expect(items[1].dateStr).toBe('2026-10-25');
    expect(items[1].hijriDay).toBe(14);
    expect(items[1].isToday).toBe(false);
    expect(items[1].isPassed).toBe(false);

    // Day 3: Monday 2026-10-26
    expect(items[2].dateStr).toBe('2026-10-26');
    expect(items[2].hijriDay).toBe(15);
    expect(items[2].isToday).toBe(false);
    expect(items[2].isPassed).toBe(false);
  });

  it('correctly displays White Days when active on Saturday, October 24, 2026 at any time of day', () => {
    // Test morning, afternoon, evening (18:27), and night
    const testHours = [0, 8, 14, 18, 23];

    for (const h of testHours) {
      const saturday = new Date(2026, 9, 24, h, 27, 0);
      const result = getUpcomingSunnahDays(saturday, 0);

      expect(result.whiteDays.isCurrent).toBe(true);
      expect(result.whiteDays.currentDayNumber).toBe(1);
      expect(result.whiteDays.startDateStr).toBe('2026-10-24');
      expect(result.whiteDays.endDateStr).toBe('2026-10-26');

      const items = result.whiteDays.items;
      // Day 1: MUST BE TODAY, NOT PASSED!
      expect(items[0].dateStr).toBe('2026-10-24');
      expect(items[0].hijriDay).toBe(13);
      expect(items[0].diffDays).toBe(0);
      expect(items[0].isToday).toBe(true);
      expect(items[0].isPassed).toBe(false);
      expect(items[0].countdown).toBe('اليوم هو موعد الصيام!');

      // Day 2: Sunday
      expect(items[1].dateStr).toBe('2026-10-25');
      expect(items[1].hijriDay).toBe(14);
      expect(items[1].diffDays).toBe(1);
      expect(items[1].isToday).toBe(false);
      expect(items[1].isPassed).toBe(false);
      expect(items[1].countdown).toBe('غدًا (متبقي يوم واحد)');

      // Day 3: Monday
      expect(items[2].dateStr).toBe('2026-10-26');
      expect(items[2].hijriDay).toBe(15);
      expect(items[2].diffDays).toBe(2);
      expect(items[2].isToday).toBe(false);
      expect(items[2].isPassed).toBe(false);
      expect(items[2].countdown).toBe('متبقي يومان');
    }
  });

  it('correctly tracks progress on Sunday, October 25, 2026 (Day 2)', () => {
    const sunday = new Date(2026, 9, 25, 12, 0, 0);
    const result = getUpcomingSunnahDays(sunday, 0);

    expect(result.whiteDays.isCurrent).toBe(true);
    expect(result.whiteDays.currentDayNumber).toBe(2);

    const items = result.whiteDays.items;
    // Day 1: Saturday is now passed
    expect(items[0].isPassed).toBe(true);
    expect(items[0].countdown).toBe('مضى');

    // Day 2: Sunday is today!
    expect(items[1].isToday).toBe(true);
    expect(items[1].isPassed).toBe(false);
    expect(items[1].countdown).toBe('اليوم هو موعد الصيام!');

    // Day 3: Monday is tomorrow
    expect(items[2].isToday).toBe(false);
    expect(items[2].isPassed).toBe(false);
    expect(items[2].countdown).toBe('غدًا (متبقي يوم واحد)');
  });

  it('correctly tracks Day 3 on Monday, October 26, 2026 and transitions after 18:00', () => {
    // 14:00 on Monday: Day 3 active
    const mondayAfternoon = new Date(2026, 9, 26, 14, 0, 0);
    const resAfternoon = getUpcomingSunnahDays(mondayAfternoon, 0);
    expect(resAfternoon.whiteDays.isCurrent).toBe(true);
    expect(resAfternoon.whiteDays.currentDayNumber).toBe(3);
    expect(resAfternoon.whiteDays.items[0].isPassed).toBe(true);
    expect(resAfternoon.whiteDays.items[1].isPassed).toBe(true);
    expect(resAfternoon.whiteDays.items[2].isToday).toBe(true);
    expect(resAfternoon.whiteDays.items[2].countdown).toBe('اليوم هو موعد الصيام!');

    // 19:30 on Monday (after sunset/fast completed): transitions to next month
    const mondayEvening = new Date(2026, 9, 26, 19, 30, 0);
    const resEvening = getUpcomingSunnahDays(mondayEvening, 0);
    expect(resEvening.whiteDays.isCurrent).toBe(false);
    expect(resEvening.whiteDays.monthName).toBe('جمادى الآخرة');
  });

  it('correctly respects explicit manual hijri offset in settings when configured by user', () => {
    const saturday = new Date(2026, 9, 24, 12, 0, 0);
    // Baseline offset 0
    const h0 = gregorianToHijri(saturday, 0);
    expect(h0.day).toBe(13);

    // User explicitly sets +1 day offset
    const hPlus1 = gregorianToHijri(saturday, 1);
    expect(hPlus1.day).toBe(14);

    // User explicitly sets -1 day offset
    const hMinus1 = gregorianToHijri(saturday, -1);
    expect(hMinus1.day).toBe(12);
  });

  it('recognizes Tashreeq days and Eid holidays appropriately', () => {
    // Tashreeq days: 11, 12, 13 Dhul-Hijjah 1447 AH
    // In 1447 AH, 1 Dhul-Hijjah is 2026-05-18. 11 Dhul-Hijjah is 2026-05-28
    const tashreeqDay1 = new Date(2026, 4, 28, 12, 0, 0);
    const hTashreeq = gregorianToHijri(tashreeqDay1, 0);
    expect(hTashreeq.month).toBe(12);
    expect(hTashreeq.day).toBe(11);

    const resTashreeq = getUpcomingSunnahDays(tashreeqDay1, 0);
    const tashreeqOccasion = resTashreeq.religiousHolidays.items.find(it => it.id === 'tashreeq_days');
    expect(tashreeqOccasion).toBeDefined();
    expect(tashreeqOccasion?.isToday).toBe(true);
  });
});
