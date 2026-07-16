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
const AUTO_SYNC_KEY = "homepage.autoSync";
const CLIENT_ID_KEY = "homepage.syncClientId";
const SYNC_BASELINE_KEY = "homepage.syncBaseline";
const SYNC_DIRTY_KEY = "homepage.syncDirty";
const AUTO_SYNC_DELAY_MS = 1500;

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
  autoSync: document.getElementById("sync-auto"),
  revision: document.getElementById("sync-revision"),
  initialDialog: document.getElementById("sync-initial-dialog"),
  initialCloud: document.getElementById("sync-initial-cloud"),
  initialLocal: document.getElementById("sync-initial-local"),
  initialExport: document.getElementById("sync-initial-export"),
  initialOff: document.getElementById("sync-initial-off"),
  conflictDialog: document.getElementById("sync-conflict-dialog"),
  conflictDetails: document.getElementById("sync-conflict-details"),
  conflictCloud: document.getElementById("sync-conflict-cloud"),
  conflictLocal: document.getElementById("sync-conflict-local"),
  conflictExport: document.getElementById("sync-conflict-export"),
  conflictCancel: document.getElementById("sync-conflict-cancel"),
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
let autoSyncEnabled = readBooleanPreference(AUTO_SYNC_KEY);
let clientId = readOrCreateClientId();
let unsubscribeCloud = null;
let cloudListenerGeneration = 0;
let autoSaveTimer = null;
let autoWriteRunning = false;
let pendingAutoState = null;
let localDirty = false;
let applyingRemote = false;
let automaticSyncReady = false;
let automaticSyncPaused = false;
let manualOperation = false;
let currentRevision = 0;
let lastWrittenRevision = 0;
let pendingInitialSnapshot = null;
let pendingConflictSnapshot = null;

function readBooleanPreference(key) {
  try {
    return localStorage.getItem(key) === "on";
  } catch (error) {
    return false;
  }
}

function readOrCreateClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, value);
    return value;
  } catch (error) {
    return `session-${Math.random().toString(36).slice(2)}`;
  }
}

function isConfigured() {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value && value !== "PASTE_VALUE_HERE"
  );
}

function setStatus(message) {
  if (els.status) els.status.textContent = message;
}

function setAutoSyncPreference(enabled) {
  autoSyncEnabled = Boolean(enabled);
  try {
    localStorage.setItem(AUTO_SYNC_KEY, autoSyncEnabled ? "on" : "off");
  } catch (error) {
    console.warn("Automatic-sync preference could not be saved.");
  }
  if (els.autoSync) els.autoSync.value = autoSyncEnabled ? "on" : "off";
  updateSyncDiagnostics();
}

window.homepageGetAutoSyncPreference = () => autoSyncEnabled;

function baselineKey(uid) {
  return `${SYNC_BASELINE_KEY}.${uid}`;
}

function readBaseline(uid) {
  try {
    const value = JSON.parse(localStorage.getItem(baselineKey(uid)) || "null");
    return value && Number.isInteger(value.revision) ? value : null;
  } catch (error) {
    return null;
  }
}

function saveBaseline(uid, metadata) {
  const revision = Number.isInteger(metadata && metadata.revision) ? metadata.revision : 0;
  currentRevision = Math.max(currentRevision, revision);
  try {
    localStorage.setItem(baselineKey(uid), JSON.stringify({ revision, clientId: metadata && metadata.clientId || "" }));
  } catch (error) {
    console.warn("Synchronization baseline could not be saved.");
  }
  updateSyncDiagnostics();
}

function clearBaseline(uid) {
  try {
    localStorage.removeItem(baselineKey(uid));
  } catch (error) {
    console.warn("Synchronization baseline could not be cleared.");
  }
  currentRevision = 0;
  updateSyncDiagnostics();
}

function dirtyKey(uid) {
  return `${SYNC_DIRTY_KEY}.${uid}`;
}

function readDirty(uid) {
  try {
    return localStorage.getItem(dirtyKey(uid)) === "yes";
  } catch (error) {
    return false;
  }
}

function setLocalDirty(value) {
  localDirty = Boolean(value);
  if (!currentUser) return;
  try {
    if (localDirty) localStorage.setItem(dirtyKey(currentUser.uid), "yes");
    else localStorage.removeItem(dirtyKey(currentUser.uid));
  } catch (error) {
    console.warn("Unsynced-change state could not be saved.");
  }
}

function updateSyncDiagnostics() {
  if (!els.revision) return;
  const state = autoSyncEnabled ? (automaticSyncPaused ? "Paused" : "On") : "Off";
  els.revision.textContent = `Automatic sync: ${state} · Revision: ${currentRevision}`;
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
  if (els.autoSync) els.autoSync.disabled = busy || !currentUser;
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
  if (action === "automatic sync" || action === "live sync") return "Sync failed — changes remain saved locally.";
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
  setStatus(autoSyncEnabled ? "Preparing automatic sync" : "Signed in — automatic sync off");
  updateSyncDiagnostics();
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

function syncMetadataFrom(data) {
  const metadata = data && data.syncMetadata;
  if (!metadata || typeof metadata !== "object") return { clientId: "", revision: 0, schemaVersion: 1 };
  return {
    clientId: typeof metadata.clientId === "string" ? metadata.clientId : "",
    revision: Number.isInteger(metadata.revision) && metadata.revision >= 0 ? metadata.revision : 0,
    schemaVersion: Number.isInteger(metadata.schemaVersion) ? metadata.schemaVersion : 1,
  };
}

function stopAutomaticSync({ cancelPending = true } = {}) {
  cloudListenerGeneration += 1;
  if (unsubscribeCloud) {
    unsubscribeCloud();
    unsubscribeCloud = null;
  }
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  automaticSyncReady = false;
  if (cancelPending) pendingAutoState = null;
}

function scheduleAutomaticUpload() {
  if (applyingRemote || !autoSyncEnabled) return;
  setLocalDirty(true);
  pendingAutoState = getDashboardSnapshot();
  if (!currentUser || !automaticSyncReady || automaticSyncPaused || manualOperation) {
    setStatus(navigator.onLine ? "Unsynced local changes" : "Offline — saved locally");
    return;
  }
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  setStatus(navigator.onLine ? "Unsynced local changes" : "Offline — saved locally");
  autoSaveTimer = setTimeout(flushAutomaticUpload, AUTO_SYNC_DELAY_MS);
}

async function flushAutomaticUpload() {
  autoSaveTimer = null;
  if (autoWriteRunning || !pendingAutoState || !currentUser || !autoSyncEnabled ||
      !automaticSyncReady || automaticSyncPaused || manualOperation) return;
  if (!navigator.onLine) {
    setStatus("Offline — saved locally");
    return;
  }
  autoWriteRunning = true;
  const state = pendingAutoState;
  pendingAutoState = null;
  const revision = currentRevision + 1;
  lastWrittenRevision = revision;
  setStatus("Syncing");
  try {
    await firebaseApi.setDoc(cloudRef(), {
      ...state,
      updatedAt: firebaseApi.serverTimestamp(),
      syncMetadata: {
        clientId,
        revision,
        schemaVersion: state.schemaVersion,
        updatedAt: firebaseApi.serverTimestamp(),
      },
    });
    currentRevision = revision;
    setLocalDirty(Boolean(pendingAutoState));
    saveBaseline(currentUser.uid, { clientId, revision });
    saveLastSync(currentUser.uid, "automatic upload", new Date().toISOString());
    setStatus(localDirty ? "Unsynced local changes" : "Synced");
  } catch (error) {
    pendingAutoState = getDashboardSnapshot();
    setLocalDirty(true);
    setStatus(navigator.onLine ? friendlyError(error, "automatic sync") : "Offline — saved locally");
  } finally {
    autoWriteRunning = false;
    if (pendingAutoState && navigator.onLine) {
      autoSaveTimer = setTimeout(flushAutomaticUpload, AUTO_SYNC_DELAY_MS);
    }
  }
}

function applyRemoteSnapshot(data, metadata, message = "Updated from another device") {
  const clean = validateDashboardSnapshot(data);
  if (!clean) {
    setStatus("Sync failed — cloud data is invalid.");
    return false;
  }
  applyingRemote = true;
  const applied = applyDashboardSnapshot(clean);
  applyingRemote = false;
  if (!applied) {
    setStatus("Sync failed — cloud data could not be saved locally.");
    return false;
  }
  pendingAutoState = null;
  setLocalDirty(false);
  saveBaseline(currentUser.uid, metadata);
  const timestamp = formatTimestamp(data.updatedAt) || new Date().toISOString();
  saveLastSync(currentUser.uid, "remote update", timestamp);
  setStatus(message);
  return true;
}

function openInitialDecision(snapshot) {
  pendingInitialSnapshot = snapshot;
  automaticSyncPaused = true;
  setStatus("Preparing automatic sync");
  updateSyncDiagnostics();
  if (els.initialDialog && !els.initialDialog.open) els.initialDialog.showModal();
}

function openConflict(snapshot) {
  pendingConflictSnapshot = snapshot;
  automaticSyncPaused = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  const data = snapshot.data();
  const timestamp = formatTimestamp(data.updatedAt) || "pending server time";
  if (els.conflictDetails) {
    els.conflictDetails.textContent = `Cloud version: ${timestamp}. This device also has unsynced local changes.`;
  }
  setStatus("Conflict — action required");
  updateSyncDiagnostics();
  if (els.conflictDialog && !els.conflictDialog.open) els.conflictDialog.showModal();
}

function handleCloudSnapshot(snapshot) {
  if (!autoSyncEnabled || manualOperation || automaticSyncPaused) return;
  if (!snapshot.exists()) {
    cloudExists = false;
    const baseline = readBaseline(currentUser.uid);
    if (!baseline) {
      automaticSyncReady = true;
      pendingAutoState = getDashboardSnapshot();
      setLocalDirty(true);
      flushAutomaticUpload();
    } else {
      setAutoSyncPreference(false);
      stopAutomaticSync();
      setStatus("Cloud copy is missing — automatic sync turned off.");
    }
    return;
  }

  cloudExists = true;
  const data = snapshot.data();
  const clean = validateDashboardSnapshot(data);
  if (!clean) {
    automaticSyncPaused = true;
    setStatus("Sync failed — cloud data is invalid.");
    return;
  }
  const metadata = syncMetadataFrom(data);
  currentRevision = Math.max(currentRevision, metadata.revision);
  updateSyncDiagnostics();
  const baseline = readBaseline(currentUser.uid);
  if (metadata.clientId === clientId && metadata.revision === lastWrittenRevision) {
    setLocalDirty(Boolean(pendingAutoState));
    saveBaseline(currentUser.uid, metadata);
    automaticSyncReady = true;
    setStatus(localDirty ? "Unsynced local changes" : "Synced");
    return;
  }
  if (!baseline) {
    openInitialDecision(snapshot);
    return;
  }
  automaticSyncReady = true;
  const matchesBaseline = metadata.revision === baseline.revision && metadata.clientId === baseline.clientId;
  if (metadata.revision < baseline.revision || matchesBaseline) {
    setStatus(localDirty ? "Unsynced local changes" : "Synced");
    if (pendingAutoState && !automaticSyncPaused) {
      autoSaveTimer = setTimeout(flushAutomaticUpload, AUTO_SYNC_DELAY_MS);
    }
    return;
  }
  if (metadata.clientId !== clientId && localDirty) {
    openConflict(snapshot);
    return;
  }
  if (metadata.clientId !== clientId) applyRemoteSnapshot(data, metadata);
  else saveBaseline(currentUser.uid, metadata);
}

function startAutomaticSync() {
  stopAutomaticSync({ cancelPending: false });
  if (!currentUser || !autoSyncEnabled || !firebaseApi) return;
  automaticSyncPaused = false;
  automaticSyncReady = false;
  const baseline = readBaseline(currentUser.uid);
  currentRevision = baseline ? baseline.revision : 0;
  localDirty = readDirty(currentUser.uid);
  if (localDirty && !pendingAutoState) pendingAutoState = getDashboardSnapshot();
  setStatus("Preparing automatic sync");
  updateSyncDiagnostics();
  const generation = cloudListenerGeneration;
  unsubscribeCloud = firebaseApi.onSnapshot(cloudRef(), (snapshot) => {
    if (generation === cloudListenerGeneration) handleCloudSnapshot(snapshot);
  }, (error) => {
    if (generation !== cloudListenerGeneration) return;
    unsubscribeCloud = null;
    automaticSyncReady = false;
    setStatus(navigator.onLine ? friendlyError(error, "live sync") : "Offline — saved locally");
  });
}

async function uploadLocal() {
  if (!currentUser || busy) return;
  const resumeAuto = autoSyncEnabled;
  manualOperation = true;
  stopAutomaticSync({ cancelPending: false });
  setBusy(true);
  setStatus("Uploading…");
  try {
    const existing = await firebaseApi.getDoc(cloudRef());
    if (existing.exists()) {
      currentRevision = Math.max(currentRevision, syncMetadataFrom(existing.data()).revision);
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
    const revision = currentRevision + 1;
    await firebaseApi.setDoc(cloudRef(), {
      ...local,
      updatedAt: firebaseApi.serverTimestamp(),
      syncMetadata: { clientId, revision, schemaVersion: local.schemaVersion, updatedAt: firebaseApi.serverTimestamp() },
    });
    currentRevision = revision;
    setLocalDirty(false);
    pendingAutoState = null;
    saveBaseline(currentUser.uid, { clientId, revision });
    cloudExists = true;
    if (els.notice) els.notice.hidden = true;
    saveLastSync(currentUser.uid, "upload", new Date().toISOString());
    setStatus("Synced — this device was uploaded.");
  } catch (error) {
    setStatus(friendlyError(error, "upload"));
  } finally {
    setBusy(false);
    manualOperation = false;
    if (resumeAuto && currentUser) startAutomaticSync();
  }
}

async function downloadCloud() {
  if (!currentUser || busy) return;
  const resumeAuto = autoSyncEnabled;
  manualOperation = true;
  stopAutomaticSync({ cancelPending: false });
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
    const metadata = syncMetadataFrom(cloud);
    setLocalDirty(false);
    pendingAutoState = null;
    saveBaseline(currentUser.uid, metadata);
    if (els.notice) els.notice.hidden = true;
    const updated = formatTimestamp(cloud.updatedAt) || new Date().toISOString();
    saveLastSync(currentUser.uid, "download", updated);
    setStatus("Synced — cloud data is now on this device.");
  } catch (error) {
    setStatus(friendlyError(error, "download"));
  } finally {
    setBusy(false);
    manualOperation = false;
    if (resumeAuto && currentUser) startAutomaticSync();
  }
}

async function deleteCloud() {
  if (!currentUser || busy) return;
  const confirmed = window.confirm(
    "Delete only this account’s cloud dashboard copy? Local data and your Google/Firebase account will remain. " +
    "Other devices will no longer be able to download this copy."
  );
  if (!confirmed) return;
  manualOperation = true;
  stopAutomaticSync();
  setBusy(true);
  setStatus("Deleting cloud copy…");
  try {
    await firebaseApi.deleteDoc(cloudRef());
    setAutoSyncPreference(false);
    clearBaseline(currentUser.uid);
    cloudExists = false;
    if (els.notice) els.notice.hidden = true;
    setStatus("Cloud copy deleted. Local data was not changed.");
  } catch (error) {
    setStatus(friendlyError(error, "delete"));
  } finally {
    setBusy(false);
    manualOperation = false;
    if (autoSyncEnabled && currentUser) startAutomaticSync();
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
  if (els.autoSync) {
    els.autoSync.value = autoSyncEnabled ? "on" : "off";
    els.autoSync.addEventListener("change", () => {
      const enabled = els.autoSync.value === "on";
      setAutoSyncPreference(enabled);
      if (enabled) {
        if (!window.confirm("Automatic sync can replace this device or cloud copy. Export a backup first if needed. Enable now?")) {
          setAutoSyncPreference(false);
          return;
        }
        startAutomaticSync();
      } else {
        automaticSyncPaused = false;
        stopAutomaticSync();
        setStatus(currentUser ? "Signed in — automatic sync off" : "Local only");
      }
    });
  }
  if (els.export) els.export.addEventListener("click", () => {
    if (typeof window.homepageExportBackup === "function") window.homepageExportBackup();
  });
  if (els.initialExport) els.initialExport.addEventListener("click", () => window.homepageExportBackup?.());
  if (els.initialOff) els.initialOff.addEventListener("click", () => {
    pendingInitialSnapshot = null;
    setAutoSyncPreference(false);
    automaticSyncPaused = false;
    stopAutomaticSync();
    els.initialDialog?.close();
    setStatus("Signed in — automatic sync off");
  });
  if (els.initialCloud) els.initialCloud.addEventListener("click", () => {
    if (!pendingInitialSnapshot) return;
    const snapshot = pendingInitialSnapshot;
    pendingInitialSnapshot = null;
    automaticSyncPaused = false;
    automaticSyncReady = true;
    applyRemoteSnapshot(snapshot.data(), syncMetadataFrom(snapshot.data()), "Synced — cloud version selected");
    els.initialDialog?.close();
  });
  if (els.initialLocal) els.initialLocal.addEventListener("click", () => {
    const metadata = pendingInitialSnapshot ? syncMetadataFrom(pendingInitialSnapshot.data()) : { revision: 0 };
    currentRevision = Math.max(currentRevision, metadata.revision);
    pendingInitialSnapshot = null;
    automaticSyncPaused = false;
    automaticSyncReady = true;
    pendingAutoState = getDashboardSnapshot();
    setLocalDirty(true);
    els.initialDialog?.close();
    flushAutomaticUpload();
  });
  if (els.conflictExport) els.conflictExport.addEventListener("click", () => window.homepageExportBackup?.());
  if (els.conflictCloud) els.conflictCloud.addEventListener("click", () => {
    if (!pendingConflictSnapshot) return;
    const snapshot = pendingConflictSnapshot;
    pendingConflictSnapshot = null;
    automaticSyncPaused = false;
    automaticSyncReady = true;
    applyRemoteSnapshot(snapshot.data(), syncMetadataFrom(snapshot.data()), "Updated from another device");
    els.conflictDialog?.close();
  });
  if (els.conflictLocal) els.conflictLocal.addEventListener("click", () => {
    if (pendingConflictSnapshot) currentRevision = Math.max(currentRevision, syncMetadataFrom(pendingConflictSnapshot.data()).revision);
    pendingConflictSnapshot = null;
    automaticSyncPaused = false;
    automaticSyncReady = true;
    pendingAutoState = getDashboardSnapshot();
    setLocalDirty(true);
    els.conflictDialog?.close();
    flushAutomaticUpload();
  });
  if (els.conflictCancel) els.conflictCancel.addEventListener("click", () => {
    pendingConflictSnapshot = null;
    automaticSyncPaused = true;
    els.conflictDialog?.close();
    setStatus("Conflict — automatic sync paused");
    updateSyncDiagnostics();
  });
  document.addEventListener("homepage:local-change", scheduleAutomaticUpload);
  document.addEventListener("homepage:import-complete", (event) => {
    if (event.detail && typeof event.detail.automaticSync === "boolean") {
      setAutoSyncPreference(event.detail.automaticSync);
      if (autoSyncEnabled && currentUser) startAutomaticSync();
      if (!autoSyncEnabled) stopAutomaticSync();
    }
    if (autoSyncEnabled) scheduleAutomaticUpload();
  });
  window.addEventListener("offline", () => {
    if (autoSyncEnabled && localDirty) setStatus("Offline — saved locally");
    else setStatus("Offline — changes saved locally");
  });
  window.addEventListener("online", () => {
    if (autoSyncEnabled && currentUser && !unsubscribeCloud && !automaticSyncPaused) startAutomaticSync();
    else if (autoSyncEnabled && pendingAutoState && automaticSyncReady && !automaticSyncPaused) flushAutomaticUpload();
    else setStatus(currentUser ? (autoSyncEnabled ? "Synced" : "Signed in — automatic sync off") : authErrorMessage || "Local only");
  });
}

function registerAuthObserver() {
  if (authObserverRegistered) return;
  authObserverRegistered = true;
  firebaseApi.onAuthStateChanged(auth, async (user) => {
    if (!user) {
      stopAutomaticSync();
      automaticSyncPaused = false;
      currentRevision = 0;
    }
    currentUser = user;
    cloudExists = false;
    if (user) authErrorMessage = "";
    showUser(user);
    if (!firstAuthStateResolved) {
      firstAuthStateResolved = true;
      resolveFirstAuthState(user);
    }
    if (user) {
      await inspectCloud();
      if (autoSyncEnabled) startAutomaticSync();
    }
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
