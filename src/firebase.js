// ==================================================================
// firebase.js - Firebase Initialization & Data Access Layer
// ==================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection, addDoc, onSnapshot, doc,
    deleteDoc, setDoc, getDoc, getDocs, updateDoc,
    query, where, writeBatch, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { FIREBASE_CONFIG } from './config.js';
import { AppState } from './state.js';
import { showMessage } from './ui.js';

let authReadyResolver;
export const authReady = new Promise(resolve => { authReadyResolver = resolve; });

// ─── Initialize Firebase ───────────────────────────────────────────
export async function initFirebase() {
    try {
        const app = initializeApp(FIREBASE_CONFIG);
        AppState.db = getFirestore(app);
        AppState.auth = getAuth(app);
        AppState.isLocalMode = false;

        // Auth state listener
        onAuthStateChanged(AppState.auth, async user => {
            if (user) {
                AppState.userId = user.uid;
                authReadyResolver();
            } else {
                try {
                    await signInAnonymously(AppState.auth);
                } catch (error) {
                    console.error("Sign-in failed:", error);
                    AppState.isLocalMode = true;
                    AppState.userId = 'localUser';
                    authReadyResolver();
                    showMessage("فشل الاتصال بقاعدة البيانات. التشغيل في الوضع المحلي.", true);
                }
            }
        });

    } catch (error) {
        console.error("Firebase init failed:", error);
        AppState.isLocalMode = true;
        AppState.userId = 'localUser';
        authReadyResolver();
        showMessage("تعذّر الاتصال بالسيرفر. التشغيل في الوضع المحلي.", true);
    }
}


// ─── Firestore Helpers ─────────────────────────────────────────────
export function getServiceCol(collectionName, serviceName = null) {
    const sName = serviceName || AppState.currentServiceName;
    return collection(AppState.db, 'services', sName, collectionName);
}

export function getServiceDoc(collectionName, docId, serviceName = null) {
    const sName = serviceName || AppState.currentServiceName;
    return doc(AppState.db, 'services', sName, collectionName, docId);
}

export async function fetchCollection(colRef) {
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

export async function saveDoc(colRef, data) {
    return await addDoc(colRef, data);
}

export async function updateDocById(colRef, id, data) {
    const docRef = doc(AppState.db, colRef.path, id);
    return await updateDoc(docRef, data);
}

export async function deleteDocById(docRef) {
    return await deleteDoc(docRef);
}

// ─── Gemini API Key Management (stored in Firestore) ──────────────
export async function loadGeminiKeyFromFirestore() {
    await authReady;
    if (AppState.isLocalMode) return null;
    try {
        const configDoc = await getDoc(doc(AppState.db, '_config', 'gemini'));
        if (configDoc.exists()) {
            AppState.geminiApiKey = configDoc.data().apiKey || null;
        }
    } catch (e) {
        // Key not set yet or access denied
        AppState.geminiApiKey = null;
    }
    return AppState.geminiApiKey;
}

export async function saveGeminiKeyToFirestore(key) {
    await authReady;
    if (AppState.isLocalMode) {
        // Fallback to localStorage in local mode
        localStorage.setItem('geminiApiKey', key);
        AppState.geminiApiKey = key;
        return;
    }
    try {
        await setDoc(doc(AppState.db, '_config', 'gemini'), { apiKey: key }, { merge: true });
        AppState.geminiApiKey = key;
        showMessage('تم حفظ مفتاح الذكاء الاصطناعي بنجاح ✓');
    } catch (e) {
        // Fallback to localStorage if Firestore write fails
        localStorage.setItem('geminiApiKey', key);
        AppState.geminiApiKey = key;
        showMessage('تم الحفظ محلياً (قد تحتاج صلاحيات Firestore)');
    }
}

// ─── Local Storage Fallbacks ───────────────────────────────────────
export const Local = {
    get: (key) => JSON.parse(localStorage.getItem(key) || 'null'),
    set: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
    servants: (sName) => Local.get(`servants-${sName}`) || [],
    saveServants: (data, sName) => Local.set(`servants-${sName}`, data),
    attendance: (sName) => Local.get(`attendance-${sName}`) || {},
    saveAttendance: (data, sName) => Local.set(`attendance-${sName}`, data),
};

// ─── Re-export Firestore functions needed by other modules ─────────
export {
    collection, addDoc, onSnapshot, doc,
    deleteDoc, setDoc, getDoc, getDocs, updateDoc,
    query, where, writeBatch, orderBy, serverTimestamp
};
