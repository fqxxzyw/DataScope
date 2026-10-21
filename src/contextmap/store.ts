import { create } from 'zustand';
import { defaults, safeSettings, stopDefaults } from './defaults';
import type { Settings } from './types';
function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Session remains usable if browser storage is disabled. */
  }
}
const stored = read('contextmap-analysisSettings');
const custom = read('contextmap-customStopWords');
const initialStops =
  custom && typeof custom === 'object' ? (custom as Record<string, unknown>) : {};
const stops = {
  zh: Array.isArray(initialStops.zh)
    ? initialStops.zh.filter((v): v is string => typeof v === 'string')
    : stopDefaults.zh,
  en: Array.isArray(initialStops.en)
    ? initialStops.en.filter((v): v is string => typeof v === 'string')
    : stopDefaults.en,
};
export const useContextSettings = create<{
  settings: Settings;
  stops: typeof stops;
  setSettings: (s: Partial<Settings>) => void;
  setStops: (items: string[]) => void;
  reset: () => void;
}>((set, get) => ({
  settings: safeSettings(stored && typeof stored === 'object' ? (stored as Partial<Settings>) : {}),
  stops,
  setSettings: (patch) => {
    const settings = safeSettings({ ...get().settings, ...patch });
    write('contextmap-analysisSettings', settings);
    set({ settings });
  },
  setStops: (items) => {
    const stops = { ...get().stops, [get().settings.language]: [...new Set(items)] };
    write('contextmap-customStopWords', stops);
    set({ stops });
  },
  reset: () => {
    write('contextmap-analysisSettings', defaults);
    write('contextmap-customStopWords', stopDefaults);
    set({ settings: { ...defaults }, stops: { ...stopDefaults } });
  },
}));
