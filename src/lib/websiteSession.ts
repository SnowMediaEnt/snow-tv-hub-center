// One flag: "the user signed out of the website account on purpose".
//
// The app can sign a website account back in silently, from a streaming
// login, through the player-login bridge. That is right after a reinstall,
// where the session was simply lost. It is wrong right after someone pressed
// Sign Out — they would open Support and find themselves signed in again with
// no action of their own. This flag tells the two apart. It lives in
// localStorage so it survives restarts, and a reinstall clears it, which is
// exactly the case the bridge exists for.
//
// Set in useAuth.signOut; cleared on any real SIGNED_IN.

const KEY = 'smc:website-signed-out';

export const markWebsiteSignedOut = (): void => {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
};

export const clearWebsiteSignedOut = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};

export const wasWebsiteSignedOut = (): boolean => {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
};
