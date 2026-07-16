/*
  Optional Firebase Authentication and manual Cloud Firestore sync.
  This module is deliberately separate from the local-first application.
  Replace the public web-app placeholders below to enable it.
*/

const firebaseConfig = {
  apiKey: "AIzaSyDgIvY9QFPcs5GzXF0CPF23tOTTzsIS52c",
  authDomain: "robert-personal-homepage.firebaseapp.com",
  projectId: "robert-personal-homepage",
  storageBucket: "robert-personal-homepage.firebasestorage.app",
  messagingSenderId: "232092968887",
  appId: "1:232092968887:web:19bc9cde9bda67f56c6a32",
};

const CLOUD_PATH = (uid) => `users/${uid}/dashboard/main`;
const LAST_SYNC_KEY = "homepage.lastSync";
const SIGN_IN_PROGRESS_KEY = "homepage.firebaseSignInProgress";
const SIGN_IN_PROGRESS_TTL_MS = 10 * 60 * 1000;

const els = {
  signedOut: document.getElementById("sync-signed-out"),
  signedIn: document.getElementById("sync-signed-in"),
  signIn: document.getElementById("sync-sign-in"),
  signOut: document.getElementById("sync-sign-out"),
  upload: document.getElementById("sync-upload"),
  download: document.getElementById("sync-download"),
  export: document.getElementById("sync-export"),
  remove: document.getElementById("sync-delete"),
  status: document.getElementById("sync-status"),
  lastTime: document.getElementById("sync-last-time"),
  notice: document.getElementById("sync-cloud-notice"),
  name: document.getElementById("sync-user-name"),
  email: document.getElementById("sync-user-email"),
  photo: document.getElementById("sync-user-photo"),
};

let auth = null;
let db = null;
let currentUser = null;
let busy = false;
let cloudExists = false;
let firebaseApi = null;
let authObserverRegistered = false;
let authErrorMessage = "";
let firstAuthStateResolved = false;
let resolveFirstAuthState;
const firstAuthState = new Promise((resolve) => {
  resolveFirstAuthState = resolve;
});

function isConfigured() {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value && value !== "PASTE_VALUE_HERE"
  );
}

function setStatus(message) {
  if (els.status) els.status.textContent = message;
}

function readSignInMarker() {
  try {
    const marker = JSON.parse(localStorage.getItem(SIGN_IN_PROGRESS_KEY) || "null");
    if (marker && Number.isFinite(marker.startedAt) && Date.now() - marker.startedAt < SIGN_IN_PROGRESS_TTL_MS) {
      return marker;
    }
    localStorage.removeItem(SIGN_IN_PROGRESS_KEY);
  } catch (error) {
    console.warn("Firebase sign-in marker could not be read.");
  }
  return null;
}

function writeSignInMarker() {
  try {
    localStorage.setItem(SIGN_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
  } catch (error) {
    console.warn("Firebase sign-in marker could not be saved.");
  }
}

function clearSignInMarker() {
  try {
    localStorage.removeItem(SIGN_IN_PROGRESS_KEY);
  } catch (error) {
    console.warn("Firebase sign-in marker could not be cleared.");
  }
}

function showSignInRetry(message) {
  authErrorMessage = message;
  setStatus(message);
  if (els.signIn) els.signIn.textContent = "Try Google sign-in again";
}

function setBusy(value) {
  busy = value;
  updateControlAvailability();
}

function updateControlAvailability() {
  if (els.signIn) els.signIn.disabled = busy || !auth || Boolean(currentUser);
  [els.signOut, els.upload, els.download, els.remove].forEach((button) => {
    if (button) button.disabled = busy || !currentUser;
  });
}

function friendlyError(error, action) {
  const code = error && typeof error.code === "string" ? error.code : "unknown";
  console.error(`Firebase ${action} failed (${code}).`);
  if (!navigator.onLine) return "Offline — local changes are still safe on this device.";
  if (code === "auth/unauthorized-domain") return "Google sign-in is not enabled for this website domain.";
  if (code === "auth/popup-blocked") return "The sign-in window was blocked. Please allow popups and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was cancelled. Please try again.";
  if (code === "auth/network-request-failed") return "Google sign-in could not reach the network. Please try again.";
  if (action === "redirect result") return "Google sign-in did not complete. Please try again.";
  if (action === "sign-in") return "Google sign-in did not complete. Please try again.";
  if (code.includes("permission-denied")) return "Sync failed — Firestore access was denied.";
  return "Sync failed. Local data was not changed; try again later.";
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function saveLastSync(uid, action, timestamp) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify({ uid, action, timestamp }));
  } catch (error) {
    console.warn("Could not save the last-sync time locally.", error);
  }
  showLastSync(uid);
}

function showLastSync(uid) {
  if (!els.lastTime) return;
  try {
    const value = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) || "null");
    if (value && value.uid === uid && value.timestamp) {
      els.lastTime.textContent = `Last synchronized: ${formatTimestamp(value.timestamp)} (${value.action})`;
      return;
    }
  } catch (error) {
    console.warn("Could not read the last-sync time.", error);
  }
  els.lastTime.textContent = "Not synchronized on this device yet.";
}

function showUser(user) {
  if (els.signedOut) els.signedOut.hidden = Boolean(user);
  if (els.signedIn) els.signedIn.hidden = !user;
  if (!user) {
    if (els.notice) els.notice.hidden = true;
    if (els.lastTime) els.lastTime.textContent = "";
    setStatus(authErrorMessage || "Local only");
    updateControlAvailability();
    return;
  }
  clearSignInMarker();
  if (els.signIn) els.signIn.textContent = "Sign in with Google";
  if (els.name) els.name.textContent = user.displayName || "Google account";
  if (els.email) els.email.textContent = user.email || "";
  if (els.photo) {
    els.photo.hidden = !user.photoURL;
    if (user.photoURL) els.photo.src = user.photoURL;
  }
  showLastSync(user.uid);
  setStatus("Signed in");
  updateControlAvailability();
}

function cloudRef() {
  if (!currentUser) throw new Error("Not signed in");
  return firebaseApi.doc(db, CLOUD_PATH(currentUser.uid));
}

async function inspectCloud() {
  if (!currentUser) return;
  try {
    const snapshot = await firebaseApi.getDoc(cloudRef());
    cloudExists = snapshot.exists();
    if (els.notice) els.notice.hidden = !cloudExists;
    setStatus(cloudExists ? "Cloud data available" : "Signed in — no cloud copy yet");
  } catch (error) {
    setStatus(friendlyError(error, "cloud check"));
  }
}

async function beginSignIn() {
  if (!auth || busy) return;
  authErrorMessage = "";
  setBusy(true);
  setStatus("Opening Google sign-in…");
  const provider = new firebaseApi.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    try {
      await firebaseApi.signInWithPopup(auth, provider);
    } catch (error) {
      const redirectFallbackCodes = new Set([
        "auth/popup-blocked",
        "auth/cancelled-popup-request",
        "auth/operation-not-supported-in-this-environment",
      ]);
      if (error && redirectFallbackCodes.has(error.code)) {
        console.info(`Firebase popup unavailable (${error.code}); using redirect sign-in.`);
        writeSignInMarker();
        await firebaseApi.signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  } catch (error) {
    clearSignInMarker();
    showSignInRetry(friendlyError(error, "sign-in"));
  } finally {
    setBusy(false);
  }
}

async function uploadLocal() {
  if (!currentUser || busy) return;
  setBusy(true);
  setStatus("Uploading…");
  try {
    const existing = await firebaseApi.getDoc(cloudRef());
    if (existing.exists()) {
      const confirmed = window.confirm(
        "A cloud copy already exists and will be replaced by this device. " +
        "Use ‘Export local backup first’ before continuing if you want a safety copy. Upload now?"
      );
      if (!confirmed) {
        setStatus("Upload cancelled — cloud data was not changed.");
        return;
      }
    }
    const local = getDashboardSnapshot();
    await firebaseApi.setDoc(cloudRef(), { ...local, updatedAt: firebaseApi.serverTimestamp() });
    cloudExists = true;
    if (els.notice) els.notice.hidden = true;
    saveLastSync(currentUser.uid, "upload", new Date().toISOString());
    setStatus("Synced — this device was uploaded.");
  } catch (error) {
    setStatus(friendlyError(error, "upload"));
  } finally {
    setBusy(false);
  }
}

async function downloadCloud() {
  if (!currentUser || busy) return;
  setBusy(true);
  setStatus("Downloading…");
  try {
    const snapshot = await firebaseApi.getDoc(cloudRef());
    if (!snapshot.exists()) {
      cloudExists = false;
      if (els.notice) els.notice.hidden = true;
      setStatus("No cloud data exists for this account.");
      return;
    }
    const cloud = snapshot.data();
    const clean = validateDashboardSnapshot(cloud);
    if (!clean) {
      setStatus("Cloud data is invalid or from an unsupported version. Local data was kept.");
      return;
    }
    const confirmed = window.confirm(
      "Downloading will replace this device’s dashboard settings, theme, and Today’s Focus notes. " +
      "Use ‘Export local backup first’ before continuing if you want a safety copy. Download now?"
    );
    if (!confirmed) {
      setStatus("Download cancelled — local data was not changed.");
      return;
    }
    if (!applyDashboardSnapshot(clean)) {
      setStatus("Download could not be saved. Local data was kept where possible.");
      return;
    }
    if (els.notice) els.notice.hidden = true;
    const updated = formatTimestamp(cloud.updatedAt) || new Date().toISOString();
    saveLastSync(currentUser.uid, "download", updated);
    setStatus("Synced — cloud data is now on this device.");
  } catch (error) {
    setStatus(friendlyError(error, "download"));
  } finally {
    setBusy(false);
  }
}

async function deleteCloud() {
  if (!currentUser || busy) return;
  const confirmed = window.confirm(
    "Delete only this account’s cloud dashboard copy? Local data and your Google/Firebase account will remain. " +
    "Other devices will no longer be able to download this copy."
  );
  if (!confirmed) return;
  setBusy(true);
  setStatus("Deleting cloud copy…");
  try {
    await firebaseApi.deleteDoc(cloudRef());
    cloudExists = false;
    if (els.notice) els.notice.hidden = true;
    setStatus("Cloud copy deleted. Local data was not changed.");
  } catch (error) {
    setStatus(friendlyError(error, "delete"));
  } finally {
    setBusy(false);
  }
}

function bindControls() {
  if (els.signIn) els.signIn.addEventListener("click", beginSignIn);
  if (els.signOut) els.signOut.addEventListener("click", async () => {
    if (!auth || busy) return;
    try {
      authErrorMessage = "";
      clearSignInMarker();
      if (els.signIn) els.signIn.textContent = "Sign in with Google";
      await firebaseApi.signOut(auth);
    } catch (error) {
      setStatus(friendlyError(error, "sign-out"));
    }
  });
  if (els.upload) els.upload.addEventListener("click", uploadLocal);
  if (els.download) els.download.addEventListener("click", downloadCloud);
  if (els.remove) els.remove.addEventListener("click", deleteCloud);
  if (els.export) els.export.addEventListener("click", () => {
    if (typeof window.homepageExportBackup === "function") window.homepageExportBackup();
  });
  window.addEventListener("offline", () => setStatus("Offline — local changes are still available."));
  window.addEventListener("online", () => {
    setStatus(currentUser ? "Signed in" : authErrorMessage || "Local only");
  });
}

function registerAuthObserver() {
  if (authObserverRegistered) return;
  authObserverRegistered = true;
  firebaseApi.onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    cloudExists = false;
    if (user) authErrorMessage = "";
    showUser(user);
    if (!firstAuthStateResolved) {
      firstAuthStateResolved = true;
      resolveFirstAuthState(user);
    }
    if (user) await inspectCloud();
  });
}

async function processRedirectResult() {
  const pendingRedirect = readSignInMarker();
  try {
    const credential = await firebaseApi.getRedirectResult(auth);
    if (credential && credential.user) {
      console.info("Firebase redirect sign-in completed successfully.");
      clearSignInMarker();
    } else {
      console.info("Firebase redirect check completed; no pending redirect sign-in.");
    }
    const observedUser = await firstAuthState;
    if (pendingRedirect && !credential && !observedUser) {
      clearSignInMarker();
      showSignInRetry("Google sign-in returned without completing. Please try again.");
    }
  } catch (error) {
    clearSignInMarker();
    showSignInRetry(friendlyError(error, "redirect result"));
  }
}

async function init() {
  bindControls();
  showUser(null);
  if (!isConfigured()) {
    if (els.signIn) els.signIn.disabled = true;
    setStatus("Local only — Firebase sync is not configured yet.");
    return;
  }
  try {
    const [appApi, authApi, firestoreApi] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
    ]);
    firebaseApi = { ...appApi, ...authApi, ...firestoreApi };
    const app = firebaseApi.initializeApp(firebaseConfig);
    auth = firebaseApi.getAuth(app);
    db = firebaseApi.getFirestore(app);
    try {
      await firebaseApi.setPersistence(auth, firebaseApi.browserLocalPersistence);
    } catch (error) {
      const code = error && typeof error.code === "string" ? error.code : "unknown";
      console.warn(`Firebase local auth persistence could not be enabled (${code}).`);
    }
    registerAuthObserver();
    updateControlAvailability();
    await processRedirectResult();
  } catch (error) {
    showUser(null);
    setStatus(friendlyError(error, "initialization"));
  }
}

init();
