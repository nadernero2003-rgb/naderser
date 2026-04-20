// ==================================================================
// offlineSync.js - Offline Support with IndexedDB + Auto-Sync
// ==================================================================

const DB_NAME = 'khedmaty-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pendingAttendance';

/**
 * Open the IndexedDB database
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save attendance data locally when offline
 * @param {Object} data - { serviceName, dateStr, activityKey, payload }
 */
export async function saveOfflineAttendance(data) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({
            ...data,
            savedAt: new Date().toISOString()
        });
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
        return true;
    } catch (e) {
        console.error('Failed to save offline:', e);
        return false;
    }
}

/**
 * Get all pending offline records
 */
export async function getPendingRecords() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Failed to get pending records:', e);
        return [];
    }
}

/**
 * Remove a synced record from IndexedDB
 */
export async function removePendingRecord(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
    } catch (e) {
        console.error('Failed to remove record:', e);
    }
}

/**
 * Check if we're online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Sync all pending offline records to Firebase
 * @param {Function} syncFn - async function(record) that saves to Firebase
 * @returns {Object} { synced: number, failed: number }
 */
export async function syncPendingRecords(syncFn) {
    if (!isOnline()) return { synced: 0, failed: 0 };

    const records = await getPendingRecords();
    let synced = 0, failed = 0;

    for (const record of records) {
        try {
            await syncFn(record);
            await removePendingRecord(record.id);
            synced++;
        } catch (e) {
            console.error('Sync failed for record:', record.id, e);
            failed++;
        }
    }

    return { synced, failed };
}

/**
 * Get the count of pending offline records
 */
export async function getPendingCount() {
    const records = await getPendingRecords();
    return records.length;
}

/**
 * Show offline indicator banner
 */
export function initOfflineIndicator() {
    // Create offline banner
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full text-sm font-bold shadow-lg transition-all duration-300 transform translate-y-20 opacity-0';
    banner.style.cssText = 'pointer-events: none;';
    document.body.appendChild(banner);

    function updateBanner() {
        if (!navigator.onLine) {
            banner.textContent = '📴 لا يوجد اتصال — البيانات تُحفظ محلياً';
            banner.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
            banner.style.color = 'white';
            banner.style.transform = 'translate(-50%, 0)';
            banner.style.opacity = '1';
        } else {
            // Check for pending records
            getPendingCount().then(count => {
                if (count > 0) {
                    banner.textContent = `🔄 جاري مزامنة ${count} سجل...`;
                    banner.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                    banner.style.color = 'white';
                    banner.style.transform = 'translate(-50%, 0)';
                    banner.style.opacity = '1';
                } else {
                    banner.style.transform = 'translate(-50%, 20px)';
                    banner.style.opacity = '0';
                }
            });
        }
    }

    window.addEventListener('online', () => {
        updateBanner();
        // Dispatch custom event for sync
        window.dispatchEvent(new CustomEvent('app-online'));
    });

    window.addEventListener('offline', updateBanner);

    // Initial check
    updateBanner();
}
