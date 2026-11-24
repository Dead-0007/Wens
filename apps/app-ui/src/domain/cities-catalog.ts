export interface OfflineCity {
  id: string;
  nameAr: string;
  countryAr: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  calcMethod: string;
  fajrOffset?: number;
  maghribOffset?: number;
  ishaOffset?: number;
}

export const CITIES_CATALOG: OfflineCity[] = [
  // --- محافظات ومدن جمهورية مصر العربية (الهيئة العامة المصرية للمساحة) ---
  { id: 'eg-cairo', nameAr: 'القاهرة', countryAr: 'مصر', countryCode: 'EG', latitude: 30.0444, longitude: 31.2357, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-alex', nameAr: 'الإسكندرية', countryAr: 'مصر', countryCode: 'EG', latitude: 31.2001, longitude: 29.9187, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-giza', nameAr: 'الجيزة', countryAr: 'مصر', countryCode: 'EG', latitude: 30.0131, longitude: 31.2089, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-portsaid', nameAr: 'بورسعيد', countryAr: 'مصر', countryCode: 'EG', latitude: 31.2653, longitude: 32.3019, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-suez', nameAr: 'السويس', countryAr: 'مصر', countryCode: 'EG', latitude: 29.9668, longitude: 32.5498, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-ismailia', nameAr: 'الإسماعيلية', countryAr: 'مصر', countryCode: 'EG', latitude: 30.5965, longitude: 32.2715, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-mansoura', nameAr: 'المنصورة (الدقهلية)', countryAr: 'مصر', countryCode: 'EG', latitude: 31.0409, longitude: 31.3785, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-tanta', nameAr: 'طنطا (الغربية)', countryAr: 'مصر', countryCode: 'EG', latitude: 30.7865, longitude: 31.0004, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-damanhur', nameAr: 'دمنهور (البحيرة)', countryAr: 'مصر', countryCode: 'EG', latitude: 31.0379, longitude: 30.4688, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-zagazig', nameAr: 'الزقازيق (الشرقية)', countryAr: 'مصر', countryCode: 'EG', latitude: 30.5877, longitude: 31.5020, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-benha', nameAr: 'بنها (القليوبية)', countryAr: 'مصر', countryCode: 'EG', latitude: 30.4660, longitude: 31.1853, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-shibin', nameAr: 'شبين الكوم (المنوفية)', countryAr: 'مصر', countryCode: 'EG', latitude: 30.5526, longitude: 31.0090, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-kafr-el-sheikh', nameAr: 'كفر الشيخ', countryAr: 'مصر', countryCode: 'EG', latitude: 31.1107, longitude: 30.9388, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-damietta', nameAr: 'دمياط', countryAr: 'مصر', countryCode: 'EG', latitude: 31.4175, longitude: 31.8144, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-fayoum', nameAr: 'الفيوم', countryAr: 'مصر', countryCode: 'EG', latitude: 29.3084, longitude: 30.8428, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-beni-suef', nameAr: 'بني سويف', countryAr: 'مصر', countryCode: 'EG', latitude: 29.0661, longitude: 31.0994, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-minya', nameAr: 'المنيا', countryAr: 'مصر', countryCode: 'EG', latitude: 28.1099, longitude: 30.7503, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-asyut', nameAr: 'أسيوط', countryAr: 'مصر', countryCode: 'EG', latitude: 27.1783, longitude: 31.1859, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-sohag', nameAr: 'سوهاج', countryAr: 'مصر', countryCode: 'EG', latitude: 26.5569, longitude: 31.6948, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-qena', nameAr: 'قنا', countryAr: 'مصر', countryCode: 'EG', latitude: 26.1551, longitude: 32.7160, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-luxor', nameAr: 'الأقصر', countryAr: 'مصر', countryCode: 'EG', latitude: 25.6872, longitude: 32.6396, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-aswan', nameAr: 'أسوان', countryAr: 'مصر', countryCode: 'EG', latitude: 24.0889, longitude: 32.8998, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-hurghada', nameAr: 'الغردقة (البحر الأحمر)', countryAr: 'مصر', countryCode: 'EG', latitude: 27.2579, longitude: 33.8116, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-sharm', nameAr: 'شرم الشيخ (جنوب سيناء)', countryAr: 'مصر', countryCode: 'EG', latitude: 27.9158, longitude: 34.3299, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-arish', nameAr: 'العريش (شمال سيناء)', countryAr: 'مصر', countryCode: 'EG', latitude: 31.1325, longitude: 33.8033, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-marsa-matruh', nameAr: 'مرسى مطروح', countryAr: 'مصر', countryCode: 'EG', latitude: 31.3543, longitude: 27.2373, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },
  { id: 'eg-kharga', nameAr: 'الخارجة (الوادي الجديد)', countryAr: 'مصر', countryCode: 'EG', latitude: 25.4514, longitude: 30.5472, timeZone: 'Africa/Cairo', calcMethod: 'egypt' },

  // --- المملكة العربية السعودية (تقويم أم القرى) ---
  { id: 'sa-makkah', nameAr: 'مكة المكرمة', countryAr: 'السعودية', countryCode: 'SA', latitude: 21.3891, longitude: 39.8579, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-madinah', nameAr: 'المدينة المنورة', countryAr: 'السعودية', countryCode: 'SA', latitude: 24.5247, longitude: 39.5692, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-riyadh', nameAr: 'الرياض', countryAr: 'السعودية', countryCode: 'SA', latitude: 24.7136, longitude: 46.6753, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-jeddah', nameAr: 'جدة', countryAr: 'السعودية', countryCode: 'SA', latitude: 21.5433, longitude: 39.1728, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-dammam', nameAr: 'الدمام', countryAr: 'السعودية', countryCode: 'SA', latitude: 26.4207, longitude: 50.0888, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-khobar', nameAr: 'الخبر', countryAr: 'السعودية', countryCode: 'SA', latitude: 26.2172, longitude: 50.1971, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-taif', nameAr: 'الطائف', countryAr: 'السعودية', countryCode: 'SA', latitude: 21.2854, longitude: 40.4222, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-tabuk', nameAr: 'تبوك', countryAr: 'السعودية', countryCode: 'SA', latitude: 28.3835, longitude: 36.5662, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-buraidah', nameAr: 'بريدة (القصيم)', countryAr: 'السعودية', countryCode: 'SA', latitude: 26.3592, longitude: 43.9818, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-abha', nameAr: 'أبها (عسير)', countryAr: 'السعودية', countryCode: 'SA', latitude: 18.2164, longitude: 42.5053, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-khamis', nameAr: 'خميس مشيط', countryAr: 'السعودية', countryCode: 'SA', latitude: 18.3065, longitude: 42.7340, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-hail', nameAr: 'حائل', countryAr: 'السعودية', countryCode: 'SA', latitude: 27.5114, longitude: 41.7208, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-jubail', nameAr: 'الجبيل', countryAr: 'السعودية', countryCode: 'SA', latitude: 27.0046, longitude: 49.6606, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-yanbu', nameAr: 'ينبع', countryAr: 'السعودية', countryCode: 'SA', latitude: 24.0920, longitude: 38.0618, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-jizan', nameAr: 'جازان', countryAr: 'السعودية', countryCode: 'SA', latitude: 16.8892, longitude: 42.5706, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'sa-najran', nameAr: 'نجران', countryAr: 'السعودية', countryCode: 'SA', latitude: 17.4933, longitude: 44.1277, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },

  // --- دول الخليج العربي ---
  { id: 'ae-dubai', nameAr: 'دبي', countryAr: 'الإمارات', countryCode: 'AE', latitude: 25.2048, longitude: 55.2708, timeZone: 'Asia/Dubai', calcMethod: 'umm_al_qura' },
  { id: 'ae-abudhabi', nameAr: 'أبو ظبي', countryAr: 'الإمارات', countryCode: 'AE', latitude: 24.4539, longitude: 54.3773, timeZone: 'Asia/Dubai', calcMethod: 'umm_al_qura' },
  { id: 'ae-sharjah', nameAr: 'الشارقة', countryAr: 'الإمارات', countryCode: 'AE', latitude: 25.3573, longitude: 55.4033, timeZone: 'Asia/Dubai', calcMethod: 'umm_al_qura' },
  { id: 'qa-doha', nameAr: 'الدوحة', countryAr: 'قطر', countryCode: 'QA', latitude: 25.2854, longitude: 51.5310, timeZone: 'Asia/Qatar', calcMethod: 'umm_al_qura' },
  { id: 'kw-kuwait', nameAr: 'الكويت العاصمة', countryAr: 'الكويت', countryCode: 'KW', latitude: 29.3759, longitude: 47.9774, timeZone: 'Asia/Kuwait', calcMethod: 'umm_al_qura' },
  { id: 'bh-manama', nameAr: 'المنامة', countryAr: 'البحرين', countryCode: 'BH', latitude: 26.2285, longitude: 50.5860, timeZone: 'Asia/Bahrain', calcMethod: 'umm_al_qura' },
  { id: 'om-muscat', nameAr: 'مسقط', countryAr: 'عُمان', countryCode: 'OM', latitude: 23.5880, longitude: 58.3829, timeZone: 'Asia/Muscat', calcMethod: 'umm_al_qura' },
  { id: 'om-salalah', nameAr: 'صلالة', countryAr: 'عُمان', countryCode: 'OM', latitude: 17.0151, longitude: 54.0924, timeZone: 'Asia/Muscat', calcMethod: 'umm_al_qura' },

  // --- بلاد الشام وفلسطين والعراق ---
  { id: 'ps-jerusalem', nameAr: 'القدس الشريف', countryAr: 'فلسطين', countryCode: 'PS', latitude: 31.7683, longitude: 35.2137, timeZone: 'Asia/Jerusalem', calcMethod: 'egypt' },
  { id: 'ps-gaza', nameAr: 'غزة', countryAr: 'فلسطين', countryCode: 'PS', latitude: 31.5017, longitude: 34.4668, timeZone: 'Asia/Gaza', calcMethod: 'egypt' },
  { id: 'ps-ramallah', nameAr: 'رام الله', countryAr: 'فلسطين', countryCode: 'PS', latitude: 31.9038, longitude: 35.2034, timeZone: 'Asia/Hebron', calcMethod: 'egypt' },
  { id: 'ps-nablus', nameAr: 'نابلس', countryAr: 'فلسطين', countryCode: 'PS', latitude: 32.2227, longitude: 35.2621, timeZone: 'Asia/Hebron', calcMethod: 'egypt' },
  { id: 'jo-amman', nameAr: 'عمّان', countryAr: 'الأردن', countryCode: 'JO', latitude: 31.9454, longitude: 35.9284, timeZone: 'Asia/Amman', calcMethod: 'egypt' },
  { id: 'jo-zarqa', nameAr: 'الزرقاء', countryAr: 'الأردن', countryCode: 'JO', latitude: 32.0728, longitude: 36.0880, timeZone: 'Asia/Amman', calcMethod: 'egypt' },
  { id: 'jo-irbid', nameAr: 'إربد', countryAr: 'الأردن', countryCode: 'JO', latitude: 32.5568, longitude: 35.8469, timeZone: 'Asia/Amman', calcMethod: 'egypt' },
  { id: 'sy-damascus', nameAr: 'دمشق', countryAr: 'سوريا', countryCode: 'SY', latitude: 33.5138, longitude: 36.2765, timeZone: 'Asia/Damascus', calcMethod: 'egypt' },
  { id: 'sy-aleppo', nameAr: 'حلب', countryAr: 'سوريا', countryCode: 'SY', latitude: 36.2021, longitude: 37.1343, timeZone: 'Asia/Damascus', calcMethod: 'egypt' },
  { id: 'lb-beirut', nameAr: 'بيروت', countryAr: 'لبنان', countryCode: 'LB', latitude: 33.8938, longitude: 35.5018, timeZone: 'Asia/Beirut', calcMethod: 'egypt' },
  { id: 'iq-baghdad', nameAr: 'بغداد', countryAr: 'العراق', countryCode: 'IQ', latitude: 33.3152, longitude: 44.3661, timeZone: 'Asia/Baghdad', calcMethod: 'umm_al_qura' },
  { id: 'iq-erbil', nameAr: 'أربيل', countryAr: 'العراق', countryCode: 'IQ', latitude: 36.1901, longitude: 44.0091, timeZone: 'Asia/Baghdad', calcMethod: 'umm_al_qura' },
  { id: 'iq-basra', nameAr: 'البصرة', countryAr: 'العراق', countryCode: 'IQ', latitude: 30.5085, longitude: 47.7804, timeZone: 'Asia/Baghdad', calcMethod: 'umm_al_qura' },
  { id: 'iq-mosul', nameAr: 'الموصل', countryAr: 'العراق', countryCode: 'IQ', latitude: 36.3400, longitude: 43.1300, timeZone: 'Asia/Baghdad', calcMethod: 'umm_al_qura' },

  // --- شمال إفريقيا واليمن والسودان ---
  { id: 'sd-khartoum', nameAr: 'الخرطوم', countryAr: 'السودان', countryCode: 'SD', latitude: 15.5007, longitude: 32.5599, timeZone: 'Africa/Khartoum', calcMethod: 'egypt' },
  { id: 'ye-sanaa', nameAr: 'صنعاء', countryAr: 'اليمن', countryCode: 'YE', latitude: 15.3694, longitude: 44.1910, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'ye-aden', nameAr: 'عدن', countryAr: 'اليمن', countryCode: 'YE', latitude: 12.7855, longitude: 45.0187, timeZone: 'Asia/Riyadh', calcMethod: 'umm_al_qura' },
  { id: 'ly-tripoli', nameAr: 'طرابلس الغرب', countryAr: 'ليبيا', countryCode: 'LY', latitude: 32.8872, longitude: 13.1913, timeZone: 'Africa/Tripoli', calcMethod: 'egypt' },
  { id: 'ly-benghazi', nameAr: 'بنغازي', countryAr: 'ليبيا', countryCode: 'LY', latitude: 32.1167, longitude: 20.0667, timeZone: 'Africa/Tripoli', calcMethod: 'egypt' },
  { id: 'tn-tunis', nameAr: 'تونس العاصمة', countryAr: 'تونس', countryCode: 'TN', latitude: 36.8065, longitude: 10.1815, timeZone: 'Africa/Tunis', calcMethod: 'muslim_world_league' },
  { id: 'tn-sfax', nameAr: 'صفاقس', countryAr: 'تونس', countryCode: 'TN', latitude: 34.7406, longitude: 10.7603, timeZone: 'Africa/Tunis', calcMethod: 'muslim_world_league' },
  { id: 'dz-algiers', nameAr: 'الجزائر العاصمة', countryAr: 'الجزائر', countryCode: 'DZ', latitude: 36.7538, longitude: 3.0588, timeZone: 'Africa/Algiers', calcMethod: 'muslim_world_league' },
  { id: 'dz-oran', nameAr: 'وهران', countryAr: 'الجزائر', countryCode: 'DZ', latitude: 35.6987, longitude: -0.6349, timeZone: 'Africa/Algiers', calcMethod: 'muslim_world_league' },
  { id: 'ma-casablanca', nameAr: 'الدار البيضاء', countryAr: 'المغرب', countryCode: 'MA', latitude: 33.5731, longitude: -7.5898, timeZone: 'Africa/Casablanca', calcMethod: 'muslim_world_league' },
  { id: 'ma-rabat', nameAr: 'الرباط', countryAr: 'المغرب', countryCode: 'MA', latitude: 34.0209, longitude: -6.8416, timeZone: 'Africa/Casablanca', calcMethod: 'muslim_world_league' },
  { id: 'ma-marrakech', nameAr: 'مراكش', countryAr: 'المغرب', countryCode: 'MA', latitude: 31.6295, longitude: -7.9811, timeZone: 'Africa/Casablanca', calcMethod: 'muslim_world_league' },
  { id: 'ma-tangier', nameAr: 'طنجة', countryAr: 'المغرب', countryCode: 'MA', latitude: 35.7595, longitude: -5.8340, timeZone: 'Africa/Casablanca', calcMethod: 'muslim_world_league' },
  { id: 'mr-nouakchott', nameAr: 'نواكشوط', countryAr: 'موريتانيا', countryCode: 'MR', latitude: 18.0735, longitude: -15.9582, timeZone: 'Africa/Nouakchott', calcMethod: 'muslim_world_league' },

  // --- أهم العواصم العالمية والجاليات (رابطة العالم الإسلامي / أمريكا الشمالية) ---
  { id: 'tr-istanbul', nameAr: 'إسطنبول', countryAr: 'تركيا', countryCode: 'TR', latitude: 41.0082, longitude: 28.9784, timeZone: 'Europe/Istanbul', calcMethod: 'muslim_world_league' },
  { id: 'tr-ankara', nameAr: 'أنقرة', countryAr: 'تركيا', countryCode: 'TR', latitude: 39.9334, longitude: 32.8597, timeZone: 'Europe/Istanbul', calcMethod: 'muslim_world_league' },
  { id: 'gb-london', nameAr: 'لندن', countryAr: 'بريطانيا', countryCode: 'GB', latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London', calcMethod: 'muslim_world_league' },
  { id: 'gb-manchester', nameAr: 'مانشستر', countryAr: 'بريطانيا', countryCode: 'GB', latitude: 53.4808, longitude: -2.2426, timeZone: 'Europe/London', calcMethod: 'muslim_world_league' },
  { id: 'fr-paris', nameAr: 'باريس', countryAr: 'فرنسا', countryCode: 'FR', latitude: 48.8566, longitude: 2.3522, timeZone: 'Europe/Paris', calcMethod: 'muslim_world_league' },
  { id: 'de-berlin', nameAr: 'برلين', countryAr: 'ألمانيا', countryCode: 'DE', latitude: 52.5200, longitude: 13.4050, timeZone: 'Europe/Berlin', calcMethod: 'muslim_world_league' },
  { id: 'de-frankfurt', nameAr: 'فرانكفورت', countryAr: 'ألمانيا', countryCode: 'DE', latitude: 50.1109, longitude: 8.6821, timeZone: 'Europe/Berlin', calcMethod: 'muslim_world_league' },
  { id: 'nl-amsterdam', nameAr: 'أمستردام', countryAr: 'هولندا', countryCode: 'NL', latitude: 52.3676, longitude: 4.9041, timeZone: 'Europe/Amsterdam', calcMethod: 'muslim_world_league' },
  { id: 'us-newyork', nameAr: 'نيويورك', countryAr: 'أمريكا', countryCode: 'US', latitude: 40.7128, longitude: -74.0060, timeZone: 'America/New_York', calcMethod: 'north_america' },
  { id: 'us-chicago', nameAr: 'شيكاغو', countryAr: 'أمريكا', countryCode: 'US', latitude: 41.8781, longitude: -87.6298, timeZone: 'America/Chicago', calcMethod: 'north_america' },
  { id: 'us-losangeles', nameAr: 'لوس أنجلوس', countryAr: 'أمريكا', countryCode: 'US', latitude: 34.0522, longitude: -118.2437, timeZone: 'America/Los_Angeles', calcMethod: 'north_america' },
  { id: 'ca-toronto', nameAr: 'تورونتو', countryAr: 'كندا', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832, timeZone: 'America/Toronto', calcMethod: 'north_america' },
  { id: 'ca-montreal', nameAr: 'مونتريال', countryAr: 'كندا', countryCode: 'CA', latitude: 45.5017, longitude: -73.5673, timeZone: 'America/Toronto', calcMethod: 'north_america' },
  { id: 'au-sydney', nameAr: 'سيدني', countryAr: 'أستراليا', countryCode: 'AU', latitude: -33.8688, longitude: 151.2093, timeZone: 'Australia/Sydney', calcMethod: 'muslim_world_league' },
  { id: 'my-kualalumpur', nameAr: 'كوالالمبور', countryAr: 'ماليزيا', countryCode: 'MY', latitude: 3.1390, longitude: 101.6869, timeZone: 'Asia/Kuala_Lumpur', calcMethod: 'muslim_world_league' },
];

export function findCity(idOrQuery: string): OfflineCity | undefined {
  const q = idOrQuery.trim().toLowerCase();
  if (!q) return undefined;
  return CITIES_CATALOG.find(
    (c) =>
      c.id.toLowerCase() === q ||
      c.nameAr.includes(q) ||
      c.countryAr.includes(q)
  );
}
