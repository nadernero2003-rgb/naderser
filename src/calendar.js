// ==================================================================
// calendar.js - Calendar Events Management
// ==================================================================

import { AppState } from './state.js';
import {
    authReady, getServiceCol, getServiceDoc,
    onSnapshot, doc, setDoc, deleteDoc, collection, getDocs
} from './firebase.js';
import { DOM, showMessage, openModal, closeModal, updateBadge } from './ui.js';
import { SERVICES, EVENT_TYPES, MONTHS_AR } from './config.js';

// ─── Initialize Calendar Page ─────────────────────────────────────
export function loadCalendarPage() {
    const today = new Date();

    // Admin sees all services selector
    DOM.calendarServiceFilterContainer?.classList.toggle('hidden-view', !AppState.isGeneralSecretaryMode);
    if (AppState.isGeneralSecretaryMode && DOM.calendarServiceSelector) {
        DOM.calendarServiceSelector.innerHTML = '<option value="all">-- كل الخدمات --</option>';
        SERVICES.filter(s => !s.isGroup).forEach(s => {
            DOM.calendarServiceSelector.innerHTML += `<option value="${s.name}">${s.name}</option>`;
        });
        DOM.calendarServiceSelector.value = 'all';
    }

    // Populate year selector
    if (DOM.calendarYearSelector) {
        DOM.calendarYearSelector.innerHTML = '';
        const curY = today.getFullYear();
        for (let y = curY + 10; y >= 2024; y--) {
            DOM.calendarYearSelector.innerHTML += `<option value="${y}">${y}</option>`;
        }
        DOM.calendarYearSelector.value = curY;
    }

    // Populate month
    if (DOM.calendarMonthSelector) {
        DOM.calendarMonthSelector.innerHTML = '';
        MONTHS_AR.forEach((m, i) => {
            DOM.calendarMonthSelector.innerHTML += `<option value="${i}">${m}</option>`;
        });
        DOM.calendarMonthSelector.value = today.getMonth();
    }

    // Start listening
    listenForCalendarEvents();
}

// ─── Listen for Events ─────────────────────────────────────────────
export function listenForCalendarEvents() {
    // Clear old subscriptions if they are stored in an array or single
    if (Array.isArray(AppState.subscriptions.calendarEvents)) {
        AppState.subscriptions.calendarEvents.forEach(unsub => unsub());
    } else if (typeof AppState.subscriptions.calendarEvents === 'function') {
        AppState.subscriptions.calendarEvents();
    }
    AppState.subscriptions.calendarEvents = [];

    const svcName = AppState.isGeneralSecretaryMode
        ? (DOM.calendarServiceSelector?.value || 'all')
        : AppState.currentServiceName;

    AppState.calendarEventsCache = {};

    if (svcName === 'all') {
        const svcNames = SERVICES.filter(s => !s.isGroup).map(s => s.name);
        svcNames.forEach(name => {
            const col = collection(AppState.db, 'services', name, 'calendarEvents');
            const unsub = onSnapshot(col, snap => {
                snap.docs.forEach(d => {
                    const id = d.id;
                    if (!AppState.calendarEventsCache[id]) AppState.calendarEventsCache[id] = [];
                    // Remove existing event from this service on this date
                    AppState.calendarEventsCache[id] = AppState.calendarEventsCache[id].filter(e => e.serviceName !== name);
                    AppState.calendarEventsCache[id].push({ ...d.data(), serviceName: name });
                });
                renderCalendar();
            }, err => console.error(err));
            AppState.subscriptions.calendarEvents.push(unsub);
        });
    } else {
        const col = collection(AppState.db, 'services', svcName, 'calendarEvents');
        const unsub = onSnapshot(col, snap => {
            AppState.calendarEventsCache = {};
            snap.docs.forEach(d => { AppState.calendarEventsCache[d.id] = [{ ...d.data(), serviceName: svcName }]; });
            renderCalendar();
        }, err => {
            console.error('calendar events:', err);
            AppState.calendarEventsCache = {};
            renderCalendar();
        });
        AppState.subscriptions.calendarEvents.push(unsub);
    }
}

// ─── Render Calendar Grid ─────────────────────────────────────────
export function renderCalendar() {
    const year = parseInt(DOM.calendarYearSelector?.value);
    const month = parseInt(DOM.calendarMonthSelector?.value);
    if (!DOM.calendarContent || isNaN(year) || isNaN(month)) return;

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const dowAr = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
    let html = `
        <div class="mb-4 flex items-center justify-between">
            <h2 class="text-xl font-bold text-teal-600 dark:text-teal-400">
                ${MONTHS_AR[month]} ${year}
            </h2>
        </div>
        <div class="grid grid-cols-7 gap-1">
        ${dowAr.map(d => `<div class="text-center text-xs font-bold text-slate-500 pb-2">${d}</div>`).join('')}`;

    // Empty cells before first day
    for (let i = 0; i < firstDay.getDay(); i++) {
        html += `<div class="h-20 rounded-lg bg-slate-50 dark:bg-slate-800/30"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const m = String(month + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        const dateStr = `${year}-${m}-${d}`;
        const events = AppState.calendarEventsCache[dateStr] || [];
        const isFriday = new Date(year, month, day).getDay() === 5;
        const isToday = dateStr === todayStr;

        let cellClass = `min-h-[5rem] rounded-xl border cursor-pointer transition-all hover:shadow-md p-1 relative flex flex-col gap-1 overflow-hidden`;
        if (isToday) cellClass += ' border-teal-500 border-2 bg-teal-50 dark:bg-teal-900/30';
        else if (isFriday) cellClass += ' border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20';
        else cellClass += ' border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800';

        const eventBadges = events.map(e => {
            const svcHtml = e.serviceName && AppState.isGeneralSecretaryMode && DOM.calendarServiceSelector?.value === 'all' 
                ? `<span class="opacity-80 text-[9px] block">(${e.serviceName})</span>` 
                : '';
            return `<span class="text-[10px] font-bold text-white px-1 py-0.5 rounded ${EVENT_TYPES[e.type] || 'bg-teal-500'} block w-full text-center leading-tight truncate" title="${e.type}">${e.type}${svcHtml}</span>`;
        }).join('');

        html += `<div class="${cellClass}" data-date="${dateStr}">
            <span class="text-sm font-bold block mb-1 ${isToday ? 'text-teal-700 dark:text-teal-300' : isFriday ? 'text-orange-600 dark:text-orange-400' : ''}">${day}</span>
            <div class="flex flex-col gap-1 w-full flex-grow overflow-y-auto custom-scrollbar">${eventBadges}</div>
        </div>`;
    }

    html += `</div>`;
    DOM.calendarContent.innerHTML = html;

    // Bind click events on calendar cells
    DOM.calendarContent.querySelectorAll('[data-date]').forEach(cell => {
        cell.addEventListener('click', () => openCalendarEventModal(cell.dataset.date));
    });
}
let todayStr = '';

// ─── Event Modal ──────────────────────────────────────────────────
function openCalendarEventModal(dateStr) {
    if (!DOM.calendarEventModal) return;
    const events = AppState.calendarEventsCache[dateStr] || [];
    const isGS = AppState.isGeneralSecretaryMode;
    const form = DOM.calendarEventForm;
    
    DOM.eventModalDate.textContent = dateStr;
    DOM.eventDate.value = dateStr;

    // Remove existing details card if any
    const existingCard = DOM.calendarEventModal.querySelector('.event-details-card');
    if (existingCard) existingCard.remove();

    if (isGS) {
        // --- ELEGANT READ-ONLY VIEW FOR GS ---
        form.classList.add('hidden-view');
        DOM.saveEventBtn.classList.add('hidden-view');
        DOM.deleteEventBtn.classList.add('hidden-view');

        const card = document.createElement('div');
        card.className = 'event-details-card space-y-2 py-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1';

        if (events.length === 0) {
            card.innerHTML = `
                <div class="text-center py-10 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <div class="w-14 h-14 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100 dark:border-slate-700">
                        <i class="fas fa-calendar-times text-2xl text-slate-300 dark:text-slate-600"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-400 dark:text-slate-500">لا توجد أحداث مسجلة لهذا اليوم</p>
                </div>`;
        } else {
            const colors = {
                teal:   { border: '#2dd4bf', bg: '#f0fdfa', darkBg: '#042f2e', text: '#0d9488' },
                lime:   { border: '#a3e635', bg: '#f7fee7', darkBg: '#1a2e05', text: '#65a30d' },
                green:  { border: '#4ade80', bg: '#f0fdf4', darkBg: '#052e16', text: '#16a34a' },
                yellow: { border: '#facc15', bg: '#fefce8', darkBg: '#2d1f00', text: '#ca8a04' },
                pink:   { border: '#f472b6', bg: '#fdf2f8', darkBg: '#2d0a1e', text: '#db2777' },
                indigo: { border: '#818cf8', bg: '#eef2ff', darkBg: '#1e1b4b', text: '#4f46e5' },
                red:    { border: '#fb7185', bg: '#fef2f2', darkBg: '#2d0707', text: '#dc2626' },
                purple: { border: '#c084fc', bg: '#faf5ff', darkBg: '#1a0838', text: '#9333ea' },
                cyan:   { border: '#22d3ee', bg: '#ecfeff', darkBg: '#042830', text: '#0891b2' },
                orange: { border: '#fb923c', bg: '#fff7ed', darkBg: '#2d1200', text: '#ea580c' },
                blue:   { border: '#60a5fa', bg: '#eff6ff', darkBg: '#0c1a3d', text: '#2563eb' }
            };
            const isDark = document.documentElement.classList.contains('dark');

            card.innerHTML = events.map(e => {
                const svc = SERVICES.find(s => s.name === e.serviceName) || { color: 'blue', icon: 'fa-church' };
                const c = colors[svc.color] || colors.blue;
                const typeColor = EVENT_TYPES[e.type] || 'bg-teal-500';
                return `
                <div class="relative flex items-start gap-3 p-3.5 rounded-2xl border bg-white dark:bg-slate-800/80 shadow-sm hover:shadow-md transition-all group"
                     style="border-color: ${c.border}30; border-right: 4px solid ${c.border};">
                    <!-- Type badge top-left -->
                    <div class="flex-shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                        <span class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm shadow-sm ${typeColor}">
                            <i class="fas fa-bookmark"></i>
                        </span>
                    </div>
                    <div class="flex-grow min-w-0">
                        <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <span class="font-black text-sm text-slate-800 dark:text-slate-100 truncate">${e.type}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                                  style="color:${c.text}; background:${isDark ? c.darkBg : c.bg}; border-color:${c.border}40;">
                                <i class="fas fa-cross mr-1 opacity-60"></i>${e.serviceName || 'عام'}
                            </span>
                        </div>
                        ${e.details ? `<p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">${e.details}</p>` : '<p class="text-xs text-slate-400 italic">لا توجد تفاصيل إضافية.</p>'}
                    </div>
                </div>`;
            }).join('');
        }
        form.parentNode.insertBefore(card, form);
    } else {
        // --- STANDARD EDITABLE VIEW FOR SERVICE ADMIN ---
        form.classList.remove('hidden-view');
        const firstEvent = events.length > 0 ? events[0] : null;
        DOM.eventTypeSelector.value = firstEvent?.type || '';
        DOM.eventDetailsInput.value = firstEvent?.details || '';
        DOM.saveEventBtn.classList.remove('hidden-view');
        DOM.deleteEventBtn.classList.toggle('hidden-view', !firstEvent);
    }

    openModal(DOM.calendarEventModal);
}

export async function saveCalendarEvent(e) {
    e.preventDefault();
    const dateStr = DOM.eventDate.value;
    const type = DOM.eventTypeSelector.value;
    if (!type) { showMessage('الرجاء اختيار نوع النشاط.', true); return; }

    const svcName = AppState.isGeneralSecretaryMode
        ? (DOM.calendarServiceSelector?.value || AppState.currentServiceName)
        : AppState.currentServiceName;

    if (svcName === 'all') {
        showMessage('لا يمكن الحفظ. الرجاء الخروج وتحديد خدمة معينة من القائمة لإضافة حدث لها.', true);
        return;
    }

    try {
        const eventDoc = doc(AppState.db, 'services', svcName, 'calendarEvents', dateStr);
        await setDoc(eventDoc, {
            type, details: DOM.eventDetailsInput.value, date: dateStr
        });
        showMessage('تم حفظ الحدث ✓');
        closeModal(DOM.calendarEventModal);
    } catch (err) {
        console.error(err);
        showMessage('فشل حفظ الحدث.', true);
    }
}

export async function deleteCalendarEvent() {
    const dateStr = DOM.eventDate.value;
    const svcName = AppState.isGeneralSecretaryMode
        ? (DOM.calendarServiceSelector?.value || AppState.currentServiceName)
        : AppState.currentServiceName;

    try {
        const eventDoc = doc(AppState.db, 'services', svcName, 'calendarEvents', dateStr);
        await deleteDoc(eventDoc);
        showMessage('تم حذف الحدث.');
        closeModal(DOM.calendarEventModal);
    } catch (err) {
        console.error(err);
        showMessage('فشل الحذف.', true);
    }
}
