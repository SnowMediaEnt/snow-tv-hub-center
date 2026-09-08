import { useEffect, useState } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { SmcBilling, isBillingAvailable } from '@/capacitor/SmcBilling';
import { isDemo } from '@/lib/demoMode';

/** The single switch for the whole billing feature (public.feature_flags.billing_account). */
export const BILLING_FLAG = 'billing_account';

let configuredCache: boolean | null = null;
let configuredPromise: Promise<boolean> | null = null;

/** Whether the native build has an app key. Asked once per process. */
export const billingConfigured = (): Promise<boolean> => {
  if (configuredCache !== null) return Promise.resolve(configuredCache);
  if (!isBillingAvailable() || isDemo()) { configuredCache = false; return Promise.resolve(false); }
  if (!configuredPromise) {
    configuredPromise = SmcBilling.getState()
      .then((s) => { configuredCache = !!s.configured; return configuredCache; })
      .catch(() => { configuredCache = false; return false; });
  }
  return configuredPromise;
};

/**
 * True only when all three hold: the feature flag is on (default OFF, so it
 * ships dark), the native plugin is present, and the build has an app key.
 */
export function useBillingEnabled(): boolean {
  const { enabled: flag } = useFeatureFlag(BILLING_FLAG, false);
  const [configured, setConfigured] = useState<boolean>(configuredCache === true);
  useEffect(() => {
    if (!flag) return;
    let cancelled = false;
    void billingConfigured().then((v) => { if (!cancelled) setConfigured(v); });
    return () => { cancelled = true; };
  }, [flag]);
  return flag && configured;
}
