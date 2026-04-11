// ==================================================================
// attendance.js - Attendance Tracking (Fridays + 6 Activities)
// ==================================================================

import { AppState } from './state.js';
import {
    authReady, getServiceCol, getServiceDoc,
    collection, doc, getDocs, setDoc, query, where, Local
} from './firebase.js';
import { DOM, showMessage, showLoading, openModal, closeModal, formatDateAr } from './ui.js';
import { ACTIVITIES, ACTIVITY_MAP, MONTHS_AR } from './config.js';

// ─── Load Attendance for a Year ───────────────────────────────────
export async function loadAttendanceForYear(year) {
    await authReady;
    if (AppState.isLocalMode) {
        AppState.attendanceYearCache = Local.attendance(AppState.currentServiceName);
        return;
    }
    try {
        const col = getServiceCol('attendance');
        const q = query(col, where('year', '==', Number(year)));
        const snap = await getDocs(q);
        AppState.attendanceYearCache = {};
        snap.docs.forEach(d => { AppState.attendanceYearCache[d.id] = d.data(); });
    } catch (e) {
        console.error(e);
        AppState.attendanceYearCache = {};
    }
}

// ─── Initialize Attendance Page ───────────────────────────────────
export async function loadAttendancePage() {
    const today = new Date();
    const currentYear = today.getFullYear();

    // Populate years
    DOM.yearSelector.innerHTML = '';
    for (let y = currentYear + 10; y >= 2024; y--) {
        DOM.yearSelector.innerHTML += `<option value="${y}">${y}</option>`;
    }
    DOM.yearSelector.value = currentYear;

    showLoading(true);
    await loadAttendanceForYear(currentYear);
    showLoading(false);

    populateMonths(currentYear);
    DOM.monthSelector.value = today.getMonth();
    DOM.monthSelector.disabled = false;

    populateFridaysGrid(currentYear, today.getMonth());

    DOM.activityButtons?.classList.add('hidden-view');
    DOM.attendanceListContainer?.classList.add('hidden-view');
}

// ─── Months Selector ──────────────────────────────────────────────
export function populateMonths(year) {
    DOM.monthSelector.innerHTML = '<option value="">اختر شهر</option>';
    MONTHS_AR.forEach((m, i) => {
        DOM.monthSelector.innerHTML += `<option value="${i}">${m}</option>`;
    });
    DOM.monthSelector.disabled = false;
}

// ─── Fridays Grid ─────────────────────────────────────────────────
export function populateFridaysGrid(year, month) {
    DOM.fridaysGrid.innerHTML = '';
    if (month === '' || month === null || month === undefined) return;

    const date = new Date(year, month, 1);
    while (date.getMonth() === Number(month)) {
        if (date.getDay() === 5) { // Friday
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            const dayData = AppState.attendanceYearCache[dateStr] || {};

            // Status dots
            let dots = ACTIVITIES.map(act => {
                const actData = dayData[act.key];
                const color = actData?.attendees?.length > 0 ? act.border
                    : actData?.note ? '#facc15'
                        : actData ? '#f87171'
                            : '#d1d5db';
                return `<span style="background:${color}" class="block w-3 h-3 rounded-full border border-white/60 shadow-sm"></span>`;
            }).join('');

            const isSelected = AppState.selectedFriday === dateStr;
            DOM.fridaysGrid.insertAdjacentHTML('beforeend', `
                <button data-date="${dateStr}"
                    class="friday-btn ${isSelected ? 'active' : ''} h-20 flex flex-col items-center justify-between p-2 rounded-xl
                        bg-teal-500 hover:bg-teal-600 text-white font-bold shadow hover:shadow-lg transition-all">
                    <span class="text-2xl font-extrabold">${date.getDate()}</span>
                    <div class="flex justify-center gap-1">${dots}</div>
                </button>`);
        }
        date.setDate(date.getDate() + 1);
    }
}

// ─── Activity Buttons ─────────────────────────────────────────────
export function renderActivityButtons(date) {
    const dayData = AppState.attendanceYearCache[date] || {};
    DOM.activityButtons.innerHTML = '';

    ACTIVITIES.forEach(act => {
        const actData = dayData[act.key];
        let statusIcon = '', statusText = '';
        if (actData) {
            if (actData.note !== null && actData.note !== undefined) {
                statusIcon = `<i class="fas fa-times-circle text-yellow-300 ml-1"></i>`;
                statusText = `<span class="text-xs font-normal">ملغى</span>`;
            } else if (actData.attendees) {
                statusIcon = `<i class="fas fa-check-circle text-green-300 ml-1"></i>`;
                statusText = `<span class="text-xs font-normal">${actData.attendees.length}/${AppState.servantsCache.length}</span>`;
            }
        }

        DOM.activityButtons.innerHTML += `
            <button data-activity="${act.key}"
                class="activity-btn rounded-xl text-white font-bold shadow hover:shadow-lg transition-all flex flex-col items-center justify-center gap-1"
                style="background-color: ${act.border}">
                <div class="flex items-center gap-1"><i class="fas ${act.icon}"></i><span>${act.name}</span></div>
                <div class="flex items-center text-sm">${statusIcon}${statusText}</div>
            </button>`;
    });

    DOM.activityButtons?.classList.remove('hidden-view');
}

// ─── Internal Helper for Checklist History ────────────────────────
export function getServantHistoryStatusForDate(servantId, currentDateStr, attendanceCache) {
    let consecutiveAbsences = 0;
    let isExcused = false;

    // Check previous 4 weeks strictly BEFORE the currentDateStr
    const currentDate = new Date(currentDateStr);
    for (let i = 1; i <= 4; i++) {
        let pDate = new Date(currentDate);
        pDate.setDate(pDate.getDate() - (i * 7));
        const y = pDate.getFullYear(), m = String(pDate.getMonth() + 1).padStart(2, '0'), d = String(pDate.getDate()).padStart(2, '0');
        const pDateStr = `${y}-${m}-${d}`;
        const pDayData = attendanceCache[pDateStr] || {};

        let anyAttendanceThatWeek = false;
        let attendedThatWeek = false;
        let excusedThatWeek = (pDayData['apology']?.attendees || []).includes(servantId);

        ACTIVITIES.filter(a => a.key !== 'apology').forEach(act => {
            const actData = pDayData[act.key];
            if (actData && !actData.isSpecial) {
                anyAttendanceThatWeek = true;
                if ((actData.attendees || []).includes(servantId)) {
                    attendedThatWeek = true;
                }
            }
        });

        if (!anyAttendanceThatWeek) continue;

        if (!attendedThatWeek && !excusedThatWeek) {
            consecutiveAbsences++;
        } else if (excusedThatWeek && consecutiveAbsences === 0) {
            isExcused = true;
            break;
        } else {
            break; // Streak broken
        }
    }

    if (isExcused) {
        return { type: 'excused', label: 'معتذر', colorClass: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-300', icon: 'fa-bed' };
    } else if (consecutiveAbsences > 0) {
        return { type: 'absent', label: `غياب ${consecutiveAbsences} متتالي`, colorClass: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700/50 text-red-800 dark:text-red-300', icon: 'fa-exclamation-triangle' };
    }
    return null;
}

// ─── Servant Checklist ────────────────────────────────────────────
export function renderServantChecklist(activityKey, date) {
    AppState.currentActivity = activityKey;
    const activity = ACTIVITY_MAP.get(activityKey);

    // Highlight active activity button
    document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active', 'ring-4', 'ring-white/50', 'scale-105'));
    document.querySelector(`.activity-btn[data-activity="${activityKey}"]`)
        ?.classList.add('active', 'ring-4', 'ring-white/50', 'scale-105');

    DOM.attendanceListTitle.textContent = `${activity.name} — ${formatDateAr(date)}`;

    // No-activity and Special-day section
    const noActSection = DOM.noActivitySection;
    if (activityKey === 'apology') {
        noActSection?.classList.add('hidden-view');
    } else {
        noActSection?.classList.remove('hidden-view');
        DOM.noActivityCheck.checked = false;
        DOM.isSpecialCheck.checked = false;
        DOM.specialReasonInput.value = '';
        DOM.specialReasonInput?.classList.add('hidden-view');
        DOM.servantsChecklist?.classList.remove('hidden');
    }

    // Load existing data
    const dayData = AppState.attendanceYearCache[date] || {};
    const actData = dayData[activityKey] || {};
    const attendees = actData.attendees || [];

    // Reset visibility and exclusive logic
    if (actData.isSpecial) {
        DOM.isSpecialCheck.checked = true;
        DOM.specialReasonInput.value = actData.note || '';
        DOM.specialReasonInput?.classList.remove('hidden-view');
        DOM.servantsChecklist?.classList.add('hidden');
    } else if (actData.note !== undefined && actData.note !== null) {
        DOM.noActivityCheck.checked = true;
        DOM.servantsChecklist?.classList.add('hidden');
    }

    // Build checklist
    DOM.servantsChecklist.innerHTML = '';
    AppState.servantsCache.forEach(s => {
        const checked = attendees.includes(s.id);
        const aid = `${activityKey}-${s.id}`;
        DOM.servantsChecklist.innerHTML += `
            <div class="flex items-center p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <input type="checkbox" id="${aid}" data-servant-id="${s.id}"
                    class="w-5 h-5 ml-3 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    ${checked ? 'checked' : ''}>
                <label for="${aid}" class="cursor-pointer select-none">${s.name}</label>
            </div>`;
    });

    DOM.attendanceListContainer?.classList.remove('hidden-view');
}

// ─── Setup Logic for Exclusive Checkboxes ────────────────────────
export function setupAttendanceUIListeners() {
    DOM.noActivityCheck?.addEventListener('change', function () {
        if (this.checked) {
            DOM.isSpecialCheck.checked = false;
            DOM.specialReasonInput.classList.add('hidden-view');
            DOM.servantsChecklist.classList.add('hidden');
        } else {
            DOM.servantsChecklist.classList.remove('hidden');
        }
    });

    DOM.isSpecialCheck?.addEventListener('change', function () {
        if (this.checked) {
            DOM.noActivityCheck.checked = false;
            DOM.specialReasonInput.classList.remove('hidden-view');
            DOM.servantsChecklist.classList.add('hidden');
        } else {
            DOM.specialReasonInput.classList.add('hidden-view');
            DOM.servantsChecklist.classList.remove('hidden');
        }
    });
}

// ─── Save Attendance ──────────────────────────────────────────────
export async function saveActivityAttendance() {
    await authReady;
    const { selectedFriday, currentActivity } = AppState;
    if (!selectedFriday || !currentActivity) {
        showMessage('الرجاء اختيار اليوم والنشاط أولاً.', true); return;
    }

    const saveBtn = DOM.saveActivityAttendanceBtn;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';

    try {
        const [year] = selectedFriday.split('-').map(Number);
        let activityUpdate;

        if (DOM.isSpecialCheck?.checked) {
            activityUpdate = {
                attendees: [],
                note: DOM.specialReasonInput?.value || 'تم الإلغاء لظرف استثنائي',
                isSpecial: true
            };
        } else if (DOM.noActivityCheck?.checked) {
            activityUpdate = {
                attendees: [],
                note: 'تقصير/لم يتم التسجيل',
                isSpecial: false
            };
        } else {
            const attendees = [...DOM.servantsChecklist
                .querySelectorAll('input[type="checkbox"]:checked')]
                .map(cb => cb.dataset.servantId);
            activityUpdate = { attendees, note: null, isSpecial: false };
        }

        const dayData = AppState.attendanceYearCache[selectedFriday] || { year };
        dayData[currentActivity] = activityUpdate;

        if (AppState.isLocalMode) {
            const att = Local.attendance(AppState.currentServiceName);
            att[selectedFriday] = dayData;
            Local.saveAttendance(att, AppState.currentServiceName);
            AppState.attendanceYearCache = att;
        } else {
            const docRef = getServiceDoc('attendance', selectedFriday);
            await setDoc(docRef, dayData, { merge: true });
            AppState.attendanceYearCache[selectedFriday] = dayData;
        }

        showMessage('تم حفظ الحضور بنجاح ✓');
        // Refresh buttons
        renderActivityButtons(selectedFriday);

        // Refresh friday grid dots
        const year2 = Number(selectedFriday.split('-')[0]);
        const month2 = Number(selectedFriday.split('-')[1]) - 1;
        populateFridaysGrid(year2, month2);

        // Re-select the current Friday
        setTimeout(() => {
            document.querySelector(`.friday-btn[data-date="${selectedFriday}"]`)?.classList.add('active');
        }, 50);

    } catch (e) {
        console.error(e);
        showMessage('فشل حفظ الحضور.', true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save ml-2"></i> حفظ الحضور';
    }
}

// ─── Fetch All Attendance for a Service ─────────────────────────
export async function fetchFullAttendance(serviceName) {
    await authReady;
    if (AppState.isLocalMode) return Local.attendance(serviceName);
    try {
        const col = collection(AppState.db, 'services', serviceName, 'attendance');
        const snap = await getDocs(col);
        const result = {};
        snap.docs.forEach(d => { result[d.id] = d.data(); });
        return result;
    } catch { return {}; }
}

// ─── Get Last Friday Absences (for Dashboard) ──────────────────
export function getLastFridayAbsences(servantsCache, attendanceCache) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate target Friday: Shift to upcoming/current Friday starting on Thursday
    let lastFriday = new Date(today);
    let offset = 5 - today.getDay();
    if (offset > 1) {
        offset -= 7; // If today is Sun(0), Mon(1), Tue(2), Wed(3), we look back to last week's Friday
    }
    lastFriday.setDate(today.getDate() + offset);

    const y = lastFriday.getFullYear();
    const m = String(lastFriday.getMonth() + 1).padStart(2, '0');
    const d = String(lastFriday.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const dayData = attendanceCache[dateStr] || {};
    const allAttendees = new Set();
    ACTIVITIES.filter(a => a.key !== 'apology').forEach(act => {
        (dayData[act.key]?.attendees || []).forEach(id => allAttendees.add(id));
    });
    const globalExcusedSet = new Set(dayData['apology']?.attendees || []);

    const absent = servantsCache.filter(s => {
        if (allAttendees.has(s.id)) return false; // Not absent, they attended something

        // Did their SPECIFIC service get cancelled on this date?
        let sDayData = attendanceCache[dateStr] || {};
        if (AppState.isGeneralSecretaryMode && s.serviceName) {
            const entry = AppState.allAttendanceCache.find(x => x.date === dateStr && x.serviceName === s.serviceName);
            if (entry) sDayData = entry;
        }

        // If 'service' (the main activity) is marked as Special or has a note but nobody attended, it's cancelled/no activity.
        if (sDayData['service']?.isSpecial || sDayData['service']?.note != null) {
            return false; // Not absent, the service was cancelled or didn't happen
        }

        return true;
    }).map(s => {
        let sDayData = attendanceCache[dateStr] || {};
        let sExcusedSet = globalExcusedSet;
        if (AppState.isGeneralSecretaryMode && s.serviceName) {
            const entry = AppState.allAttendanceCache.find(x => x.date === dateStr && x.serviceName === s.serviceName);
            if (entry) {
                sDayData = entry;
                sExcusedSet = new Set(sDayData['apology']?.attendees || []);
            }
        }

        const isExcused = sExcusedSet.has(s.id);
        let consecutiveAbsences = 1;

        if (!isExcused) {
            // Check previous 3 weeks back
            for (let i = 1; i <= 3; i++) {
                let pastDate = new Date(lastFriday);
                pastDate.setDate(pastDate.getDate() - (i * 7));
                const py = pastDate.getFullYear();
                const pm = String(pastDate.getMonth() + 1).padStart(2, '0');
                const pd = String(pastDate.getDate()).padStart(2, '0');
                const pDateStr = `${py}-${pm}-${pd}`;

                let pDayData = attendanceCache[pDateStr] || {};
                if (AppState.isGeneralSecretaryMode && s.serviceName) {
                    const pEntry = AppState.allAttendanceCache.find(x => x.date === pDateStr && x.serviceName === s.serviceName);
                    if (pEntry) pDayData = pEntry;
                    else pDayData = {}; // Must reset if empty for this service!
                }

                let anyAttendanceThatWeek = false;
                let servantAttendedThatWeek = false;
                let servantExcusedThatWeek = (pDayData['apology']?.attendees || []).includes(s.id);

                ACTIVITIES.filter(a => a.key !== 'apology').forEach(act => {
                    if (pDayData[act.key] && pDayData[act.key].note == null) {
                        anyAttendanceThatWeek = true;
                        if ((pDayData[act.key].attendees || []).includes(s.id)) {
                            servantAttendedThatWeek = true;
                        }
                    }
                });

                if (!anyAttendanceThatWeek) continue; // Skip unrecorded weeks
                if (!servantAttendedThatWeek && !servantExcusedThatWeek) {
                    consecutiveAbsences++;
                } else {
                    break;
                }
            }
        }

        return { ...s, isExcused, consecutiveAbsences };
    });

    // Check if the main 'service' activity was cancelled (Only applies for specific single service view)
    let serviceCancelledReason = null;
    if (!AppState.isGeneralSecretaryMode && dayData['service']?.isSpecial) {
        serviceCancelledReason = dayData['service'].note;
    }

    // If the general service is cancelled, nobody is absent
    const finalAbsent = serviceCancelledReason ? [] : absent;

    return { dateStr, absent: finalAbsent, dayData, serviceCancelledReason };
}


// ─── Attendance Chart Data ────────────────────────────────────────
export function getAttendanceChartData(servantsCache, attendanceCache, days = 30) {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    const labels = [];
    const data = [];
    const backgroundColors = [];

    // All activities including Apology
    ACTIVITIES.forEach(a => {
        const labelName = a.key === 'apology' ? 'معتذر' : a.name;
        labels.push(labelName);
        backgroundColors.push(a.color || '#94a3b8');

        let totalSessions = 0;
        let totalAttended = 0;

        Object.entries(attendanceCache).forEach(([date, dayData]) => {
            if (date >= startStr) {
                // Determine if this day was active (any non-cancelled non-apology activity exists)
                const isDayActive = ACTIVITIES.some(act => act.key !== 'apology' && dayData[act.key] && !dayData[act.key].isSpecial);

                if (isDayActive) {
                    totalSessions++;
                    if (dayData[a.key]) {
                        totalAttended += dayData[a.key].attendees?.length || 0;
                    }
                }
            }
        });

        const percent = (totalSessions > 0 && servantsCache.length > 0)
            ? Math.round((totalAttended / (totalSessions * servantsCache.length)) * 100) : 0;
        data.push(percent);
    });

    return {
        labels,
        datasets: [{
            label: 'متوسط الحضور (%)',
            data,
            backgroundColor: backgroundColors,
            borderWidth: 0,
            borderRadius: 4,
            barPercentage: 0.6
        }]
    };
}
