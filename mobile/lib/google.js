import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
  isErrorWithCode,
} from "@react-native-google-signin/google-signin";

// WEB client ID from Google Cloud Console → APIs & Services → Credentials →
// OAuth 2.0 Client IDs → "Web application". Required so signIn() returns an
// idToken, and it must match GOOGLE_WEB_CLIENT_ID on the backend (that's the
// token's audience). The separate "Android" OAuth client (package name + SHA-1)
// must also exist in the same Google Cloud project, but it is NOT referenced here.
export const GOOGLE_WEB_CLIENT_ID =
  "296766629087-ho0456bokd14isu3tc6hjdvvnfmmhre2.apps.googleusercontent.com";

let configured = false;

// Safe to call repeatedly; configure() only needs to run once before signIn().
export function configureGoogleSignin() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false, // we only need an idToken, not a server auth code
  });
  configured = true;
}

// Launches the native Google account picker and returns the ID token.
//  -> { idToken }        on success
//  -> { cancelled: true } if the user backed out of the picker
// Throws for real errors (no Play Services, network, etc.) so callers can show
// a message.
export async function getGoogleIdToken() {
  configureGoogleSignin();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Start from a clean slate so the account picker always shows (otherwise a
  // previously-signed-in account may be reused silently).
  try { await GoogleSignin.signOut(); } catch (_e) {}

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return { cancelled: true };

  const idToken = response.data?.idToken;
  if (!idToken) throw new Error("Google did not return an ID token");
  return { idToken };
}

export { statusCodes, isErrorWithCode };
