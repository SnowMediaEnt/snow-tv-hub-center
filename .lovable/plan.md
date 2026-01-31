

## Plan to Fix Android Loading Issues

### Phase 1: Fix Supabase Client Initialization for Native

**Problem**: The storage adapter uses async Capacitor Preferences, but Supabase client is created synchronously before the adapter is ready.

**Solution**: 
- Modify `src/utils/storage.ts` to pre-initialize Capacitor Preferences BEFORE creating the storage adapter
- Add a `waitForStorageReady()` function that components can await
- Modify `src/integrations/supabase/client.ts` to ensure proper initialization order

### Phase 2: Fix Network Request Logic for Native Platform

**Problem**: The `useCorsProxy: true` flag in `useAppData.ts` causes the app to try CORS proxies first, which is slow and unnecessary on native.

**Solution**:
- Change the logic in `robustFetch` so that when `isNativePlatform()` is true, it ALWAYS tries direct URLs first, regardless of the `useCorsProxy` flag
- CORS proxies should only be used as fallbacks on native

### Phase 3: Add Synchronous Storage Fallback

**Problem**: Supabase auth expects synchronous `getItem` on initial load to restore sessions.

**Solution**:
- Modify the storage adapter to use `localStorage` for the initial synchronous read
- Then migrate to Capacitor Preferences for subsequent async operations
- This ensures the session can be restored on app launch

### Phase 4: Add Startup Diagnostics

**Solution**:
- Add console logging at app startup that reports:
  - Platform detected (native vs web)
  - Storage adapter type in use
  - Supabase connection status
  - Network connectivity status
- This will help debug issues on the actual device via Android Studio logcat

### Phase 5: Ensure Edge Functions Have Proper Fallbacks

**Solution**:
- Modify `invokeEdgeFunction` to log more details about WHY it's failing
- Add a check to see if Supabase client is properly authenticated before making requests
- If not authenticated, skip edge function calls and use fallback data immediately

### Files to Modify:
1. `src/utils/storage.ts` - Fix async/sync storage issue
2. `src/integrations/supabase/client.ts` - Ensure proper init order
3. `src/utils/network.ts` - Fix CORS proxy logic for native
4. `src/hooks/useAppData.ts` - Remove incorrect useCorsProxy flag
5. `src/utils/edgeFunctions.ts` - Add better diagnostics
6. `src/App.tsx` or `src/main.tsx` - Add startup diagnostics

