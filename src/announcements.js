// ==================================================================
// announcements.js - Announcements + Correspondence
// ==================================================================

import { AppState } from './state.js';
import {
    authReady, Local, collection, addDoc, onSnapshot, doc, deleteDoc,
    query, where, orderBy, serverTimestamp, getDocs, updateDoc
} from './firebase.js';
import { DOM, showMessage, updateBadge } from './ui.js';
import { SERVICES, ANNOUNCEMENTS_PER_PAGE } from './config.js';

// ─── Announcement Listeners ────────────────────────────────────────
export function listenForAnnouncements() {
    if (AppState.subscriptions.announcements) AppState.subscriptions.announcements();
    if (AppState.isLocalMode) return;

    const col = collection(AppState.db, 'announcements');
    const q = query(col, orderBy('timestamp', 'desc'));
    AppState.subscriptions.announcements = onSnapshot(q, snap => {
        AppState.allAnnouncementsCache = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (AppState.isGeneralSecretaryMode) {
            renderAdminAnnouncementsList(AppState.allAnnouncementsCache);
        }
    }, err => console.error('announcements:', err));
}

// ─── Service Announcements (read by non-admin) ─────────────────────
export function listenForServiceAnnouncements() {
    if (AppState.subscriptions.serviceAnnouncements) AppState.subscriptions.serviceAnnouncements();
    if (AppState.isLocalMode) return;

    const col = collection(AppState.db, 'announcements');
    const q = query(col, orderBy('timestamp', 'desc'));
    AppState.subscriptions.serviceAnnouncements = onSnapshot(q, snap => {
        const all = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const relevant = all.filter(a =>
            a.targetServices?.includes('all') ||
            a.targetServices?.includes(AppState.currentServiceName)
        );
        AppState.unreadAnnouncementsCache = relevant;
        renderServiceBulletinBoard(relevant);
        updateUnreadAnnouncementsBadge(relevant);
    }, err => console.error('service announcements:', err));
}

function updateUnreadAnnouncementsBadge(announcements) {
    const lastRead = Local.get(`lastReadAnn-${AppState.currentServiceName}`) || 0;
    const unread = announcements.filter(a => (a.timestamp?.toMillis?.() || 0) > lastRead).length;
    updateBadge(DOM.serviceAnnouncementsBadge, unread);
}

// ─── Render Bulletin Board ─────────────────────────────────────────
export function renderServiceBulletinBoard(announcements) {
    if (!DOM.bulletinBoard) return;
    AppState.displayedAnnouncementsCount = ANNOUNCEMENTS_PER_PAGE;
    const toShow = announcements.slice(0, ANNOUNCEMENTS_PER_PAGE);

    if (!toShow.length) {
        DOM.bulletinBoard.innerHTML = `<div class="col-span-3 text-center py-16 text-amber-800 font-semibold opacity-70">لا توجد إعلانات حالياً.</div>`;
        DOM.loadMoreAnnouncementsContainer?.classList.add('hidden-view');
        return;
    }

    DOM.bulletinBoard.innerHTML = toShow.map(a => buildNoteCard(a)).join('');
    const hasMore = announcements.length > ANNOUNCEMENTS_PER_PAGE;
    DOM.loadMoreAnnouncementsContainer?.classList.toggle('hidden-view', !hasMore);
}

function buildNoteCard(ann) {
    const ts = ann.timestamp?.toDate?.()?.toLocaleDateString('ar-EG') || '';
    const colors = ['#fffde7', '#e8f5e9', '#fce4ec', '#e3f2fd', '#f3e5f5'];
    const rotations = ['rotate-1', '-rotate-1', 'rotate-2', '-rotate-2', 'rotate-0'];
    const ri = Math.floor(Math.random() * colors.length);
    return `
        <div class="announcement-note relative p-5 rounded-lg ${rotations[ri]} m-2" style="background:${colors[ri]}">
            <p class="text-base font-medium leading-relaxed text-gray-800 mb-3 whitespace-pre-line">${ann.text || ''}</p>
            <div class="flex justify-between items-center text-xs text-gray-500">
                <span>${ann.senderName || 'الأمين العام'}</span>
                <span>${ts}</span>
            </div>
        </div>`;
}

export function loadMoreAnnouncements() {
    const next = AppState.unreadAnnouncementsCache.slice(
        AppState.displayedAnnouncementsCount,
        AppState.displayedAnnouncementsCount + ANNOUNCEMENTS_PER_PAGE
    );
    if (!next.length) { DOM.loadMoreAnnouncementsContainer?.classList.add('hidden-view'); return; }
    DOM.bulletinBoard.insertAdjacentHTML('beforeend', next.map(a => buildNoteCard(a)).join(''));
    AppState.displayedAnnouncementsCount += ANNOUNCEMENTS_PER_PAGE;
    if (AppState.displayedAnnouncementsCount >= AppState.unreadAnnouncementsCache.length) {
        DOM.loadMoreAnnouncementsContainer?.classList.add('hidden-view');
    }
}

export function markServiceAnnouncementsAsRead() {
    Local.set(`lastReadAnn-${AppState.currentServiceName}`, Date.now());
    updateBadge(DOM.serviceAnnouncementsBadge, 0);
}

// ─── Admin announcement board ──────────────────────────────────────
export function populateAnnouncementTargetSelector() {
    const container = DOM.announcementTarget;
    if (!container) return;
    container.innerHTML = `
        <label class="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
            <input type="checkbox" value="all" class="announcement-target-check w-4 h-4 rounded">
            <span class="font-bold">كل الخدمات</span>
        </label>
        ${SERVICES.filter(s => !s.isGroup).map(s => `
        <label class="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
            <input type="checkbox" value="${s.name}" class="announcement-target-check w-4 h-4 rounded">
            <span>${s.name}</span>
        </label>`).join('')}`;
}

export async function sendAnnouncement() {
    const text = DOM.newAnnouncementInput?.value?.trim();
    if (!text) { showMessage('اكتب محتوى الإعلان أولاً.', true); return; }

    const targets = [...document.querySelectorAll('.announcement-target-check:checked')].map(c => c.value);
    if (!targets.length) { showMessage('اختر خدمة واحدة على الأقل.', true); return; }

    try {
        await addDoc(collection(AppState.db, 'announcements'), {
            text, targetServices: targets, senderName: 'الأمين العام',
            timestamp: serverTimestamp()
        });
        DOM.newAnnouncementInput.value = '';
        document.querySelectorAll('.announcement-target-check').forEach(c => c.checked = false);
        showMessage('تم إرسال الإعلان ✓');
    } catch (e) {
        console.error(e);
        showMessage('فشل الإرسال.', true);
    }
}

export function renderAdminAnnouncementsList(announcements) {
    if (!DOM.adminAnnouncementsList) return;
    if (!announcements.length) {
        DOM.adminAnnouncementsList.innerHTML = `<p class="text-slate-400 text-center text-sm">لا توجد إعلانات مرسلة.</p>`;
        return;
    }
    DOM.adminAnnouncementsList.innerHTML = announcements.slice(0, 20).map(ann => {
        const ts = ann.timestamp?.toDate?.()?.toLocaleDateString('ar-EG') || '';
        const targets = ann.targetServices?.join('، ') || 'الكل';
        return `<div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border dark:border-slate-600 relative group">
            <button onclick="deleteAnnouncement('${ann.id}')" class="absolute top-2 left-2 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                <i class="fas fa-trash"></i>
            </button>
            <p class="text-sm whitespace-pre-line mb-2 pr-2">${ann.text}</p>
            <div class="flex justify-between text-xs text-slate-400">
                <span><i class="fas fa-send ml-1"></i>${targets}</span>
                <span>${ts}</span>
            </div>
        </div>`;
    }).join('');
}

window.deleteAnnouncement = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;
    try {
        await deleteDoc(doc(AppState.db, 'announcements', id));
        showMessage('تم حذف الإعلان ✓');
    } catch (e) {
        console.error('Delete announcement error:', e);
        showMessage('حدث خطأ أثناء الحذف', true);
    }
};

// ─── Correspondence (Notes to Admin) ──────────────────────────────
export function listenForSentNotes() {
    if (AppState.subscriptions.notes) AppState.subscriptions.notes();
    if (AppState.isLocalMode) return;

    const col = collection(AppState.db, 'notesToAdmin');
    const q = query(col,
        where('senderService', '==', AppState.currentServiceName),
        orderBy('timestamp', 'desc')
    );
    AppState.subscriptions.notes = onSnapshot(q, snap => {
        const notes = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        renderSentNotes(notes);
    }, err => console.error('sent notes:', err));
}

export function listenForIncomingNotes() {
    if (AppState.subscriptions.incomingNotes) AppState.subscriptions.incomingNotes();
    if (AppState.isLocalMode) return;

    const col = collection(AppState.db, 'notesToAdmin');
    const q = query(col, orderBy('timestamp', 'desc'));
    AppState.subscriptions.incomingNotes = onSnapshot(q, snap => {
        AppState.unreadNotes = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        renderIncomingNotes(AppState.unreadNotes);
        const unread = AppState.unreadNotes.filter(n => !n.isRead).length;
        AppState.unreadNotesCount = unread;
        updateBadge(DOM.correspondenceBadge, unread);
        updateAdminBadge(unread);
    }, err => console.error('incoming notes:', err));
}

function updateAdminBadge(count) {
    const gsCard = SERVICES.find(s => s.isGroup);
    if (!gsCard) return;
    // 1. Update service card badge (shown on login screen)
    const badgeId = `service-badge-${gsCard.name.replace(/\s+/g, '-')}`;
    const badge = document.getElementById(badgeId);
    updateBadge(badge, count);
    // 2. Update sidebar correspondence center badge (shown while logged in)
    const sidebarBadge = document.getElementById('correspondenceCenterBadge');
    updateBadge(sidebarBadge, count);
}

export async function sendNoteToAdmin() {
    const text = DOM.noteToAdminInput?.value?.trim();
    if (!text) { showMessage('اكتب رسالتك أولاً.', true); return; }

    try {
        await addDoc(collection(AppState.db, 'notesToAdmin'), {
            text, senderService: AppState.currentServiceName,
            isRead: false, timestamp: serverTimestamp()
        });
        DOM.noteToAdminInput.value = '';
        showMessage('تم إرسال الرسالة ✓');
    } catch (e) {
        console.error(e);
        showMessage('فشل الإرسال.', true);
    }
}

function renderSentNotes(notes) {
    if (!DOM.sentNotesHistory) return;
    if (!notes.length) {
        DOM.sentNotesHistory.innerHTML = `<p class="text-slate-400 text-sm text-center">لم ترسل أي رسائل بعد.</p>`;
        return;
    }
    DOM.sentNotesHistory.innerHTML = notes.map(n => {
        const ts = n.timestamp?.toDate?.()?.toLocaleDateString('ar-EG') || '';
        return `<div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm border dark:border-slate-600 relative group">
            <div class="flex justify-between items-start mb-1">
                <p class="mb-1 text-slate-700 dark:text-slate-300 pr-4">${n.text}</p>
                <button class="delete-sent-note-btn text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 flex-shrink-0" data-id="${n.id}" title="حذف الرسالة">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
            <p class="text-xs text-slate-400">${ts}</p>
        </div>`;
    }).join('');

    // Attach listeners
    DOM.sentNotesHistory.querySelectorAll('.delete-sent-note-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            if (!confirm('هل أنت متأكد من حذف هذه الرسالة المرسلة؟')) return;
            try {
                await deleteDoc(doc(AppState.db, 'notesToAdmin', btn.dataset.id));
                showMessage('تم حذف الرسالة بنجاح');
            } catch (err) {
                console.error(err);
                showMessage('فشل حذف الرسالة', true);
            }
        };
    });
}

function renderIncomingNotes(notes) {
    if (!DOM.incomingNotesContainer) return;
    if (!notes.length) {
        DOM.incomingNotesContainer.innerHTML = `<p class="text-slate-400 text-center text-sm py-8">لا توجد رسائل.</p>`;
        return;
    }
    DOM.incomingNotesContainer.innerHTML = notes.map(n => {
        const ts = n.timestamp?.toDate?.()?.toLocaleDateString('ar-EG') || '';
        const unread = !n.isRead ? 'unread-note' : '';
        return `
        <div class="p-4 bg-white dark:bg-slate-700 rounded-xl border dark:border-slate-600 shadow-sm relative group ${unread}">
            <div class="flex justify-between items-start mb-2">
                <span class="font-bold text-teal-600">${n.senderService || 'غير معروف'}</span>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400">${ts}</span>
                    <button class="delete-note-btn text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1" data-id="${n.id}" title="حذف الرسالة">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                </div>
            </div>
            <p class="text-sm whitespace-pre-line text-slate-700 dark:text-slate-300 leading-relaxed">${n.text}</p>
        </div>`;
    }).join('');

    // Attach listeners
    DOM.incomingNotesContainer.querySelectorAll('.delete-note-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            if (!confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
            try {
                await deleteDoc(doc(AppState.db, 'notesToAdmin', btn.dataset.id));
                showMessage('تم حذف الرسالة بنجاح');
            } catch (err) {
                console.error(err);
                showMessage('فشل حذف الرسالة', true);
            }
        };
    });
}

export async function markNotesAsRead() {
    if (AppState.isLocalMode || !AppState.isGeneralSecretaryMode) return;
    const unread = AppState.unreadNotes.filter(n => !n.isRead);
    if (!unread.length) return;

    // Optimistic UI Update
    updateBadge(DOM.correspondenceBadge, 0);
    updateAdminBadge(0);

    await Promise.all(unread.map(n =>
        updateDoc(doc(AppState.db, 'notesToAdmin', n.id), { isRead: true })
    ));
}

// ─── Update Service Card Badges (for main page) ────────────────────
export async function updateServiceCardBadges() {
    await authReady;
    if (AppState.isLocalMode) return;
    try {
        const col = collection(AppState.db, 'announcements');
        const snap = await getDocs(query(col, orderBy('timestamp', 'desc')));
        const all = snap.docs.map(d => ({ ...d.data(), id: d.id }));

        // 1. Regular Services (Announcements)
        SERVICES.filter(s => !s.isGroup).forEach(service => {
            const lastRead = Local.get(`lastReadAnn-${service.name}`) || 0;
            const relevant = all.filter(a =>
                a.targetServices?.includes('all') || a.targetServices?.includes(service.name)
            );
            const unread = relevant.filter(a => (a.timestamp?.toMillis?.() || 0) > lastRead).length;
            const badgeId = `service-badge-${service.name.replace(/\s+/g, '-')}`;
            updateBadge(document.getElementById(badgeId), unread);
        });

        // 2. General Secretary Card (Group Service - Combined Badge)
        const gsCard = SERVICES.find(s => s.isGroup);
        if (gsCard) {
            // Unread Announcements for GS
            const lastRead = Local.get(`lastReadAnn-${gsCard.name}`) || 0;
            const relevantAnn = all.filter(a =>
                a.targetServices?.includes('all') || a.targetServices?.includes(gsCard.name)
            );
            const unreadAnnCount = relevantAnn.filter(a => (a.timestamp?.toMillis?.() || 0) > lastRead).length;

            // Unread Notes (Incoming Correspondence)
            // Fetch directly from Firestore for accuracy on initial load
            const notesCol = collection(AppState.db, 'notesToAdmin');
            const notesSnap = await getDocs(query(notesCol, where('isRead', '==', false)));
            const unreadNotesCount = notesSnap.size;

            // Store globally
            AppState.unreadNotesCount = unreadNotesCount;

            const badgeId = `service-badge-${gsCard.name.replace(/\s+/g, '-')}`;
            updateBadge(document.getElementById(badgeId), unreadAnnCount + unreadNotesCount);
        }
    } catch (e) { console.error('updateServiceCardBadges:', e); }
}
