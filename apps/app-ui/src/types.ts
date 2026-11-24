export type Project = {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  symbol: string;
  currentTask?: string | null;
  goal?: string | null;
  isCurrent?: boolean;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt?: string | null;
};

export type UpdateProjectInput = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  progress?: number;
  symbol?: string;
  currentTask?: string | null;
  goal?: string | null;
  isCurrent?: boolean;
};

export type Idea = {
  id: string;
  title: string;
  tag: string;
  body: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt?: string | null;
};

export type UpdateIdeaInput = {
  id: string;
  title?: string;
  tag?: string;
  body?: string;
};

export type WorkSessionRecord = {
  id: string;
  projectId?: string | null;
  projectTitle?: string | null;
  durationSecs: number;
  startedAt: string;
  endedAt: string;
  note?: string | null;
};

export type DailyWorshipRecord = {
  date: string;
  fajr: boolean;
  sunrise: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
  fasting: boolean;
  note?: string | null;
  updatedAt: string;
};

export type MigrationReport = {
  fromVersion: number;
  toVersion: number;
  migrated: boolean;
  backupPath?: string | null;
  counts: Record<string, number>;
};

export type ThemeId =
  | 'midnight-magenta'
  | 'dawn-sand'
  | 'nile-teal'
  | 'studio-voltage'
  | 'copper-garden';

export type AccentId = 'rose' | 'amber' | 'aqua' | 'violet' | 'lime';

export type PrayerSoundMode = 'silent' | 'gentle-chime' | 'adhan';
export type WorkSoundMode = 'silent' | 'gentle-chime' | 'work-chime';
export type FastingSoundMode = 'silent' | 'gentle-chime' | 'adhan' | 'strong-alarm';
export type BackgroundAudioMode = 'foreground-only' | 'always';

export type QuietHours = {
  start: string;
  end: string;
};

export type NotificationPreferences = {
  prePrayerEnabled: boolean;
  prayerAtTimeEnabled: boolean;
  fastingEnabled: boolean;
  focusCompletionEnabled: boolean;
  quietHours?: QuietHours | null;
};

export type AudioPreferences = {
  prayer: PrayerSoundMode;
  fasting: FastingSoundMode;
  work: WorkSoundMode;
  volume: number;
  backgroundPlayback: BackgroundAudioMode;
};

export type AppPreferences = {
  themeId: ThemeId;
  accentId: AccentId;
  notifications: NotificationPreferences;
  audio: AudioPreferences;
  latitude: number;
  longitude: number;
  wuduLeadMinutes: number;
  prePrayerLeads?: number[];
  calcMethod: string;
  petVisible: boolean;
  overlayWidget: boolean;
  locationLabel?: string;
  countryCode?: string;
  timeZone?: string;
  fajrOffset?: number;
  maghribOffset?: number;
  ishaOffset?: number;
  hijriDateOffset?: number;
  bubbles?: boolean;
  livelyPopups?: boolean;
  quietDefault?: boolean;
  strictOffline?: boolean;
  petAvatar?: string;
  petSize?: 'small' | 'normal' | 'large';
  overlaySize?: 'compact' | 'normal' | 'large';
  petRoaming?: boolean;
  petInteractionSounds?: boolean;
  petIdleFade?: boolean;
  petIdleOpacity?: number;
  petIdleDelaySeconds?: number;
  petPopupSize?: 'compact' | 'normal' | 'large';
  fontSize?: 'small' | 'medium' | 'large';
  reducedMotion?: boolean;
  suhoorLeadMinutes?: number;
  imsakWaterLeadMinutes?: number;
  suhoorWakeChallenge?: boolean;
  suhoorWakeCheckMinutes?: number;
  preventSleepForSuhoor?: boolean;
  taskbarWidgetEnabled?: boolean;
  taskbarWidgetPosition?: 'tray' | 'far_left' | 'left' | 'near-tray';
  taskbarWidgetDigits?: 'latin' | 'arabic';
  taskbarShowFocusTimer?: boolean;
  asrHanafi?: boolean;
  onboardingCompleted?: boolean;
  islandOrientation?: 'top' | 'bottom' | 'left' | 'right' | 'horizontal' | 'vertical';
  islandSide?: 'left' | 'right';
  islandHideFullscreen?: boolean;
  islandTheme?: 'system' | 'acrylic' | 'opaque' | 'original' | 'dark' | 'light';
  dhikrCardsEnabled?: boolean;
  dhikrCardsIntervalMinutes?: number;
  dhikrEveryMinutes?: number;
  dhikrDurationSeconds?: number;
  dhikrIncludeAyah?: boolean;
  dhikrIncludeDhikr?: boolean;
  dhikrIncludeDua?: boolean;
  quranRadioEnabled?: boolean;
  quranRadioDefaultStation?: string;
  radioPauseAtPrayer?: boolean;
  mediaPillEnabled?: boolean;
  mediaPauseAtPrayer?: boolean;
  waterReminderEnabled?: boolean;
  waterEveryMinutes?: number;
  waterDailyGoal?: number;
  eyeBreakEnabled?: boolean;
  welcomeBackEnabled?: boolean;
  morningBriefEnabled?: boolean;
  smartClipboardEnabled?: boolean;
  clipboardHistoryEnabled?: boolean;
  shelfEnabled?: boolean;
  screenshotAutoShelf?: boolean;
  screenshotShelfMinutes?: number;
  downloadsWatcherEnabled?: boolean;
  privacyDotsEnabled?: boolean;
  meetingsIcalEnabled?: boolean;
  meetingsIcalUrl?: string;
  petCursorEyes?: boolean;
  petContextProps?: boolean;
};

export interface PrivacyStatus {
  mic_active: boolean;
  mic_apps: string[];
  cam_active: boolean;
  cam_apps: string[];
}

export interface ClipboardItem {
  id: string;
  content: string;
  preview: string;
  kind: string;
  extra?: string | null;
  timestamp: number;
}

export interface ShelfItem {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  extension: string;
  added_at: number;
}

export interface DownloadItem {
  file_name: string;
  downloaded_bytes: number;
  is_downloading: boolean;
}

export interface CalendarMeeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  meeting_link?: string | null;
  is_upcoming: boolean;
  minutes_until_start: number;
}

export interface MediaSessionInfo {
  has_session: boolean;
  title: string;
  artist: string;
  is_playing: boolean;
  position_seconds: number;
  duration_seconds: number;
}

export type AppPreferencesPatch = Omit<Partial<AppPreferences>, 'notifications' | 'audio'> & {
  notifications?: Partial<NotificationPreferences>;
  audio?: Partial<AudioPreferences>;
};

export type ReminderEvent = {
  id: string;
  title: string;
  body: string;
  kind: string;
  dueAtMs: number;
  catchUpMs: number;
};

export type NotificationSummary = {
  nextReminder?: ReminderEvent | null;
  status: string;
  unreadCount: number;
  lastRecoverableError?: string | null;
};

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  kind: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  readAt?: string | null;
};

export type DeliveryResult = {
  success: boolean;
  status: string;
  error?: string | null;
};

export type BootstrapPayload = {
  schemaVersion: number;
  deviceId: string;
  settings: AppPreferences;
  notificationSummary?: NotificationSummary;
  projects: Project[];
  ideas: Idea[];
  migration?: MigrationReport | null;
};

export type PrayerTime = { key: string; nameAr: string; minutesFromMidnight: number };
export type PrayerDay = { date: string; times: PrayerTime[]; calculationNoteAr: string };

export type LegacyState = {
  projects?: Array<Partial<Project>>;
  ideas?: Array<Partial<Idea>>;
  settings?: Record<string, unknown>;
  fasting?: Record<string, unknown>;
  workSessions?: Array<{ durationMs?: number; startedAt?: string; endedAt?: string }>;
  marketing?: Record<string, unknown[]>;
};

export type CriticalAlarmPayload = {
  id: string;
  title: string;
  body: string;
  kind: string;
  requireChallenge?: boolean;
};
