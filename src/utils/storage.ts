// Cross-platform storage adapter for Supabase auth
// Uses Capacitor Preferences on native, localStorage on web

import { isNativePlatform } from './platform';

// Lazy-loaded Preferences module for native
let PreferencesModule: any = null;

const getPreferences = async () => {
  if (!PreferencesModule && isNativePlatform()) {
    try {
      const module = await import('@capacitor/preferences');
      PreferencesModule = module.Preferences;
    } catch (error) {
      console.warn('Failed to load Capacitor Preferences:', error);
    }
  }
  return PreferencesModule;
};

// Storage adapter that Supabase auth can use
// Note: Supabase expects synchronous getItem, but we provide async for native
// This works because Supabase's auth client handles async storage
export const createStorageAdapter = () => {
  // For web, use localStorage directly
  if (!isNativePlatform()) {
    return localStorage;
  }

  // For native, create async adapter
  return {
    getItem: async (key: string): Promise<string | null> => {
      try {
        const Preferences = await getPreferences();
        if (Preferences) {
          const { value } = await Preferences.get({ key });
          return value;
        }
      } catch (error) {
        console.warn('Preferences getItem failed:', error);
      }
      // Fallback to localStorage
      return localStorage.getItem(key);
    },
    
    setItem: async (key: string, value: string): Promise<void> => {
      try {
        const Preferences = await getPreferences();
        if (Preferences) {
          await Preferences.set({ key, value });
          return;
        }
      } catch (error) {
        console.warn('Preferences setItem failed:', error);
      }
      // Fallback to localStorage
      localStorage.setItem(key, value);
    },
    
    removeItem: async (key: string): Promise<void> => {
      try {
        const Preferences = await getPreferences();
        if (Preferences) {
          await Preferences.remove({ key });
          return;
        }
      } catch (error) {
        console.warn('Preferences removeItem failed:', error);
      }
      // Fallback to localStorage
      localStorage.removeItem(key);
    },
  };
};

// Pre-initialize storage adapter
export const storageAdapter = createStorageAdapter();
