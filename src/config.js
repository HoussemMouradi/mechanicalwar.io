export const VERSION = 'mw-office-v5';

// Everyone lands in the same room: there is no room selection any more.
// Gameplay snapshots now include survival items and grenades. Keep older clients
// in their previous room rather than mixing incompatible match protocols.
export const ROOM_ID = 'mechanicalwar-io-office-main-v5';

export const MAX_HP = 100;
export const TEAM_LIMIT = 8;
export const SCORE_TO_WIN = 30;
export const RESPAWN_DELAY = 3.5;

export const TEAMS = {
  1: { id: 1, key: 'AUTO', name: 'AUTO', full: 'Automotive', color: '#ff7a1a', hex: 0xff7a1a },
  2: { id: 2, key: 'DJB', name: 'DJB', full: 'DJB ya dawela', color: '#2f8cff', hex: 0x2f8cff },
};

export const FAKE_TEAM = { key: 'RH', name: 'RH', full: 'Ressources Humaines', color: '#e11d48' };

export const CHARACTERS = [
  {
    id: 'manager', name: 'The Manager', tag: 'Bald. Glasses. Synergy.',
    line: "Let's circle back... to your funeral.",
    skin: 0xe0ac86, shirt: 0xf1f5f9, sleeve: 0xf1f5f9, pants: 0x3f4550, shoes: 0x1a1410,
  },
  {
    id: 'vape', name: 'Vape Guy', tag: 'Mango-flavoured menace.',
    line: '*exhales aggressively*',
    skin: 0xc68a62, shirt: 0x4b5563, sleeve: 0x4b5563, pants: 0x1f2937, shoes: 0xf5f5f5,
  },
  {
    id: 'intern', name: 'The Intern', tag: 'Unpaid. Unhinged.',
    line: 'Is this going on my performance review?',
    skin: 0xf2c6a0, shirt: 0x16a34a, sleeve: 0x16a34a, pants: 0x3b5b8c, shoes: 0x7c2d12,
  },
  {
    id: 'it', name: 'IT Guy', tag: 'Have you tried rebooting?',
    line: 'Did you try turning it off and on again?',
    skin: 0xd9a57a, shirt: 0x111827, sleeve: 0x111827, pants: 0x57534e, shoes: 0x292524,
  },
  {
    id: 'sales', name: 'Sales Bro', tag: 'Always be closing (in).',
    line: "Crushing Q4. Crushing you.",
    skin: 0xb77b52, shirt: 0x1e3a8a, sleeve: 0x1e3a8a, pants: 0xc8b28a, shoes: 0x3b2314,
  },
  {
    id: 'coffee', name: 'Coffee Lady', tag: 'Do not touch her mug.',
    line: 'Not before my coffee.',
    skin: 0x8d5a3b, shirt: 0x7f1d1d, sleeve: 0x7f1d1d, pants: 0x27272a, shoes: 0x111111,
  },
];
export const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

// dmg is per bullet/pellet. headMult applies to head hits, 0.75 to legs.
export const WEAPONS = {
  knife: {
    name: 'Knife', slot: 3, melee: true, dmg: 50, headMult: 1.3, rate: 0.5, range: 2.3, speed: 1.1,
  },
  glock: {
    name: 'Glock-18', slot: 2, dmg: 28, headMult: 3.5, mag: 20, reserve: 120, rate: 0.14, auto: false,
    spread: 0.006, moveSpread: 0.035, kick: 0.9, reload: 2.1, range: 70, speed: 1.0,
  },
  mp5: {
    name: 'MP5-SD', slot: 1, dmg: 25, headMult: 3.5, mag: 30, reserve: 120, rate: 0.078, auto: true,
    spread: 0.009, moveSpread: 0.03, kick: 0.55, reload: 2.4, range: 60, speed: 1.0,
  },
  ump45: {
    name: 'UMP-45', slot: 1, dmg: 32, headMult: 3, mag: 25, reserve: 100, rate: 0.105, auto: true,
    spread: 0.008, moveSpread: 0.04, kick: 0.75, reload: 2.35, range: 55, speed: 0.99,
  },
  scar: {
    name: 'SCAR-L', slot: 1, dmg: 34, headMult: 3.3, mag: 30, reserve: 90, rate: 0.11, auto: true,
    spread: 0.003, moveSpread: 0.08, kick: 0.95, reload: 2.7, range: 120, speed: 0.91,
  },
  nova: {
    name: 'Nova', slot: 1, dmg: 19, headMult: 2, pellets: 9, mag: 8, reserve: 32, rate: 0.9, auto: false,
    spread: 0.075, moveSpread: 0.02, kick: 3.2, reload: 2.9, range: 32, speed: 0.95,
  },
  ak47: {
    name: 'AK-47', slot: 1, dmg: 36, headMult: 3.6, mag: 30, reserve: 90, rate: 0.1, auto: true,
    spread: 0.004, moveSpread: 0.11, kick: 1.05, reload: 2.5, range: 110, speed: 0.93,
  },
  m4a4: {
    name: 'M4A4', slot: 1, dmg: 31, headMult: 3.6, mag: 30, reserve: 90, rate: 0.09, auto: true,
    spread: 0.0035, moveSpread: 0.09, kick: 0.85, reload: 2.3, range: 110, speed: 0.95,
  },
  awp: {
    name: 'AWP', slot: 1, dmg: 115, headMult: 2, mag: 5, reserve: 30, rate: 1.45, auto: false, scope: true,
    spread: 0.08, scopedSpread: 0.0008, moveSpread: 0.15, kick: 4.5, reload: 3.4, range: 160, speed: 0.84,
  },
  rpg: {
    name: 'RPG-7', slot: 1, dmg: 130, blast: 5.5, rocket: true, mag: 1, reserve: 2, rate: 1.4, auto: false,
    spread: 0.004, moveSpread: 0.03, kick: 6, reload: 3.2, range: 90, speed: 0.85,
  },
};
export const DEFAULT_LOADOUT = { primary: null, secondary: 'glock', melee: 'knife' };

// dmg is the damage at a full-strength throw; heavy props slow you down while carried.
export const PROPS = {
  keyboard: { name: 'Keyboard', dmg: 22, half: [0.23, 0.025, 0.08], carrySpeed: 1 },
  mug: { name: 'Coffee Mug', dmg: 18, half: [0.05, 0.06, 0.05], carrySpeed: 1 },
  stapler: { name: 'Stapler', dmg: 20, half: [0.09, 0.04, 0.03], carrySpeed: 1 },
  phone: { name: 'Desk Phone', dmg: 20, half: [0.11, 0.05, 0.1], carrySpeed: 1 },
  laptop: { name: 'Laptop', dmg: 30, half: [0.18, 0.02, 0.13], carrySpeed: 0.98 },
  monitor: { name: 'Monitor', dmg: 40, half: [0.3, 0.24, 0.1], carrySpeed: 0.92 },
  extinguisher: { name: 'Fire Extinguisher', dmg: 50, half: [0.1, 0.3, 0.1], carrySpeed: 0.9 },
  plant: { name: 'Potted Plant', dmg: 34, half: [0.18, 0.4, 0.18], carrySpeed: 0.92 },
  bin: { name: 'Trash Bin', dmg: 24, half: [0.17, 0.2, 0.17], carrySpeed: 0.95 },
  chair: { name: 'Office Chair', dmg: 60, half: [0.32, 0.5, 0.32], carrySpeed: 0.75, heavy: true },
  printer: { name: 'Printer', dmg: 75, half: [0.3, 0.2, 0.25], carrySpeed: 0.7, heavy: true },
};

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, maxPixels: 1600000, shadows: false, shadowSize: 0, post: false, lights: 4, aa: false, anisotropy: 2 },
  medium: { label: 'Medium', pixelRatio: 1, maxPixels: 2400000, shadows: true, shadowSize: 1024, post: false, lights: 8, aa: true, anisotropy: 4 },
  high: { label: 'High', pixelRatio: 1.25, maxPixels: 3600000, shadows: true, shadowSize: 2048, post: true, lights: 12, aa: true, anisotropy: 8, aoScale: 0.5, aoSamples: 16 },
  ultra: { label: 'Ultra', pixelRatio: 2, maxPixels: 6000000, shadows: true, shadowSize: 4096, post: true, lights: 16, aa: true, anisotropy: 16, aoScale: 0.75, aoSamples: 32 },
};

const SETTINGS_KEY = 'mw.settings.v4';
const defaults = { sensitivity: 1, fov: 80, quality: 'high', volume: 0.7 };

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const s = { ...defaults, ...saved };
    if (!QUALITY[s.quality]) s.quality = defaults.quality;
    return s;
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadProfile() {
  return {
    name: localStorage.getItem('mw.name') || '',
    team: Number(localStorage.getItem('mw.team')) || 0,
    char: localStorage.getItem('mw.char') || CHARACTERS[0].id,
  };
}

export function saveProfile(p) {
  localStorage.setItem('mw.name', p.name);
  localStorage.setItem('mw.team', String(p.team || ''));
  localStorage.setItem('mw.char', p.char);
}
