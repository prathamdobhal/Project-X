// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  collection,
  addDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

/**
 * Firebase config - ensure these env vars exist in your .env (Vite)
 * VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, ...
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) ?? undefined,
};

const app = initializeApp(firebaseConfig);

/** AUTH **/
const auth = getAuth(app);

/** FIRESTORE **/
export const db = getFirestore(app);

/** STORAGE **/
export const storage = getStorage(app);

export type MaybeUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

function userToMaybeUser(u: User | null): MaybeUser | null {
  if (!u) return null;
  return { uid: u.uid, email: u.email, displayName: u.displayName };
}

/** ---------- Auth helpers ---------- **/

export async function registerWithEmail(displayName: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  // set display name on auth user
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }

  const maybe = userToMaybeUser(cred.user);

  // persist profile to Firestore
  if (maybe) {
    await saveUserProfile(maybe.uid, {
      email: maybe.email ?? null,
      displayName: maybe.displayName ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  return maybe;
}

export async function signInWithEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return userToMaybeUser(cred.user);
}

export async function signInWithGooglePopup() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  // optionally persist profile on Google sign-in
  const maybe = userToMaybeUser(cred.user);
  if (maybe) {
    await saveUserProfile(maybe.uid, {
      email: maybe.email ?? null,
      displayName: maybe.displayName ?? null,
      lastSignedInAt: new Date().toISOString(),
    });
  }
  return maybe;
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export function onAuthState(cb: (u: MaybeUser | null) => void) {
  // returns unsubscribe
  return onAuthStateChanged(auth, (u) => cb(userToMaybeUser(u)));
}

export function getCurrentUser(): MaybeUser | null {
  const u = auth.currentUser;
  return userToMaybeUser(u);
}

/** ---------- Firestore helpers (profiles & simple records) ---------- **/

/**
 * Save or update a user profile under `users/{uid}`.
 * merge semantics used so we don't clobber fields.
 */
export async function saveUserProfile(
  uid: string,
  profile: Partial<MaybeUser & { createdAt?: string; lastSignedInAt?: string }> = {}
) {
  const userRef = doc(db, "users", uid);
  const payload = {
    uid,
    email: profile.email ?? null,
    displayName: profile.displayName ?? null,
    createdAt: profile.createdAt ?? new Date().toISOString(),
    lastSignedInAt: profile.lastSignedInAt ?? null,
  };
  await setDoc(userRef, payload, { merge: true });
  return payload;
}

/** fetch a user profile from Firestore */
export async function fetchUserProfile(uid: string) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return snap.data();
}

/** optional helper to add an audit log or metadata doc in a subcollection */
export async function addUserLog(uid: string, entry: { type: string; message?: string }) {
  const colRef = collection(db, "users", uid, "logs");
  const docRef = await addDoc(colRef, {
    ...entry,
    createdAt: new Date().toISOString(),
  });
  return { id: docRef.id };
}

/** ---------- Storage helpers (file upload) ---------- **/

/**
 * Upload a file to Firebase Storage at path `users/{uid}/{filename}` and
 * create a small metadata entry in Firestore under `users/{uid}/files/{autoId}`
 *
 * Returns { url, path, metadataDoc } where metadataDoc contains the Firestore doc data saved.
 */
export async function uploadUserFile(uid: string, file: File) {
  if (!uid) throw new Error("UID required for upload");
  const safeName = file.name.replace(/\s+/g, "_");
  const storagePath = `users/${uid}/${Date.now()}_${safeName}`;
  const ref = storageRef(storage, storagePath);

  const snap = await uploadBytes(ref, file);
  const url = await getDownloadURL(snap.ref);

  // Save a record in Firestore about the file
  const fileRecord = {
    name: file.name,
    path: snap.metadata.fullPath,
    size: snap.metadata.size,
    contentType: snap.metadata.contentType ?? null,
    url,
    uploadedAt: new Date().toISOString(),
  };

  // store in a subcollection `users/{uid}/files`
  const colRef = collection(db, "users", uid, "files");
  const fileDoc = await addDoc(colRef, fileRecord);

  return {
    url,
    path: snap.metadata.fullPath,
    metadataDoc: { id: fileDoc.id, ...fileRecord },
  };
}

/** ---------- Utility helpers ---------- **/

/** Check whether current authenticated user has a stored profile in Firestore */
export async function currentUserProfile() {
  const u = auth.currentUser;
  if (!u) return null;
  return fetchUserProfile(u.uid);
}
