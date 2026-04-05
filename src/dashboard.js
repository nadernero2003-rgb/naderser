// ==================================================================
// dashboard.js - Home Dashboard + Admin Dashboard + All Services Data
// ==================================================================

import { AppState } from './state.js';
import { SERVICES, ACTIVITIES, APP_NAME } from './config.js';
import {
    authReady, collection, addDoc, getDocs, onSnapshot, query, orderBy
} from './firebase.js';
import {
    DOM, showMessage, showLoading, switchPage, applyServiceTheme,
    getUpcomingBirthdays
} from './ui.js';
import { loadServants, displayUpcomingBirthdays, renderServantsTable, populateServiceFilter } from './servants.js';
import { loadAttendancePage, loadAttendanceForYear, getLastFridayAbsences, getAttendanceChartData, fetchFullAttendance, getServantHistoryStatusForDate } from './attendance.js';
import { loadReportsPage } from './reports.js';
import { loadCalendarPage } from './calendar.js';
import {
    listenForAnnouncements, listenForServiceAnnouncements, listenForSentNotes,
    listenForIncomingNotes, updateServiceCardBadges, populateAnnouncementTargetSelector,
    markNotesAsRead, markServiceAnnouncementsAsRead, sendNoteToAdmin,
    renderServiceBulletinBoard, loadMoreAnnouncements, sendAnnouncement
} from './announcements.js';

// ─── Show Main Dashboard ──────────────────────────────────────────
export async function showDashboard() {
    showLoading(true);
    try {
        // Apply theme for this service
        applyServiceTheme();

        // Update sidebar
        DOM.sidebarServiceName.textContent = AppState.currentServiceName;

        // Show/hide sidebar links based on role
        const isAdmin = AppState.isGeneralSecretaryMode;
        DOM.correspondenceLink?.classList.toggle('hidden-view', isAdmin);
        DOM.attendancePageLink?.classList.toggle('hidden-view', isAdmin);
        DOM.followUpLink?.classList.remove('hidden-view'); // Available for everyone
        DOM.serviceAnnouncementsLink?.classList.toggle('hidden-view', isAdmin);
        DOM.correspondenceCenterLink?.classList.toggle('hidden-view', !isAdmin);
        DOM.announcementsBoardLink?.classList.toggle('hidden-view', !isAdmin);

        const calText = document.getElementById('calendarLinkText');
        if (calText) calText.textContent = isAdmin ? 'أجندة الأمين العام' : 'التقويم';

        // Show dashboard, hide login
        DOM.loginOrServicesView?.classList.add('hidden-view');
        DOM.mainDashboard?.classList.remove('hidden-view');

        // Load data
        await loadServants();
        await loadHomePage();

        // Real-time listeners based on role
        if (isAdmin) {
            listenForAnnouncements();
            listenForIncomingNotes();
        } else {
            listenForServiceAnnouncements();
            listenForSentNotes();
        }

    } catch (e) {
        console.error('showDashboard:', e);
        showMessage('خطأ في تحميل التطبيق.', true);
    } finally {
        showLoading(false);
        switchPage('homePage');
    }
}

// ─── Home Page ─────────────────────────────────────────────────────
export async function loadHomePage() {
    const adminKpiSection = document.getElementById('adminKpiSection');
    const totalServantsCard = document.getElementById('totalServantsCard');

    if (AppState.isGeneralSecretaryMode) {
        // Admin: show KPI section at top, hide redundant totalServantsCard
        if (adminKpiSection) adminKpiSection.classList.remove('hidden-view');
        if (totalServantsCard) totalServantsCard.classList.add('hidden-view');
        DOM.serviceDashboardContainer?.classList.remove('hidden-view');
        DOM.adminDashboardContainer?.classList.remove('hidden-view');
        await loadAllServicesData();
        renderAdminDashboard();

        // Build a merged attendance cache for chart rendering
        const mergedCache = {};
        AppState.allAttendanceCache.forEach(day => {
            if (!mergedCache[day.date]) mergedCache[day.date] = { ...day };
            else {
                ACTIVITIES.forEach(act => {
                    if (day[act.key]?.attendees?.length) {
                        if (!mergedCache[day.date][act.key]) mergedCache[day.date][act.key] = { attendees: [] };
                        mergedCache[day.date][act.key].attendees = [
                            ...(mergedCache[day.date][act.key].attendees || []),
                            ...day[act.key].attendees
                        ];
                    }
                });
            }
        });
        AppState.attendanceYearCache = mergedCache;
        renderServiceDashboard();

    } else {
        if (adminKpiSection) adminKpiSection.classList.add('hidden-view');
        if (totalServantsCard) totalServantsCard.classList.remove('hidden-view');
        DOM.serviceDashboardContainer?.classList.remove('hidden-view');
        DOM.adminDashboardContainer?.classList.add('hidden-view');
        await loadAttendanceForYear(new Date().getFullYear());
        renderServiceDashboard();
    }
}

// ─── Service Dashboard ─────────────────────────────────────────────
function renderServiceDashboard() {
    const { servantsCache, attendanceYearCache, isGeneralSecretaryMode } = AppState;

    const servantsCountToUse = isGeneralSecretaryMode ? AppState.allServantsCache : servantsCache;
    const upcoming = getUpcomingBirthdays(servantsCountToUse, 30);

    // Render all sections
    renderServiceKpis(servantsCountToUse, upcoming);
    renderLastFridayDetails(servantsCountToUse, attendanceYearCache);
    renderActivityAvgChart(servantsCountToUse, attendanceYearCache);
    renderHomeChart(servantsCountToUse, attendanceYearCache);
}

function renderHomeChart(servantsCache, attendanceYearCache) {
    const ctx = document.getElementById('homeAttendanceChart');
    if (!ctx) return;
    if (AppState.charts.home) AppState.charts.home.destroy();
    const { labels, datasets } = getAttendanceChartData(servantsCache, attendanceYearCache, 12);
    AppState.charts.home = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }, // Removed legend
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
            }
        }
    });
}

function renderServiceKpis(servants, upcoming) {
    // Total servants
    const totalServantsStat = document.getElementById('totalServantsStat');
    if (totalServantsStat) totalServantsStat.innerText = servants.length || '0';

    // Upcoming birthdays
    const birthdayContainer = document.getElementById('upcomingBirthdayStat');
    if (birthdayContainer) {
        if (!upcoming || upcoming.length === 0) {
            birthdayContainer.innerHTML = `<p class="text-slate-500 text-sm">لا يوجد أعياد ميلاد قريبة.</p>`;
        } else {
            birthdayContainer.innerHTML = `<ul class="space-y-2">
                ${upcoming.map(s => {
                const today = new Date();
                const bStr = s.dob;
                if (!bStr) return '';
                const [yyyy, mm, dd] = bStr.split('-');
                let nextBday = new Date(today.getFullYear(), parseInt(mm) - 1, parseInt(dd));
                if (nextBday < today && nextBday.toDateString() !== today.toDateString()) {
                    nextBday.setFullYear(today.getFullYear() + 1);
                }
                const diffTime = Math.abs(nextBday - today);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                let dayStr = diffDays === 0 ? "اليوم! 🎉" : `بعد ${diffDays} يوم`;

                return `<li class="flex justify-between items-center text-sm p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg shadow-sm border border-transparent dark:border-pink-800/30">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-birthday-cake text-pink-500"></i>
                            <span class="font-bold text-slate-800 dark:text-slate-200">${s.name}</span>
                        </div>
                        <span class="text-xs bg-pink-100 dark:bg-pink-800 text-pink-700 dark:text-pink-300 py-1 px-2 rounded-md font-bold">${dayStr}</span>
                    </li>`;
            }).join('')}
            </ul>
            
            <div class="pt-4 mt-2 border-t border-slate-100 dark:border-slate-700">
                <h5 class="font-bold text-sm mb-2 flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <i class="fas fa-magic text-yellow-500"></i> تهنئة روحية (AI)
                </h5>
                <div class="flex flex-col sm:flex-row gap-2">
                    <select id="aiBdayServantSelectorKpi" class="form-input form-select text-sm p-2 bg-slate-50 dark:bg-slate-700 border-none flex-grow">
                        ${upcoming.map(u => `<option value="${u.name}">${u.name}</option>`).join('')}
                    </select>
                    <button id="aiBdayGenerateBtnKpi" class="btn btn-primary text-sm p-2 whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center">
                        <i class="fas fa-robot text-white"></i> 
                    </button>
                </div>
                <!-- Where AI msg appears -->
                <div id="aiBdayResultKpi" class="mt-3 hidden-view p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm relative"></div>
            </div>`;

            // Attach listeners correctly
            setTimeout(() => {
                const btn = document.getElementById('aiBdayGenerateBtnKpi');
                const sel = document.getElementById('aiBdayServantSelectorKpi');
                if (btn && sel) {
                    btn.addEventListener('click', () => {
                        if (window.generateAndShowAIGreeting) {
                            window.generateAndShowAIGreeting(sel.value, 'aiBdayResultKpi');
                        }
                    });
                }
            }, 50);
        }
    }
}

function renderAdminKpis(servants, attendanceCache) {
    const container = document.getElementById('kpiContainer');
    if (!container) return;

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');

    let totalSessions = 0, totalAttended = 0;
    Object.entries(attendanceCache).forEach(([date, dayData]) => {
        if (date >= startOfMonth) {
            targetActs.forEach(act => {
                if (dayData[act.key] && dayData[act.key].note == null) {
                    totalSessions++;
                    totalAttended += dayData[act.key].attendees?.length || 0;
                }
            });
        }
    });

    const avgPct = (totalSessions > 0 && servants.length > 0)
        ? Math.round((totalAttended / (totalSessions * servants.length)) * 100) : 0;

    container.innerHTML = `
        <div class="bg-gradient-to-br from-teal-500 to-cyan-600 p-4 rounded-xl shadow text-white transform transition-transform hover:scale-105 cursor-pointer">
            <h3 class="text-sm font-bold mb-1 opacity-90">متوسط الحضور العام (الشهر الحالي)</h3>
            <div class="flex items-center gap-3">
                <i class="fas fa-chart-pie text-2xl opacity-80"></i>
                <p class="text-3xl font-extrabold">${avgPct}%</p>
            </div>
        </div>
        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-xl shadow text-white transform transition-transform hover:scale-105 cursor-pointer">
            <h3 class="text-sm font-bold mb-1 opacity-90">إجمالي الخدام بكل الخدمات</h3>
            <div class="flex items-center gap-3">
                <i class="fas fa-users text-2xl opacity-80"></i>
                <p class="text-3xl font-extrabold">${servants.length}</p>
            </div>
        </div>
    `;
}

// ─── Last Friday: detailed list with names + excused ──────────────
function renderLastFridayDetails(servants, attendanceCache) {
    const statusContainer = document.getElementById('lastFridayStatusContainer');
    const absenceList = document.getElementById('lastFridayAbsenceList');
    const absenceCount = document.getElementById('lastFridayAbsenceCount');

    const { absent, dayData, dateStr, serviceCancelledReason } = getLastFridayAbsences(servants, attendanceCache);
    const total = servants.length;

    // 1. Render Absence Count & List
    if (absenceCount) {
        if (serviceCancelledReason) {
            absenceCount.innerHTML = `<span class="text-amber-500 font-bold text-sm"><i class="fas fa-ban ml-1"></i>الخدمة ملغاة</span>`;
        } else {
            absenceCount.innerHTML = `<span class="${absent.length > 0 ? 'text-red-500' : 'text-green-500'}">${absent.length}</span> / ${total} <span class="text-sm font-normal text-slate-500">(${dateStr || 'غير محدد'})</span>`;
        }
    }

    if (absenceList) {
        if (serviceCancelledReason) {
            absenceList.innerHTML = `<div class="w-full text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 p-4 rounded-lg flex items-center justify-center font-bold shadow-sm text-center">
                <i class="fas fa-info-circle ml-2 text-xl"></i>
                <p>لم تقم الخدمة: ${serviceCancelledReason}</p>
            </div>`;
        } else if (absent.length === 0) {
            absenceList.innerHTML = `<p class="text-green-600 font-bold p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center w-full"><i class="fas fa-check-circle ml-1"></i> لا يوجد غياب الجمعة الماضية 🎉</p>`;
        } else {
            // Group by Service and sort by config.SERVICES order
            const groups = {};
            absent.forEach(s => {
                const svc = s.serviceName || 'عام';
                if (!groups[svc]) groups[svc] = [];
                groups[svc].push(s);
            });

            const sortedSvcNames = Object.keys(groups).sort((a, b) => {
                const idxA = SERVICES.findIndex(s => s.name === a);
                const idxB = SERVICES.findIndex(s => s.name === b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });

            absenceList.innerHTML = sortedSvcNames.map(svcName => {
                const svcConfig = SERVICES.find(s => s.name === svcName) || { color: 'teal' };
                const list = groups[svcName];

                return `
                <div class="w-full mb-4">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2 py-1 text-xs font-bold rounded-lg border shadow-sm" 
                              style="background: var(--card-bg); border-color: ${svcConfig.border || '#ccc'}; color: ${svcConfig.icon || '#333'}">
                            ${svcName}
                        </span>
                        <div class="flex-1 h-px bg-slate-100 dark:bg-slate-700"></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        ${list.map(s => {
                    let badge = '';
                    let bgClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
                    let iconClass = 'fa-user-times text-slate-500';

                    if (s.isExcused) {
                        badge = `<span class="text-[0.65rem] bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full mr-auto whitespace-nowrap"><i class="fas fa-bed text-xs"></i> معتذر</span>`;
                        bgClass = 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 text-slate-700 dark:text-slate-200';
                        iconClass = 'fa-user-clock text-yellow-500';
                    } else if (s.consecutiveAbsences >= 2) {
                        badge = `<span class="text-[0.65rem] bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full mr-auto whitespace-nowrap"><i class="fas fa-exclamation-triangle text-xs opacity-75"></i> غائب x${s.consecutiveAbsences}</span>`;
                        bgClass = 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300';
                        iconClass = 'fa-user-times text-red-500';
                    }

                    return `
                                <div class="flex items-center gap-2 p-2 rounded-lg transition-all ${bgClass} border border-transparent hover:border-slate-300 dark:hover:border-slate-500 shadow-sm">
                                    <i class="fas ${iconClass} w-4 text-center text-xs"></i>
                                    <span class="font-bold text-xs truncate">${s.name}</span>
                                    ${badge}
                                </div>`;
                }).join('')}
                    </div>
                </div>`;
            }).join('');
        }
    }

    // 2. Build activity status cards (clickable to open modal)
    if (statusContainer) {
        const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
        const activityCardsHtml = targetActs.map(act => {
            const actData = dayData[act.key];
            let statusHtml, cardStyle, clickAction = '';

            if (!actData) {
                statusHtml = `<div class="mt-2 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/40 px-3 py-1 rounded-full flex items-center justify-center"><i class="fas fa-times mx-1"></i> لم يسجل</div>`;
                cardStyle = 'border: 1px solid #fca5a5;';
            } else if (actData.note != null) {
                statusHtml = `<div class="mt-2 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/40 px-3 py-1 rounded-full flex items-center justify-center"><i class="fas fa-ban mx-1"></i> ملغى</div>`;
                cardStyle = 'border: 1px dashed #fcd34d;';
            } else {
                const cnt = actData.attendees?.length || 0;
                // Add click handler for modal
                clickAction = `onclick="openActivityModal('${act.key}', '${dateStr}')"`;

                if (AppState.isGeneralSecretaryMode) {
                    statusHtml = `<div class="mt-2">
                        <span class="text-2xl font-black text-teal-600 dark:text-teal-400">${cnt}</span>
                        <span class="text-sm text-slate-400">/ ${total}</span>
                    </div>`;
                } else {
                    statusHtml = `<div class="mt-2 text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/40 px-3 py-1 rounded-full flex items-center justify-center">
                        <i class="fas fa-check mx-1"></i> ${cnt} / ${total}
                    </div>`;
                }
                cardStyle = 'border: 1px solid #86efac;';
            }

            // Provide dark mode fallbacks for dynamic cards
            const bgClass = actData && actData.note == null 
                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40' 
                : (actData?.note != null 
                    ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40' 
                    : 'bg-white dark:bg-slate-800 dark:border-slate-700');

            return `
            <div ${clickAction} style="${cardStyle}" class="flex flex-col items-center justify-center p-4 rounded-xl text-center cursor-pointer hover:shadow-md hover:-translate-y-1 transition-all ${bgClass}">
                <div class="w-12 h-12 rounded-full flex items-center justify-center mb-2 shadow-sm" style="background-color: ${act.border}; color: white;">
                    <i class="fas ${act.icon} text-xl"></i>
                </div>
                <h4 class="font-bold text-slate-800 dark:text-slate-200">${act.name}</h4>
                ${statusHtml}
            </div>`;
        }).join('');

        statusContainer.innerHTML = activityCardsHtml;
    }
}

window.openActivityModal = function (actKey, dateStr) {
    const { servantsCache, attendanceYearCache, isGeneralSecretaryMode } = AppState;
    // Always use the combined cache for Admin to see everyone who attended across all services
    const cacheToUse = isGeneralSecretaryMode ? AppState.attendanceYearCache : attendanceYearCache;
    const servantsList = isGeneralSecretaryMode ? AppState.allServantsCache : servantsCache;

    // Find attendees
    const dayData = cacheToUse[dateStr];
    if (!dayData || !dayData[actKey] || !dayData[actKey].attendees) return;

    const attendeeIds = dayData[actKey].attendees;
    const act = ACTIVITIES.find(a => a.key === actKey);

    const modal = document.getElementById('activityAttendeesModal');
    const title = document.getElementById('activityAttendeesModalTitle');
    const body = document.getElementById('activityAttendeesModalBody');

    title.innerHTML = `<i class="fas ${act.icon} mr-2"></i> حاضرو نشاط ${act.name} (${dateStr})`;

    if (attendeeIds.length === 0) {
        body.innerHTML = `<div class="text-center p-8 text-slate-500"><i class="fas fa-users-slash text-4xl mb-4 opacity-50 block"></i>لا يوجد حضور مسجل.</div>`;
    } else {
        const attendeesFull = attendeeIds.map(id => servantsList.find(x => x.id === id) || { id, name: 'خادم غير معروف', chapter: 'غير محدد' });

        // Group by Service and sort by config.SERVICES order
        const groups = {};
        attendeesFull.forEach(s => {
            const svc = s.serviceName || 'عام';
            if (!groups[svc]) groups[svc] = [];
            groups[svc].push(s);
        });

        const sortedSvcNames = Object.keys(groups).sort((a, b) => {
            const idxA = SERVICES.findIndex(s => s.name === a);
            const idxB = SERVICES.findIndex(s => s.name === b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });

        const html = sortedSvcNames.map((svcName, idx) => {
            const list = groups[svcName];
            const svcConfig = SERVICES.find(s => s.name === svcName) || { color: 'teal' };

            let htmlChunk = `
                <div class="mb-6">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="px-3 py-1 text-sm font-bold rounded-lg border shadow-sm" 
                              style="background: var(--card-bg); border-color: ${svcConfig.border || '#ccc'}; color: ${svcConfig.icon || '#333'}">
                            ${svcName}
                        </span>
                        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            `;

            const listHtml = list.map(s => {
                const status = getServantHistoryStatusForDate(s.id, dateStr, cacheToUse);

                // Fixed: Define colorClass derived from serviceConfig
                const bgClass = svcConfig.color ? `bg-${svcConfig.color}-50 dark:bg-${svcConfig.color}-900/10 border-${svcConfig.color}-200 dark:border-${svcConfig.color}-800` : 'bg-slate-50 dark:bg-slate-800 border-slate-200';
                let badgeHtml = "";

                // Show status label if consecutive absences (no background override)
                if (status && status.consecutiveAbsences >= 2) {
                    badgeHtml = `<span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 ml-auto"><i class="fas fa-exclamation-triangle ml-1"></i>غياب ${status.consecutiveAbsences} متتالي</span>`;
                } else if (status && status.isExcused) {
                    badgeHtml = `<span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/20 ml-auto"><i class="fas fa-bed ml-1"></i>معتذر</span>`;
                }

                // Check explanation history for the last 30 days
                let explanationHistoryHtml = "";
                let explanationDatesHtml = "";
                if (actKey === 'explanation') {
                    let expDates = [];
                    const targetDate = new Date(dateStr);
                    Object.keys(cacheToUse).forEach(k => {
                        if (k < dateStr) {
                            const pastDate = new Date(k);
                            const diff = (targetDate - pastDate) / (1000 * 60 * 60 * 24);
                            if (diff > 0 && diff <= 30) {
                                if (cacheToUse[k]['explanation']?.attendees?.includes(s.id)) {
                                    expDates.push(k);
                                }
                            }
                        }
                    });
                    if (expDates.length > 0) {
                        const toggleId = `exp-dates-${s.id}-${dateStr}`;
                        explanationHistoryHtml = `<button onclick="document.getElementById('${toggleId}').classList.toggle('hidden')" class="text-[0.65rem] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 mr-2 hover:bg-blue-200 transition text-right"><i class="fas fa-rotate-left mr-1"></i> شرح ${expDates.length}× قريباً <i class="fas fa-chevron-down text-[10px] ml-1"></i></button>`;

                        explanationDatesHtml = `<div id="${toggleId}" class="hidden w-full mt-2 text-xs bg-white dark:bg-slate-800/50 p-2 rounded border border-blue-100 dark:border-blue-900/50">
                            <strong class="text-blue-800 dark:text-blue-300">تواريخ الشرح السابقة:</strong>
                            <ul class="list-disc list-inside mt-1 text-slate-600 dark:text-slate-300 text-[11px]">
                                ${expDates.sort().reverse().map(d => `<li>${d}</li>`).join('')}
                            </ul>
                        </div>`;
                    }
                }

                return `
                    <div class="flex flex-col p-2.5 rounded-lg border shadow-sm transition-all ${bgClass}">
                        <div class="flex items-center flex-wrap gap-y-1 w-full">
                            <div class="font-bold text-sm ml-2 truncate">${s.name}</div>
                            ${explanationHistoryHtml}
                            ${s.serviceName && isGeneralSecretaryMode ? `<span class="text-[0.6rem] opacity-70 bg-black/5 dark:bg-white/10 px-1 rounded ml-1 whitespace-nowrap">${s.serviceName}</span>` : ''}
                            <div class="mr-auto">${badgeHtml}</div>
                        </div>
                        ${explanationDatesHtml}
                    </div>`;
            }).join('');

            htmlChunk += listHtml;
            htmlChunk += `</div></div>`;
            return htmlChunk;
        }).join('');

        body.innerHTML = `<div>${html}</div>
        <div class="mt-4 pt-4 border-t dark:border-slate-700 text-center font-bold text-teal-600 bg-teal-50 dark:bg-teal-900/20 p-2 rounded-lg">
            الإجمالي المحضرين لنشاط ${act.name}: ${attendeeIds.length} خادم
        </div>`;
    }

    modal.classList.remove('hidden-view');
};

// ─── Activity Average Bar Chart ────────────────────────────────────
function renderActivityAvgChart(servants, attendanceCache) {
    const canvas = document.getElementById('activityAvgChart');
    if (!canvas || !servants.length) return;

    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const data = targetActs.map(act => {
        let attended = 0, meetings = 0;
        Object.values(attendanceCache).forEach(dayData => {
            if (dayData[act.key]?.note == null && dayData[act.key]) {
                meetings++;
                attended += dayData[act.key]?.attendees?.length || 0;
            }
        });
        return meetings > 0 ? Math.round((attended / (meetings * servants.length)) * 100) : 0;
    });

    if (AppState.charts.activity) AppState.charts.activity.destroy();
    AppState.charts.activity = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: targetActs.map(a => a.name),
            datasets: [{
                label: 'متوسط الحضور %',
                data,
                backgroundColor: targetActs.map(a => a.border + 'cc'),
                borderColor: targetActs.map(a => a.border),
                borderWidth: 2,
                borderRadius: 8,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
        }
    });
}

// ─── Admin Dashboard ───────────────────────────────────────────────
export function renderAdminDashboard() {
    const { allServantsCache, allAttendanceCache } = AppState;
    // Only render KPIs at top - servants table is on the dedicated servants page
    renderAdminKpis(allServantsCache, allAttendanceCache);
}

export function renderAdminServantsTable(servants) {
    const container = DOM.adminServantsTableBody;
    if (!container) return;

    const src = servants.slice(0, 100); // Limit for performance
    const rows = src.map(s => {
        const val = v => v || '-';
        return `<tr onclick="openServantProfile('${s.id}')" class="border-b dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-sm cursor-pointer">
            <td class="p-3 font-semibold text-teal-700 dark:text-teal-400">${val(s.name)}</td>
            <td class="p-3 text-slate-600 dark:text-slate-300">
                <span class="bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded text-xs font-bold">${val(s.serviceName)}</span>
            </td>
            <td class="p-3">${val(s.mobile)}</td>
            <td class="p-3">${val(s.dob)}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="4" class="text-center p-8 text-slate-400">لا يوجد بيانات.</td></tr>`;

    container.innerHTML = `
        <div class="w-full overflow-x-auto">
            <table class="w-full text-right border-collapse whitespace-nowrap">
                <thead>
                    <tr class="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                        <th class="p-3">الاسم</th>
                        <th class="p-3">الخدمة</th>
                        <th class="p-3">الموبايل</th>
                        <th class="p-3">تاريخ الميلاد</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function renderAdminStatsCards(servants, attendance) {
    const serviceGroups = servants.reduce((acc, s) => {
        if (!s.serviceName) return acc;
        acc[s.serviceName] = (acc[s.serviceName] || 0) + 1;
        return acc;
    }, {});

    const statsContainer = document.getElementById('adminStatsContainer');
    if (!statsContainer) return;

    const svcs = Object.entries(serviceGroups).sort((a, b) => b[1] - a[1]);
    statsContainer.innerHTML = svcs.map(([name, count]) =>
        `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <span class="font-medium text-sm">${name}</span>
            <span class="font-bold text-teal-600">${count} خادم</span>
        </div>`
    ).join('');
}

// ─── Load All Services Data (Admin mode) ──────────────────────────
export async function loadAllServicesData() {
    await authReady;
    if (AppState.isLocalMode) {
        const svcNames = SERVICES.filter(s => !s.isGroup).map(s => s.name);
        AppState.allServantsCache = [];
        svcNames.forEach(name => {
            const servants = JSON.parse(localStorage.getItem(`servants-${name}`) || '[]');
            servants.forEach(s => { s.serviceName = name; });
            AppState.allServantsCache.push(...servants);
        });
        return;
    }

    AppState.allServantsCache = [];
    AppState.allAttendanceCache = [];

    try {
        const svcNames = SERVICES.filter(s => !s.isGroup).map(s => s.name);
        const results = await Promise.allSettled(svcNames.map(async name => {
            try {
                const [servants, attendanceRaw] = await Promise.all([
                    getDocs(collection(AppState.db, 'services', name, 'servants')),
                    fetchFullAttendance(name)
                ]);
                const svts = servants.docs.map(d => ({ ...d.data(), id: d.id, serviceName: name }));
                const att = Object.entries(attendanceRaw).map(([date, data]) => ({ date, serviceName: name, ...data }));
                return { servants: svts, attendance: att };
            } catch (svcErr) {
                console.warn(`فشل تحميل خدمة ${name}:`, svcErr);
                return { servants: [], attendance: [] };
            }
        }));

        results.forEach(r => {
            if (r.status === 'fulfilled') {
                AppState.allServantsCache.push(...r.value.servants);
                AppState.allAttendanceCache.push(...r.value.attendance);
            }
        });

        AppState.allServantsCache.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

        // Re-render servants table and populate service filter once all data is loaded
        populateServiceFilter();
        renderServantsTable();
    } catch (e) {
        console.error('loadAllServicesData:', e);
        if (!AppState.allServantsCache.length) {
            showMessage('تعذّر تحميل بيانات الخدمات. تحقق من الاتصال.', true);
        }
    }
}

// ─── Activity Registration Grid (for follow-up page - like old design Image 2) ───
export function renderActivityRegistrationGrid() {
    const container = document.getElementById('activityRegistrationGridContainer');
    if (!container) return;

    if (!AppState.isGeneralSecretaryMode) {
        container.innerHTML = '';
        return;
    }

    const { allAttendanceCache, attendanceYearCache } = AppState;
    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');

    // Find last Friday
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let lastFriday = new Date(today);
    let offset = 5 - today.getDay();
    if (offset > 1) offset -= 7;
    lastFriday.setDate(today.getDate() + offset);
    const y = lastFriday.getFullYear();
    const m = String(lastFriday.getMonth() + 1).padStart(2, '0');
    const d = String(lastFriday.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    // Format date in Arabic
    const dateAr = lastFriday.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });

    // Get services to display
    const svcList = SERVICES.filter(s => !s.isGroup);

    // Build per-service attendance data
    const getServiceDayData = (svcName) => {
        if (isGeneralSecretaryMode) {
            const dayEntries = allAttendanceCache.filter(e => e.date === dateStr && e.serviceName === svcName);
            if (!dayEntries.length) return {};
            const merged = {};
            dayEntries.forEach(e => {
                targetActs.forEach(act => { if (e[act.key]) merged[act.key] = e[act.key]; });
            });
            return merged;
        } else {
            return attendanceYearCache[dateStr] || {};
        }
    };

    // Collapse state (default = collapsed so follow-up section is visible)
    const collapseKey = 'actRegGrid-collapsed';
    const isCollapsed = localStorage.getItem(collapseKey) !== 'false';

    const gridCards = svcList.map((svc) => {
        const dayData = getServiceDayData(svc.name);
        const dotsHtml = ACTIVITIES.filter(a => a.key !== 'apology').map(act => {
            const actData = dayData[act.key];
            let statusClass = "bg-red-400 text-white", icon = "fa-times", desc = "لم يسجل";
            if (actData) {
                if (actData.note != null) { statusClass = "bg-amber-400 text-white"; icon = "fa-minus"; desc = `ملغى: ${actData.note}`; }
                else { statusClass = "bg-emerald-500 text-white"; icon = "fa-check"; desc = `مسجل (${actData.attendees?.length || 0})`; }
            }
            return `<div title="${act.name}: ${desc}" class="w-7 h-7 rounded-lg ${statusClass} flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-800 transform hover:scale-110 transition-transform cursor-help"><i class="fas ${icon} text-[10px]"></i></div>`;
        }).join('');
        return `<div class="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-700/20 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-all flex flex-col gap-3 group">
                    <span class="font-black text-slate-700 dark:text-slate-200 text-sm group-hover:text-teal-600 transition-colors">${svc.name}</span>
                    <div class="flex flex-wrap gap-1.5 justify-center">${dotsHtml}</div>
                </div>`;
    }).join('');

    container.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-6">
            <button id="actRegGridToggle" class="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-right border-b border-slate-100 dark:border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-calendar-check text-teal-600 dark:text-teal-400 text-sm"></i>
                    </div>
                    <div class="text-right">
                        <h3 class="font-black text-base text-slate-800 dark:text-slate-100 leading-tight">متابعة تسجيل الحضور</h3>
                        <p class="text-xs text-slate-400 font-bold">آخر جمعة: <span class="text-teal-600 dark:text-teal-400">${dateAr}</span></p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <div class="hidden sm:flex items-center gap-2 text-[10px] font-bold">
                        <span class="flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-md border border-green-100 dark:border-green-800"><i class="fas fa-check-circle"></i> مسجل</span>
                        <span class="flex items-center gap-1 px-2 py-0.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 rounded-md border border-yellow-100 dark:border-yellow-800"><i class="fas fa-minus-circle"></i> ملغى</span>
                        <span class="flex items-center gap-1 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-md border border-red-100 dark:border-red-800"><i class="fas fa-exclamation-circle"></i> لم يسجل</span>
                    </div>
                    <span class="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">${isCollapsed ? 'عرض' : 'إخفاء'}</span>
                    <i id="actRegGridChevron" class="fas fa-chevron-${isCollapsed ? 'down' : 'up'} text-slate-400 text-sm"></i>
                </div>
            </button>
            <div id="actRegGridBody" class="${isCollapsed ? 'hidden' : 'p-5'}">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">${gridCards}</div>
            </div>
        </div>`;

    // Bind toggle
    container.querySelector('#actRegGridToggle')?.addEventListener('click', () => {
        const body = container.querySelector('#actRegGridBody');
        const chevron = container.querySelector('#actRegGridChevron');
        const toggleLabel = container.querySelector('#actRegGridToggle span.text-xs.font-bold.text-slate-400');
        if (!body || !chevron) return;
        const nowHidden = !body.classList.contains('hidden');
        body.classList.toggle('hidden', nowHidden);
        if (!nowHidden) body.classList.add('p-5'); else body.classList.remove('p-5');
        chevron.className = `fas fa-chevron-${nowHidden ? 'down' : 'up'} text-slate-400 text-sm`;
        if (toggleLabel) toggleLabel.textContent = nowHidden ? 'عرض' : 'إخفاء';
        localStorage.setItem(collapseKey, String(nowHidden));
    });
}

// ─── Follow-up Report (absences) - Redesigned Dashboard Style ──────────────────────────
export async function generateFollowUpReport() {
    const { servantsCache, attendanceYearCache, isGeneralSecretaryMode } = AppState;
    const servants = isGeneralSecretaryMode ? AppState.allServantsCache : servantsCache;

    const selectedYear = parseInt(AppState.absenceFilterSelectedYear || new Date().getFullYear(), 10);
    const selectedMonths = AppState.absenceFilterSelectedMonths;
    const selectedActivity = AppState.absenceFilterSelectedActivity;

    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology' && (!selectedActivity || a.key === selectedActivity));

    // Calculate Raw Results
    const results = servants.map(s => {
        let absentDates = [];
        const cache = isGeneralSecretaryMode
            ? AppState.allAttendanceCache.filter(d => d.serviceName === (s.serviceName || s.currentService))
            : Object.entries(attendanceYearCache).map(([date, data]) => ({ date, ...data }));

        let totalSessions = 0;
        cache.forEach(day => {
            const d = new Date(day.date);
            if (isNaN(d.getTime()) || d.getFullYear() !== selectedYear) return;
            if (selectedMonths.size > 0 && !selectedMonths.has(d.getMonth())) return;

            targetActs.forEach(act => {
                const actData = day[act.key];
                // Exclude if it's explicitly marked as a "Special Day"
                if (actData && actData.isSpecial) return;

                // Otherwise, it counts as an expected session
                totalSessions++;
                if (!actData?.attendees || !actData.attendees.includes(s.id)) {
                    absentDates.push({ date: day.date, activity: act.name });
                }
            });
        });

        const pct = totalSessions > 0 ? Math.round((absentDates.length / totalSessions) * 100) : 0;
        return { ...s, absentDates, absentCount: absentDates.length, totalSessions, pct };
    }).filter(s => s.absentCount > 0)
        .sort((a, b) => b.absentCount - a.absentCount);

    AppState.followUpResultsCache = results;
    renderFollowUpResults();
}

export function renderFollowUpResults() {
    const container = DOM.absenceFollowUpResults;
    if (!container) return;

    const query = (AppState.followUpSearchQuery || '').toLowerCase().trim();
    let results = AppState.followUpResultsCache;

    if (query) {
        results = results.filter(r => (r.name || '').toLowerCase().includes(query));
    }

    if (!results.length) {
        container.innerHTML = `
            <div class="text-center py-24 animate-in fade-in duration-700">
                <div class="w-24 h-24 bg-slate-50 dark:bg-slate-900/40 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-slate-100 dark:border-slate-800">
                    <i class="fas fa-search text-4xl text-slate-200 dark:text-slate-700"></i>
                </div>
                <p class="font-black text-slate-400 dark:text-slate-600 text-lg">لم نعثر على أي نتائج مطابقة</p>
                <p class="text-[10px] uppercase tracking-widest text-slate-400 mt-2">جرب تغيير شروط البحث أو الفلاتر</p>
            </div>`;
        return;
    }

    const isGS = AppState.isGeneralSecretaryMode;
    const colorMap = { teal:'#0d9488', lime:'#65a30d', green:'#16a34a', yellow:'#ca8a04', pink:'#db2777', indigo:'#4f46e5', red:'#dc2626', purple:'#9333ea', cyan:'#0891b2', orange:'#ea580c', blue:'#2563eb' };

    const buildCard = (r) => {
        const val = v => v || '-';
        // Palette logic based on percentage (High Intensity design)
        let palette;
        if (r.pct >= 60) palette = { bg:'bg-red-50/30 dark:bg-red-950/20', br:'border-red-100 dark:border-red-900', text:'text-red-700 dark:text-red-400', progress:'bg-red-500', glow:'shadow-red-500/10', light:'bg-red-100 dark:bg-red-900/40' };
        else if (r.pct >= 30) palette = { bg:'bg-orange-50/30 dark:bg-orange-950/20', br:'border-orange-100 dark:border-orange-900', text:'text-orange-700 dark:text-orange-400', progress:'bg-orange-500', glow:'shadow-orange-500/10', light:'bg-orange-100 dark:bg-orange-900/40' };
        else palette = { bg:'bg-white dark:bg-slate-800', br:'border-slate-100 dark:border-slate-700', text:'text-slate-600 dark:text-slate-400', progress:'bg-teal-500', glow:'shadow-teal-500/5', light:'bg-slate-100 dark:bg-slate-700' };

        const safeSvc = (r.serviceName || AppState.currentServiceName || '').replace(/'/g, "\\'");
        const mobile = r.mobile || '';

        return `
        <div class="group relative flex flex-col ${palette.bg} border ${palette.br} rounded-3xl overflow-hidden hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-500 shadow-sm ${palette.glow}">
            <!-- Top Section: Background Pattern Decoration -->
            <div class="absolute top-0 right-0 w-full h-12 bg-gradient-to-b from-black/[0.02] dark:from-white/[0.02] to-transparent pointer-events-none"></div>

            <div class="p-5 flex-grow">
                <!-- Header: Avatar & Basic Info -->
                <div class="flex items-start gap-4 mb-5">
                    <div class="relative flex-shrink-0" onclick="event.stopPropagation(); showServantProfile('${r.id}', '${safeSvc}')">
                        <img src="${r.imageUrl || 'https://placehold.co/100x100/f1f5f9/CBD5E1?text=👤'}" 
                             class="w-16 h-16 rounded-2xl object-cover shadow-lg border-2 border-white dark:border-slate-700 bg-white dark:bg-slate-800 group-hover:scale-105 transition-transform duration-500">
                        <div class="absolute -bottom-1 -left-1 w-6 h-6 rounded-lg bg-white dark:bg-slate-800 shadow-md flex items-center justify-center border border-slate-50 dark:border-slate-700">
                             <span class="text-[9px] font-black ${palette.text}">${r.absentCount}</span>
                        </div>
                    </div>
                    
                    <div class="flex-grow min-w-0 pt-1">
                        <h3 class="font-black text-slate-800 dark:text-slate-50 text-base leading-tight truncate group-hover:text-teal-600 transition-colors" 
                            onclick="showServantProfile('${r.id}', '${safeSvc}')">
                            ${val(r.name)}
                        </h3>
                        <p class="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight flex items-center gap-1.5">
                            <i class="fas fa-map-marker-alt text-slate-300"></i> ${val(r.chapter || 'غير محدد')}
                        </p>
                        ${isGS && r.serviceName ? `
                        <div class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-[8px] font-black border border-teal-100/50 dark:border-teal-800/50">
                            <i class="fas fa-star text-[7px] opacity-70"></i> ${r.serviceName}
                        </div>` : ''}
                    </div>
                </div>

                <!-- Stats & Progress -->
                <div class="grid grid-cols-2 gap-3 mb-5">
                    <div class="${palette.light} p-2 rounded-2xl flex flex-col items-center">
                        <span class="text-[8px] uppercase tracking-tighter text-slate-400 font-black mb-0.5">مرات الغياب</span>
                        <span class="text-lg font-black text-slate-800 dark:text-slate-100 leading-none">${r.absentCount}</span>
                    </div>
                    <div class="${palette.light} p-2 rounded-2xl flex flex-col items-center">
                        <span class="text-[8px] uppercase tracking-tighter text-slate-400 font-black mb-0.5">إجمالي الفرص</span>
                        <span class="text-lg font-black text-slate-800 dark:text-slate-100 leading-none">${r.totalSessions}</span>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div class="mb-4">
                    <div class="flex justify-between items-center mb-1.5 px-0.5">
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">معدل الانقطاع</span>
                        <span class="text-[10px] font-black ${palette.text}">${r.pct}%</span>
                    </div>
                    <div class="w-full h-2 bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden p-0.5 border border-white/50 dark:border-transparent">
                        <div class="h-full rounded-full ${palette.progress} transition-all duration-1000 shadow-sm" style="width: ${r.pct}%"></div>
                    </div>
                </div>
            </div>

            <!-- Bottom Action Bar -->
            <div class="bg-slate-50 dark:bg-slate-900/60 p-3 mt-auto border-t border-slate-100 dark:border-slate-800 flex items-center justify-around gap-2">
                <a href="tel:${mobile}" class="flex-1 h-9 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/30 border border-slate-100 dark:border-slate-700 transition-all shadow-sm ${!mobile ? 'opacity-30 pointer-events-none' : ''}" title="اتصال هاتفي">
                    <i class="fas fa-phone-alt text-xs"></i>
                </a>
                <a href="https://wa.me/${mobile.startsWith('0') ? '2'+mobile : mobile}" target="_blank" class="flex-1 h-9 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 border border-slate-100 dark:border-slate-700 transition-all shadow-sm ${!mobile ? 'opacity-30 pointer-events-none' : ''}" title="واتساب">
                    <i class="fab fa-whatsapp text-sm"></i>
                </a>
                <button onclick="showServantProfile('${r.id}', '${safeSvc}')" class="flex-1 h-9 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-100 dark:border-slate-700 transition-all shadow-sm" title="الملف الكامل">
                    <i class="fas fa-id-badge text-xs"></i>
                </button>
            </div>
        </div>`;
    };

    if (isGS) {
        const groups = {};
        results.forEach(r => { const k = r.serviceName || 'عام'; (groups[k] = groups[k] || []).push(r); });
        const sortedSvcs = Object.keys(groups).sort((a, b) => {
            const iA = SERVICES.findIndex(s => s.name === a);
            const iB = SERVICES.findIndex(s => s.name === b);
            return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
        });

        container.innerHTML = `
            <div class="flex flex-col gap-10 pb-40 max-h-[85vh] overflow-y-auto custom-scrollbar px-2 pt-2">` +
            sortedSvcs.map(svcName => {
                const svcConf = SERVICES.find(s => s.name === svcName) || { color: 'teal', icon: 'fa-user-tie' };
                const clr = colorMap[svcConf.color] || '#0d9488';
                const list = groups[svcName];
                if (!list || list.length === 0) return '';
                
                return `
                <div class="animate-in slide-in-from-bottom-4 duration-500">
                    <div class="flex items-center gap-4 mb-6 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl py-4 z-10 border-b border-slate-100 dark:border-slate-800 mx-[-8px] px-[8px]">
                        <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3 group-hover:rotate-0 transition-transform"
                             style="background: linear-gradient(135deg, ${clr}, ${clr}cc)">
                            <i class="fas ${svcConf.icon} text-xl"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-black text-slate-800 dark:text-white text-lg tracking-tight mb-0.5">${svcName}</span>
                            <div class="flex items-center gap-2">
                                <span class="bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-[9px] font-black px-2 py-0.5 rounded-full border border-teal-100 dark:border-teal-800">
                                    ${list.length} خدام متغيبين
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5 lg:gap-8">
                        ${list.map(r => buildCard(r)).join('')}
                    </div>
                </div>`;
            }).join('') + `</div>`;
    } else {
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8 pb-40 max-h-[85vh] overflow-y-auto custom-scrollbar px-2 pt-2 animate-in slide-in-from-bottom-6 duration-700">
                ${results.map(r => buildCard(r)).join('')}
            </div>`;
    }
}


// ─── Backup / Restore ─────────────────────────────────────────────
export function backupData() {
    const backup = {
        service: AppState.currentServiceName,
        servants: AppState.servantsCache,
        attendance: AppState.attendanceYearCache,
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${AppState.currentServiceName}-${new Date().toLocaleDateString('ar').replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('تم تصدير النسخة الاحتياطية ✓');
}

export function restoreData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const backup = JSON.parse(ev.target.result);
            if (!backup.servants?.length) throw new Error('ملف غير صالح');
            if (!confirm(`استيراد ${backup.servants.length} خادم؟ سيتم دمجهم مع البيانات الحالية.`)) return;
            showLoading(true);
            const col = collection(AppState.db, 'services', AppState.currentServiceName, 'servants');
            await Promise.all(backup.servants.map(s => {
                const { id, ...data } = s;
                return addDoc(col, data);
            }));
            showMessage(`تمت استعادة ${backup.servants.length} خادم ✓`);
        } catch (err) {
            console.error(err);
            showMessage('فشل الاستعادة. تأكد من صحة الملف.', true);
        } finally { showLoading(false); }
    };
    reader.readAsText(file);
}
