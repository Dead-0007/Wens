import {
  formatArabicDigits,
  toLocalDateString,
  formatArabicDateDisplay,
  formatDiffDaysToCountdown,
  formatArLongWeekday,
} from './formatters';
import { gregorianToHijri } from './hijri-calendar';

export interface MajorOccasionItem {
  id: string;
  name: string;
  hijriDateStr: string;
  date: Date;
  dateStr: string;
  formattedDate: string;
  dayName?: string;
  diffDays: number;
  countdownText: string;
  isToday: boolean;
  virtue?: string;
}

export interface ReligiousHolidayItem {
  id: string;
  name: string;
  category: 'eid' | 'prophetic' | 'blessed_night' | 'general';
  categoryLabel: string;
  virtue: string;
  recommendedDeed: string;
  hijriDateStr: string;
  date: Date;
  dateStr: string;
  formattedDate: string;
  dayName?: string;
  diffDays: number;
  countdownText: string;
  isToday: boolean;
}

export interface WhiteDayItem {
  dayNumber: number; // 1, 2, 3
  dayLabel: string; // e.g. "اليوم الأول (١٣)"
  hijriDay: number; // 13, 14, 15
  hijriMonthName: string;
  hijriDateStr: string; // e.g. "١٣ ربيع الثاني"
  date: Date;
  dateStr: string; // "YYYY-MM-DD"
  formattedDate: string; // e.g. "السبت، ٢٤ أكتوبر ٢٠٢٦"
  dayName: string; // e.g. "السبت"
  diffDays: number;
  countdown: string;
  isToday: boolean;
  isPassed: boolean;
}

export interface SunnahFastingInfo {
  nextMonday: {
    date: Date;
    dateStr: string;
    formattedDate: string;
    dayName?: string;
    hijriDateStr?: string;
    isToday: boolean;
    diffDays: number;
    countdown: string;
  };
  nextThursday: {
    date: Date;
    dateStr: string;
    formattedDate: string;
    dayName?: string;
    hijriDateStr?: string;
    isToday: boolean;
    diffDays: number;
    countdown: string;
  };
  nearestFast: {
    name: string;
    date: Date;
    dateStr: string;
    formattedDate: string;
    dayName?: string;
    hijriDateStr?: string;
    diffDays: number;
    countdown: string;
    isToday: boolean;
  };
  whiteDays: {
    days: number[];
    monthName: string;
    isCurrent: boolean;
    currentDayNumber?: number;
    startDate: Date;
    endDate: Date;
    startDateStr: string;
    endDateStr: string;
    formattedStartDate: string;
    formattedEndDate: string;
    diffDays: number;
    countdown: string;
    items: WhiteDayItem[];
  };
  majorOccasions: {
    nearest: MajorOccasionItem;
    items: MajorOccasionItem[];
  };
  religiousHolidays: {
    nearest: ReligiousHolidayItem;
    items: ReligiousHolidayItem[];
  };
}

export function getUpcomingSunnahDays(
  fromDate: Date = new Date(),
  hijriOffset: number = 0
): SunnahFastingInfo {
  const now = new Date(fromDate);
  now.setHours(0, 0, 0, 0);
  const currentDayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, 4 = Thu

  // Next Monday
  const monDelta = currentDayOfWeek === 1 ? 0 : (1 - currentDayOfWeek + 7) % 7;
  const monDate = new Date(now);
  monDate.setDate(now.getDate() + (monDelta === 0 && fromDate.getHours() >= 18 ? 7 : monDelta));

  // Next Thursday
  const thuDelta = currentDayOfWeek === 4 ? 0 : (4 - currentDayOfWeek + 7) % 7;
  const thuDate = new Date(now);
  thuDate.setDate(now.getDate() + (thuDelta === 0 && fromDate.getHours() >= 18 ? 7 : thuDelta));

  const isMonToday = monDate.getTime() === now.getTime();
  const isThuToday = thuDate.getTime() === now.getTime();

  const monDiffDays = Math.round((monDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const thuDiffDays = Math.round((thuDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const monHijri = gregorianToHijri(monDate, hijriOffset);
  const thuHijri = gregorianToHijri(thuDate, hijriOffset);
  const digits = formatArabicDigits;
  const monHijriDateStr = `${digits(monHijri.day)} ${monHijri.monthName}`;
  const thuHijriDateStr = `${digits(thuHijri.day)} ${thuHijri.monthName}`;

  const monFormattedDate = formatArabicDateDisplay(monDate);
  const thuFormattedDate = formatArabicDateDisplay(thuDate);

  const hijri = gregorianToHijri(now, hijriOffset);
  const isWhiteDayNow = [13, 14, 15].includes(hijri.day) && !(hijri.day === 15 && fromDate.getHours() >= 18);

  let whiteStartDate: Date;
  let whiteEndDate: Date;
  let whiteMonthName: string;
  let whiteDiffDays: number;
  let whiteCountdown: string;
  let currentDayNumber: number | undefined;

  if (isWhiteDayNow) {
    currentDayNumber = hijri.day - 12; // 13 -> 1, 14 -> 2, 15 -> 3
    whiteMonthName = hijri.monthName;
    const diffTo13 = hijri.day - 13;
    whiteStartDate = new Date(now);
    whiteStartDate.setDate(now.getDate() - diffTo13);
    whiteEndDate = new Date(whiteStartDate);
    whiteEndDate.setDate(whiteStartDate.getDate() + 2);
    whiteDiffDays = 0;
    const dayLabels = ['الأول', 'الثاني', 'الثالث'];
    whiteCountdown = `جارية الآن! (اليوم ${dayLabels[currentDayNumber - 1] || 'الأول'} من الأيام البيض)`;
  } else {
    // Scan forward up to 35 days to find the next 13th day
    let target13 = new Date(now);
    let targetMonth = hijri.monthName;
    for (let i = 1; i <= 35; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const h = gregorianToHijri(d, hijriOffset);
      if (h.day === 13) {
        target13 = d;
        targetMonth = h.monthName;
        break;
      }
    }
    whiteStartDate = target13;
    whiteEndDate = new Date(target13);
    whiteEndDate.setDate(target13.getDate() + 2);
    whiteMonthName = targetMonth;
    whiteDiffDays = Math.round((whiteStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    whiteCountdown = formatDiffDaysToCountdown(whiteDiffDays);
  }

  const formattedStartDate = formatArabicDateDisplay(whiteStartDate);
  const formattedEndDate = formatArabicDateDisplay(whiteEndDate);

  // 3 individual White Days
  const dayNumberLabels = ['الأول', 'الثاني', 'الثالث'];
  const whiteItems: WhiteDayItem[] = [0, 1, 2].map((offset) => {
    const d = new Date(whiteStartDate);
    d.setDate(whiteStartDate.getDate() + offset);
    const h = gregorianToHijri(d, hijriOffset);
    const targetMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dDiff = Math.round((targetMidnight - nowMidnight) / 86400000);
    const isToday = dDiff === 0;
    const isPassed = dDiff < 0;
    const dayName = formatArLongWeekday(d);
    const formattedDate = formatArabicDateDisplay(d);
    const hijriDayVal = h.day;
    return {
      dayNumber: offset + 1,
      dayLabel: `اليوم ${dayNumberLabels[offset]} (${digits(hijriDayVal)})`,
      hijriDay: hijriDayVal,
      hijriMonthName: h.monthName || whiteMonthName,
      hijriDateStr: `${digits(hijriDayVal)} ${h.monthName || whiteMonthName}`,
      date: d,
      dateStr: toLocalDateString(d),
      formattedDate,
      dayName,
      diffDays: dDiff,
      countdown: isPassed ? 'مضى' : formatDiffDaysToCountdown(dDiff, isToday),
      isToday,
      isPassed,
    };
  });

  // 1. Major annual Sunnah Fasting occasions (صيام فقط)
  const targetFastingOccasions = [
    {
      id: 'tasua_ashura',
      name: 'صيام تاسوعاء وعاشوراء',
      hijriMonth: 1,
      hijriDay: 9,
      hijriDateStr: '٩ و ١٠ محرم',
      virtue: 'يكفر ذنوب السنة الماضية، وسنة مؤكدة صيام التاسع والعاشر',
    },
    {
      id: 'rajab',
      name: 'صيام مستحب من رجب',
      hijriMonth: 7,
      hijriDay: 1,
      hijriDateStr: '١ رجب',
      virtue: 'استحباب الإكثار من الصيام في الأشهر الحرم المباركة',
    },
    {
      id: 'shaban',
      name: 'صيام شهر شعبان',
      hijriMonth: 8,
      hijriDay: 1,
      hijriDateStr: 'شهر شعبان',
      virtue: 'شهر ترفع فيه الأعمال إلى الله، وكان النبي ﷺ يصوم أكثره',
    },
    {
      id: 'ramadan',
      name: 'شهر رمضان المبارك',
      hijriMonth: 9,
      hijriDay: 1,
      hijriDateStr: '١ رمضان',
      virtue: 'فريضة الصيام العظمى وركن الإسلام وشهر القرآن والعتق من النار',
    },
    {
      id: 'shawwal_six',
      name: 'صيام الست من شوال',
      hijriMonth: 10,
      hijriDay: 2,
      hijriDateStr: '٢ شوال',
      virtue: 'من صام رمضان ثم أتبعه بست من شوال كان كصيام الدهر كله',
    },
    {
      id: 'dhulhijjah_ten',
      name: 'صيام تسع ذي الحجة',
      hijriMonth: 12,
      hijriDay: 1,
      hijriDateStr: '١ ذو الحجة',
      virtue: 'أفضل أيام الدنيا، والعمل الصالح فيها أحب إلى الله من غيرها',
    },
    {
      id: 'arafah',
      name: 'صيام يوم عرفة',
      hijriMonth: 12,
      hijriDay: 9,
      hijriDateStr: '٩ ذو الحجة',
      virtue: 'يكفر ذنوب السنة الماضية والسنة الباقية لغير الحاج',
    },
  ];

  const foundOccasions: MajorOccasionItem[] = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const h = gregorianToHijri(d, hijriOffset);
    for (const t of targetFastingOccasions) {
      const isMultiDayActiveToday =
        i === 0 &&
        ((t.id === 'tasua_ashura' && h.month === 1 && h.day === 10) ||
          (t.id === 'dhulhijjah_ten' && h.month === 12 && h.day >= 1 && h.day <= 8));
      if ((h.month === t.hijriMonth && h.day === t.hijriDay) || isMultiDayActiveToday) {
        if (!foundOccasions.some((f) => f.id === t.id)) {
          const occDayName = formatArLongWeekday(d);
          const formattedDate = formatArabicDateDisplay(d);
          foundOccasions.push({
            id: t.id,
            name: t.name,
            hijriDateStr: t.hijriDateStr,
            date: d,
            dateStr: toLocalDateString(d),
            formattedDate,
            dayName: occDayName,
            diffDays: i,
            countdownText: formatDiffDaysToCountdown(i, i === 0),
            isToday: i === 0,
            virtue: t.virtue,
          });
        }
      }
    }
  }

  foundOccasions.sort((a, b) => a.diffDays - b.diffDays);
  const nearestOccasion = foundOccasions[0] || {
    id: 'ramadan',
    name: 'شهر رمضان المبارك',
    hijriDateStr: '١ رمضان',
    date: now,
    dateStr: toLocalDateString(now),
    formattedDate: formatArabicDateDisplay(now),
    dayName: formatArLongWeekday(now),
    diffDays: 0,
    countdownText: 'قريباً',
    isToday: false,
    virtue: 'فريضة الصيام العظمى',
  };

  // 2. Religious Holidays and Islamic Occasions (أعياد ومناسبات ونفحات دينية مباركة - غير مخصصة للصيام)
  const targetReligiousHolidays = [
    {
      id: 'hijri_new_year',
      name: 'رأس السنة الهجرية',
      category: 'general' as const,
      categoryLabel: 'عام هجري جديد',
      hijriMonth: 1,
      hijriDay: 1,
      hijriDateStr: '١ محرم',
      virtue: 'ذكرى الهجرة النبوية الشريفة وتأسيس الدولة الإسلامية في المدينة المنورة',
      recommendedDeed: 'محاسبة النفس على ما مضى، الاستغفار، وتجديد العهد على الطاعة',
    },
    {
      id: 'ashura_day',
      name: 'ذكرى يوم عاشوراء العظيم',
      category: 'blessed_night' as const,
      categoryLabel: 'نفحة إيمانية',
      hijriMonth: 1,
      hijriDay: 10,
      hijriDateStr: '١٠ محرم',
      virtue: 'يوم نصر الله فيه نبيه موسى عليه السلام والمؤمنين وأغرق فرعون وجنوده',
      recommendedDeed: 'حمد الله وشكره، التوسعة على الأهل بالخير، والصدقة للمحتاجين',
    },
    {
      id: 'mawlid_nabawi',
      name: 'المولد النبوي الشريف',
      category: 'prophetic' as const,
      categoryLabel: 'ذكرى نبوية عطرة',
      hijriMonth: 3,
      hijriDay: 12,
      hijriDateStr: '١٢ ربيع الأول',
      virtue: 'مولد سيد المرسلين وخاتم النبيين ورحمة الله للعالمين محمد ﷺ',
      recommendedDeed: 'الإكثار من الصلاة والسلام على الحبيب المصطفى ﷺ وتدارس سنته وسيرته',
    },
    {
      id: 'isra_miraj',
      name: 'ذكرى الإسراء والمعراج',
      category: 'prophetic' as const,
      categoryLabel: 'معجزة نبوية كبرى',
      hijriMonth: 7,
      hijriDay: 27,
      hijriDateStr: '٢٧ رجب',
      virtue: 'معجزة رحلة الإسراء من المسجد الحرام للمسجد الأقصى والمعراج إلى السماوات العلى وفرض الصلاة',
      recommendedDeed: 'تعظيم شأن الصلاة المفروضة، الخشوع، والدعاء للمسلمين',
    },
    {
      id: 'mid_shaban_night',
      name: 'ليلة النصف من شعبان',
      category: 'blessed_night' as const,
      categoryLabel: 'ليلة مباركة',
      hijriMonth: 8,
      hijriDay: 15,
      hijriDateStr: '١٥ شعبان',
      virtue: 'ليلة تحويل القبلة إلى الكعبة المشرفة وتجلي رحمة الله ومغفرته لعباده المؤمنين',
      recommendedDeed: 'قيام الليل، الاستغفار، صلة الرحم، وتصفية القلوب من الشحناء',
    },
    {
      id: 'ramadan_start',
      name: 'غرة شهر رمضان المبارك',
      category: 'blessed_night' as const,
      categoryLabel: 'شهر القرآن والرحمة',
      hijriMonth: 9,
      hijriDay: 1,
      hijriDateStr: '١ رمضان',
      virtue: 'أعظم شهور العام، تفتح فيه أبواب الجنان وتغلق أبواب النيران وتصفد الشياطين',
      recommendedDeed: 'صلاة التراويح، إخلاص النية، ختم القرآن الكريم، والجود والصدقة',
    },
    {
      id: 'laylat_al_qadr',
      name: 'ليلة القدر والعشر الأواخر',
      category: 'blessed_night' as const,
      categoryLabel: 'خير من ألف شهر',
      hijriMonth: 9,
      hijriDay: 27,
      hijriDateStr: 'العشر الأواخر (٢٧ رمضان)',
      virtue: 'ليلة نزول القرآن، العبادة فيها تفضل عبادة ألف شهر (أكثر من ٨٣ سنة)',
      recommendedDeed: 'الاعتكاف، التهجد، ودعاء: «اللهم إنك عفو تحب العفو فاعف عني»',
    },
    {
      id: 'eid_al_fitr',
      name: 'عيد الفطر المبارك',
      category: 'eid' as const,
      categoryLabel: 'عيد إسلامي مبارك',
      hijriMonth: 10,
      hijriDay: 1,
      hijriDateStr: '١ شوال',
      virtue: 'يوم الجائزة الكبرى والفرحة بتمام طاعة الصيام وشكر الله على التمام (يحرم صيامه شرعاً)',
      recommendedDeed: 'شهود صلاة العيد، إخراج زكاة الفطر قبل الصلاة، التكبير، وصلة الأرحام',
    },
    {
      id: 'day_of_arafah',
      name: 'يوم عرفة العظيم',
      category: 'blessed_night' as const,
      categoryLabel: 'خير يوم طلعت عليه الشمس',
      hijriMonth: 12,
      hijriDay: 9,
      hijriDateStr: '٩ ذو الحجة',
      virtue: 'أعظم أركان الحج، وأكثر يوم يعتق الله فيه الرقاب من النار ويباهي بأهله الملائكة',
      recommendedDeed: 'خير الدعاء دعاء يوم عرفة، التكبير، التهليل، والذكر المستمر طوال اليوم',
    },
    {
      id: 'eid_al_adha',
      name: 'عيد الأضحى المبارك (يوم النحر)',
      category: 'eid' as const,
      categoryLabel: 'عيد إسلامي مبارك',
      hijriMonth: 12,
      hijriDay: 10,
      hijriDateStr: '١٠ ذو الحجة',
      virtue: 'أعظم الأيام عند الله تبارك وتعالى، وإحياء سنة الخليل إبراهيم عليه السلام (يحرم صيامه شرعاً)',
      recommendedDeed: 'صلاة العيد، ذبح الأضاحي وتوزيعها، التكبير المطلق والمقيد، وإطعام الفقراء',
    },
    {
      id: 'tashreeq_days',
      name: 'أيام التشريق المباركة',
      category: 'general' as const,
      categoryLabel: 'أيام ذكر وتكبير',
      hijriMonth: 12,
      hijriDay: 11,
      hijriDateStr: '١١، ١٢، ١٣ ذو الحجة',
      virtue: 'أيام أكل وشرب وذكر لله تعالى لضيوف الرحمن والمؤمنين عامة (يحرم صيامها شرعاً)',
      recommendedDeed: 'التكبير دبر الصلوات المكتوبة، التوسعة على الأهل والأولاد، وشكر المنعم',
    },
  ];

  const foundHolidays: ReligiousHolidayItem[] = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const h = gregorianToHijri(d, hijriOffset);
    for (const t of targetReligiousHolidays) {
      const isTashreeqActiveToday =
        i === 0 && t.id === 'tashreeq_days' && h.month === 12 && (h.day === 12 || h.day === 13);
      if ((h.month === t.hijriMonth && h.day === t.hijriDay) || isTashreeqActiveToday) {
        if (!foundHolidays.some((f) => f.id === t.id)) {
          const occDayName = formatArLongWeekday(d);
          const formattedDate = formatArabicDateDisplay(d);
          foundHolidays.push({
            id: t.id,
            name: t.name,
            category: t.category,
            categoryLabel: t.categoryLabel,
            virtue: t.virtue,
            recommendedDeed: t.recommendedDeed,
            hijriDateStr: t.hijriDateStr,
            date: d,
            dateStr: toLocalDateString(d),
            formattedDate,
            dayName: occDayName,
            diffDays: i,
            countdownText: i === 0 ? 'اليوم! (مناسبة مباركة جارية الآن)' : formatDiffDaysToCountdown(i, false),
            isToday: i === 0,
          });
        }
      }
    }
  }

  foundHolidays.sort((a, b) => a.diffDays - b.diffDays);
  const nearestHoliday = foundHolidays[0] || {
    id: 'eid_al_fitr',
    name: 'عيد الفطر المبارك',
    category: 'eid' as const,
    categoryLabel: 'عيد إسلامي مبارك',
    virtue: 'يوم الجائزة والفرحة بتمام طاعة الصيام',
    recommendedDeed: 'صلاة العيد، صلة الأرحام، والتكبير',
    hijriDateStr: '١ شوال',
    date: now,
    dateStr: toLocalDateString(now),
    formattedDate: formatArabicDateDisplay(now),
    dayName: formatArLongWeekday(now),
    diffDays: 0,
    countdownText: 'قريباً',
    isToday: false,
  };

  const nearestFast =
    monDiffDays <= thuDiffDays
      ? {
          name: 'صيام الإثنين',
          date: monDate,
          dateStr: toLocalDateString(monDate),
          formattedDate: monFormattedDate,
          dayName: 'الإثنين',
          hijriDateStr: monHijriDateStr,
          diffDays: monDiffDays,
          countdown: formatDiffDaysToCountdown(monDiffDays, isMonToday),
          isToday: isMonToday,
        }
      : {
          name: 'صيام الخميس',
          date: thuDate,
          dateStr: toLocalDateString(thuDate),
          formattedDate: thuFormattedDate,
          dayName: 'الخميس',
          hijriDateStr: thuHijriDateStr,
          diffDays: thuDiffDays,
          countdown: formatDiffDaysToCountdown(thuDiffDays, isThuToday),
          isToday: isThuToday,
        };

  return {
    nextMonday: {
      date: monDate,
      dateStr: toLocalDateString(monDate),
      formattedDate: monFormattedDate,
      dayName: 'الإثنين',
      hijriDateStr: monHijriDateStr,
      isToday: isMonToday,
      diffDays: monDiffDays,
      countdown: formatDiffDaysToCountdown(monDiffDays, isMonToday),
    },
    nextThursday: {
      date: thuDate,
      dateStr: toLocalDateString(thuDate),
      formattedDate: thuFormattedDate,
      dayName: 'الخميس',
      hijriDateStr: thuHijriDateStr,
      isToday: isThuToday,
      diffDays: thuDiffDays,
      countdown: formatDiffDaysToCountdown(thuDiffDays, isThuToday),
    },
    nearestFast,
    whiteDays: {
      days: [13, 14, 15],
      monthName: whiteMonthName,
      isCurrent: isWhiteDayNow,
      currentDayNumber,
      startDate: whiteStartDate,
      endDate: whiteEndDate,
      startDateStr: toLocalDateString(whiteStartDate),
      endDateStr: toLocalDateString(whiteEndDate),
      formattedStartDate,
      formattedEndDate,
      diffDays: whiteDiffDays,
      countdown: whiteCountdown,
      items: whiteItems,
    },
    majorOccasions: {
      nearest: nearestOccasion,
      items: foundOccasions,
    },
    religiousHolidays: {
      nearest: nearestHoliday,
      items: foundHolidays,
    },
  };
}
