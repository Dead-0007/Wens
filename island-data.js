// Official Wens Island Data Catalog (Quran Radio Stations & Curated Reminders, Duas, Quotes, Fasting & Worship)

export const QURAN_STATIONS = [
  { id: 'cairo', name: 'إذاعة القرآن الكريم — القاهرة (بث مباشر)', url: 'https://stream.radiojar.com/8s5u5tpdtwzuv', fallbackUrl: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary' },
  { id: 'saudi', name: 'إذاعة القرآن الكريم — المملكة العربية السعودية', url: 'https://stream.radiojar.com/0tpy1h0kxtzuv', fallbackUrl: 'https://backup.qurango.net/radio/abdulrahman_alsudaes' },
  { id: 'makkah', name: 'إذاعة القرآن الكريم من مكة المكرمة (الحرم المكي)', url: 'https://backup.qurango.net/radio/abdulrahman_alsudaes', fallbackUrl: 'https://backup.qurango.net/radio/maher' },
  { id: 'hussary', name: 'الشيخ محمود خليل الحصري (المصحف المرتل)', url: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary' },
  { id: 'hussary-moallim', name: 'الشيخ محمود خليل الحصري (المصحف المعلم)', url: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary_moalim' },
  { id: 'hussary-mujawwad', name: 'الشيخ محمود خليل الحصري (المصحف المجود)', url: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary_mojawwad' },
  { id: 'abdulbasit', name: 'الشيخ عبد الباسط عبد الصمد (المصحف المجود)', url: 'https://backup.qurango.net/radio/abdulbasit_abdulsamad_mojawwad' },
  { id: 'abdulbasit-murattal', name: 'الشيخ عبد الباسط عبد الصمد (المصحف المرتل)', url: 'https://backup.qurango.net/radio/abdulbasit_abdulsamad' },
  { id: 'minshawi', name: 'الشيخ محمد صديق المنشاوي (المصحف المرتل)', url: 'https://backup.qurango.net/radio/mohammed_siddiq_alminshawi' },
  { id: 'minshawi-mujawwad', name: 'الشيخ محمد صديق المنشاوي (المصحف المجود)', url: 'https://backup.qurango.net/radio/mohammed_siddiq_alminshawi_mojawwad' },
  { id: 'mustafa-ismail', name: 'الشيخ مصطفى إسماعيل (المصحف المرتل)', url: 'https://backup.qurango.net/radio/mustafa_ismail' },
  { id: 'banna', name: 'الشيخ محمود علي البنا (المصحف المرتل)', url: 'https://backup.qurango.net/radio/mahmoud_ali__albanna' },
  { id: 'tablawi', name: 'الشيخ محمد محمود الطبلاوي', url: 'https://backup.qurango.net/radio/mohammad_altablaway' },
  { id: 'ali-jaber', name: 'الشيخ علي عبد الله جابر', url: 'https://backup.qurango.net/radio/ali_jaber' },
  { id: 'afasy', name: 'الشيخ مشاري راشد العفاسي', url: 'https://backup.qurango.net/radio/mishary_alafasi' },
  { id: 'maher', name: 'الشيخ ماهر المعيقلي', url: 'https://backup.qurango.net/radio/maher' },
  { id: 'dosari', name: 'الشيخ ياسر الدوسري', url: 'https://backup.qurango.net/radio/yasser_aldosari' },
  { id: 'ghamdi', name: 'الشيخ سعد الغامدي', url: 'https://backup.qurango.net/radio/saad_alghamdi' },
  { id: 'shuraim', name: 'الشيخ سعود الشريم', url: 'https://backup.qurango.net/radio/saud_alshuraim' },
  { id: 'sudais', name: 'الشيخ عبد الرحمن السديس', url: 'https://backup.qurango.net/radio/abdulrahman_alsudaes' },
  { id: 'qatami', name: 'الشيخ ناصر القطامي', url: 'https://backup.qurango.net/radio/nasser_alqatami' },
  { id: 'idrees', name: 'الشيخ إدريس أبكر', url: 'https://backup.qurango.net/radio/idrees_abkr' },
  { id: 'ajamy', name: 'الشيخ أحمد بن علي العجمي', url: 'https://backup.qurango.net/radio/ahmad_alajmy' },
  { id: 'faris-abbad', name: 'الشيخ فارس عباد', url: 'https://backup.qurango.net/radio/fares_abbad' },
  { id: 'abu-bakr-shatri', name: 'الشيخ أبو بكر الشاطري', url: 'https://backup.qurango.net/radio/shaik_abu_bakr_al_shatri' },
  { id: 'hudhaify', name: 'الشيخ علي بن عبد الرحمن الحذيفي', url: 'https://backup.qurango.net/radio/ali_alhuthaifi' },
  { id: 'rifai', name: 'الشيخ هاني الرفاعي', url: 'https://backup.qurango.net/radio/hani_arrifai' },
  { id: 'khalid-aljalil', name: 'الشيخ خالد الجليل', url: 'https://backup.qurango.net/radio/khalid_aljileel' },
  { id: 'muhammad-ayyoub', name: 'الشيخ محمد أيوب', url: 'https://backup.qurango.net/radio/mohammed_ayyub' },
  { id: 'tarateel', name: 'تراتيل قصيرة متميزة', url: 'https://backup.qurango.net/radio/tarateel' },
  { id: 'fatwa', name: 'إذاعة الفتاوى العامة', url: 'https://backup.qurango.net/radio/fatwa' },
  { id: 'roqya', name: 'الرقية الشرعية', url: 'https://backup.qurango.net/radio/roqiah' },
  { id: 'tafsir', name: 'تفسير القرآن الكريم', url: 'https://backup.qurango.net/radio/tafseer' }
];

export const REMINDERS = [
  // Duas (أدعية)
  {
    kind: 'dua',
    badge: '🤲 دعاء',
    text: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا',
    source: 'دعاء الصباح وبداية العمل'
  },
  {
    kind: 'dua',
    badge: '🤲 دعاء',
    text: 'يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ، وَيَا مُصَرِّفَ الْقُلُوبِ صَرِّفْ قُلُوبَنَا عَلَى طَاعَتِكَ',
    source: 'من أكثر دعاء النبي ﷺ'
  },
  {
    kind: 'dua',
    badge: '🤲 دعاء',
    text: 'اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ',
    source: 'دعاء الكفاية والبركة'
  },
  {
    kind: 'dua',
    badge: '🤲 دعاء',
    text: 'رَبِّ اشْرَحْ لِي صَدْرِي · وَيَسِّرْ لِي أَمْرِي · وَاحْلُلْ عُقْدَةً مِّن لِّسَانِي يَفْقَهُوا قَوْلِي',
    source: 'سورة طه — ٢٥:٢٨'
  },
  {
    kind: 'dua',
    badge: '🤲 دعاء',
    text: 'اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا',
    source: 'دعاء تيسير الأمور الصعبة'
  },
  {
    kind: 'dua',
    badge: '🤲 دعاء',
    text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْبُخْلِ وَالْجُبْنِ',
    source: 'صحيح البخاري'
  },

  // Quotes (كوت / حكمة)
  {
    kind: 'quote',
    badge: '💡 كوت وحكمة',
    text: '«قليلٌ دائمٌ خيرٌ من كثيرٍ منقطع — ابنِ يومك على خطوات ثابتة ولو صغرت.»',
    source: 'قاعدة الاستمرارية'
  },
  {
    kind: 'quote',
    badge: '💡 كوت وحكمة',
    text: '«بركة الوقت ليست في كثرة الساعات، بل في صفاء النية وترتيب الأولويات حول صلاتك.»',
    source: 'فقه العمل المتزن'
  },
  {
    kind: 'quote',
    badge: '💡 كوت وحكمة',
    text: '«لا تنتظر اكتمال الظروف لتبدأ؛ ابدأ بما في يدك الآن، والفتح يأتي مع السعي الصادق.»',
    source: 'حكمة العمل'
  },
  {
    kind: 'quote',
    badge: '💡 كوت وحكمة',
    text: '«التركيز العميق عبادة مهنية: أغلق المشتتات لنصف ساعة، وأتقن ما بين يديك.»',
    source: 'إتقان العمل'
  },
  {
    kind: 'quote',
    badge: '💡 كوت وحكمة',
    text: '«من رتب يومه بين الأذانين، لم يضعه التشتت ولم يسرقه التسويف.»',
    source: 'وِنس — إيقاع اليوم'
  },

  // Fasting Reminders (تذكير بالصيام)
  {
    kind: 'fasting',
    badge: '🌙 تذكير الصيام',
    text: '«مَنْ صَامَ يَوْمًا فِي سَبِيلِ اللَّهِ بَعَّدَ اللَّهُ وَجْهَهُ عَنِ النَّارِ سَبْعِينَ خَرِيفًا»',
    source: 'متفق عليه — فضل صيام التطوع'
  },
  {
    kind: 'fasting',
    badge: '🌙 تذكير الصيام',
    text: '«تُعْرَضُ الأَعْمَالُ يَوْمَ الاِثْنَيْنِ وَالْخَمِيسِ، فَأُحِبُّ أَنْ يُعْرَضَ عَمَلِي وَأَنَا صَائِمٌ»',
    source: 'سنن الترمذي — صيام الإثنين والخميس'
  },
  {
    kind: 'fasting',
    badge: '🌙 تذكير الصيام',
    text: '«صِيَامُ ثَلاثَةِ أَيَّامٍ مِنْ كُلِّ شَهْرٍ صِيَامُ الدَّهْرِ» — الأيام البيض ١٣ و١٤ و١٥ هجرياً',
    source: 'وصية النبي ﷺ لأبي هريرة'
  },
  {
    kind: 'fasting',
    badge: '🌙 تذكير الصيام',
    text: '«تَسَحَّرُوا فَإِنَّ فِي السَّحُورِ بَرَكَةً» — ولو بجرعة ماء قبل أذان الفجر',
    source: 'صحيح البخاري ومسلم'
  },

  // Quran (آيات كريمة)
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ وَاصْبِرْ لِحُكْمِ رَبِّكَ فَإِنَّكَ بِأَعْيُنِنَا ۖ وَسَبِّحْ بِحَمْدِ رَبِّكَ حِينَ تَقُومُ ﴾',
    source: 'سورة الطور — ٤٨'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ ﴾',
    source: 'سورة الرعد — ٢٨'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾',
    source: 'سورة طه — ١١٤'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ۚ إِنَّ اللَّهَ بَالِغُ أَمْرِهِ ﴾',
    source: 'سورة الطلاق — ٣'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾',
    source: 'سورة الشرح — ٦'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ ۚ عَلَيْهِ تَوَكَّلْتُ وَإِلَيْهِ أُنِيبُ ﴾',
    source: 'سورة هود — ٨٨'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ فَاسْتَجَبْنَا لَهُ وَنَجَّيْنَاهُ مِنَ الْغَمِّ ۚ وَكَذَٰلِكَ نُنجِي الْمُؤْمِنِينَ ﴾',
    source: 'سورة الأنبياء — ٨٨'
  },
  {
    kind: 'quran',
    badge: '📖 آية كريمة',
    text: '﴿ وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْ ﴾',
    source: 'سورة غافر — ٦٠'
  },

  // Dhikr & Sunnah (أذكار وسنن)
  {
    kind: 'dhikr',
    badge: '📿 ذكر وفائدة',
    text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ ، سُبْحَانَ اللَّهِ الْعَظِيمِ',
    source: 'كلمتان خفيفتان على اللسان ثقيلتان في الميزان'
  },
  {
    kind: 'dhikr',
    badge: '📿 ذكر وفائدة',
    text: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ الْعَلِيِّ الْعَظِيمِ',
    source: 'كنز من كنوز الجنة'
  },
  {
    kind: 'dhikr',
    badge: '📿 ذكر وفائدة',
    text: 'اللَّهُمَّ صَلِّ وَسَلِّمْ وَبَارِكْ عَلَى نَبِيِّنَا مُحَمَّدٍ',
    source: 'الصلاة على النبي ﷺ تُكفى بها هَمَّك ويُغفر ذنبك'
  },
  {
    kind: 'dhikr',
    badge: '📿 ذكر وفائدة',
    text: 'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ',
    source: 'الاستغفار مفتاح الفرج وسعة الرزق'
  },
  {
    kind: 'dhikr',
    badge: '📿 ذكر وفائدة',
    text: 'لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ',
    source: 'دعاء ذي النون — لم يدعُ به مسلم في شيء إلا استجاب الله له'
  },
  {
    kind: 'dhikr',
    badge: '📿 ذكر وفائدة',
    text: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ',
    source: 'من أذكار الصباح والمساء'
  },
  {
    kind: 'sunnah',
    badge: '📿 حديث شريف',
    text: '«أَحَبُّ الْأَعْمَالِ إِلَى اللَّهِ تَعَالَى أَدْوَمُهَا وَإِنْ قَلَّ»',
    source: 'صحيح البخاري ومسلم'
  },
  {
    kind: 'sunnah',
    badge: '📿 حديث شريف',
    text: '«إِنَّ اللَّهَ يُحِبُّ إِذَا عَمِلَ أَحَدُكُمْ عَمَلًا أَنْ يُتْقِنَهُ»',
    source: 'حديث حسن — صحيح الجامع'
  }
];
