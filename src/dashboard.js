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
import { loadReportsPage, populateReportActivitySelector } from './reports.js';
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

        const eventsLink = document.getElementById('eventsPageLink');
        if (eventsLink) eventsLink.classList.toggle('hidden-view', isAdmin);

        const activityStatusCard = document.getElementById('activityStatusCard');
        if (activityStatusCard) activityStatusCard.classList.remove('hidden-view');

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
        // Load events section for non-admin services
        await renderServiceEvents();
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
    renderWeeklyTrend(servantsCountToUse, attendanceYearCache);
    renderServiceTips(servantsCountToUse, attendanceYearCache);
}

function renderHomeChart(servantsCache, attendanceYearCache) {
    const ctx = document.getElementById('homeAttendanceChart');
    if (!ctx) return;
    if (AppState.charts.home) AppState.charts.home.destroy();
    const { labels, datasets } = getAttendanceChartData(servantsCache, attendanceYearCache, 30);
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
                if (!bStr || typeof bStr !== 'string') return '';
                const parts = bStr.split('-');
                if (parts.length !== 3) return '';

                const [yyyy, mm, dd] = parts.map(Number);
                if (isNaN(mm) || isNaN(dd)) return '';

                let nextBday = new Date(today.getFullYear(), mm - 1, dd);
                nextBday.setHours(0, 0, 0, 0);

                const todayMidnight = new Date();
                todayMidnight.setHours(0, 0, 0, 0);

                if (nextBday < todayMidnight) {
                    nextBday.setFullYear(todayMidnight.getFullYear() + 1);
                }
                const diffTime = Math.abs(nextBday - todayMidnight);
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
                const dateText = `${dd} ${monthNames[mm - 1]}`;

                let dayStr = diffDays === 0 ? "اليوم! 🎉" : `بعد ${diffDays} يوم (${dateText})`;

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
                statusHtml = `<div class="mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/40 px-3 py-1 rounded-xl flex items-center justify-center text-center leading-tight">
                    <i class="fas fa-info-circle ml-1"></i> ${actData.note}
                </div>`;
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

        // Group by Service (GS mode) or Chapter (Regular mode)
        const groups = {};
        attendeesFull.forEach(s => {
            const groupKey = isGeneralSecretaryMode ? (s.serviceName || 'عام') : (s.chapter || 'بدون فصل');
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(s);
        });

        const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
            if (isGeneralSecretaryMode) {
                const idxA = SERVICES.findIndex(s => s.name === a);
                const idxB = SERVICES.findIndex(s => s.name === b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            } else {
                if (a === 'بدون فصل') return 1;
                if (b === 'بدون فصل') return -1;
                return a.localeCompare(b, 'ar');
            }
        });

        const dynamicColors = ['blue', 'green', 'violet', 'orange', 'pink', 'indigo', 'rose', 'teal', 'cyan', 'amber'];

        const html = sortedGroupKeys.map((groupName, idx) => {
            const list = groups[groupName];
            
            let colorKey, icon, borderStr;
            if (isGeneralSecretaryMode) {
                const svcConfig = SERVICES.find(s => s.name === groupName) || {};
                colorKey = svcConfig.color || 'slate';
                icon = svcConfig.icon || 'fa-users';
                borderStr = svcConfig.border || '#ccc';
            } else {
                colorKey = dynamicColors[idx % dynamicColors.length];
                icon = 'fa-users-class';
                borderStr = 'transparent';
            }

            let htmlChunk = `
                <div class="mb-6">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="px-3 py-1 text-sm font-bold rounded-lg border shadow-sm ${isGeneralSecretaryMode ? '' : `bg-${colorKey}-100 dark:bg-${colorKey}-900/30 text-${colorKey}-700 dark:text-${colorKey}-300`}" 
                              style="${isGeneralSecretaryMode ? `background: var(--card-bg); border-color: ${borderStr};` : ''}">
                            ${isGeneralSecretaryMode ? '' : `<i class="fas fa-users ml-1 text-${colorKey}-500"></i>`} ${groupName}
                        </span>
                        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            `;

            const listHtml = list.map(s => {
                const status = window.getServantHistoryStatusForDate ? window.getServantHistoryStatusForDate(s.id, dateStr, cacheToUse) : null;

                const bgClass = `bg-${colorKey}-50 dark:bg-${colorKey}-900/10 border-${colorKey}-200 dark:border-${colorKey}-800`;
                let badgeHtml = "";

                // Show status label if consecutive absences (no background override)
                if (status && status.consecutiveAbsences >= 2) {
                    badgeHtml = `<span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 ml-auto"><i class="fas fa-exclamation-triangle ml-1"></i>غياب ${status.consecutiveAbsences} متتالي</span>`;
                } else if (status && status.isExcused) {
                    badgeHtml = `<span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/20 ml-auto"><i class="fas fa-bed ml-1"></i>معتذر</span>`;
                }

                // Check explanation history for the last 30 days when viewing PREPARATION activity
                let explanationHistoryHtml = "";
                let explanationDatesHtml = "";
                if (actKey === 'preparation') {
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
                            <strong class="text-blue-800 dark:text-blue-300">تواريخ الشرح السابقة (30 يوم):</strong>
                            <ul class="list-disc list-inside mt-1 text-slate-600 dark:text-slate-300 text-[11px]">
                                ${expDates.sort().reverse().map(d => `<li>${d}</li>`).join('')}
                            </ul>
                        </div>`;
                    } else {
                        explanationHistoryHtml = `<span class="text-[0.65rem] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 mr-2"><i class="fas fa-exclamation-circle mr-1"></i> لم يشرح مؤخراً</span>`;
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
// ─── Weekly Trend ─────────────────────────────────────────────────
function renderWeeklyTrend(servants, attendanceCache) {
    const container = document.getElementById('weeklyTrendContent');
    if (!container || !servants.length) return;

    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find last 4 Fridays
    const fridays = [];
    let d = new Date(today);
    while (fridays.length < 4) {
        if (d.getDay() === 5) {
            const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
            fridays.push(`${y}-${m}-${dd}`);
        }
        d.setDate(d.getDate() - 1);
    }
    fridays.reverse();

    // Calculate avg per activity for each Friday
    const weeklyData = targetActs.map(act => {
        const weekPercs = fridays.map(dateStr => {
            const dayData = attendanceCache[dateStr];
            if (!dayData || !dayData[act.key] || dayData[act.key].isSpecial) return null;
            const attendees = dayData[act.key].attendees?.length || 0;
            return servants.length > 0 ? Math.round((attendees / servants.length) * 100) : 0;
        });

        const validPercs = weekPercs.filter(p => p !== null);
        const lastIdx = weekPercs.length - 1;
        const current = weekPercs[lastIdx];
        const prev = weekPercs[lastIdx - 1];
        let trend = 'neutral', trendIcon = 'fa-minus', trendColor = 'text-slate-400';
        if (current !== null && prev !== null) {
            if (current > prev) { trend = 'up'; trendIcon = 'fa-arrow-up'; trendColor = 'text-green-500'; }
            else if (current < prev) { trend = 'down'; trendIcon = 'fa-arrow-down'; trendColor = 'text-red-500'; }
        }

        const avg = validPercs.length > 0 ? Math.round(validPercs.reduce((a, b) => a + b, 0) / validPercs.length) : 0;
        return { name: act.name, icon: act.icon, color: act.border, avg, trend, trendIcon, trendColor, current };
    });

    container.innerHTML = weeklyData.map(w => {
        let displayValue = "";
        let pctColor = "";

        if (w.current === null) {
            displayValue = "ملغى";
            pctColor = "text-slate-400 dark:text-slate-500 text-xl";
        } else {
            displayValue = w.current + "%";
            pctColor = w.current >= 80 ? 'text-green-600 dark:text-green-400' : w.current >= 60 ? 'text-yellow-600 dark:text-yellow-400' : w.current >= 40 ? 'text-orange-500' : 'text-red-500';
        }

        return `
        <div class="p-3 rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-center transition-all hover:shadow-md">
            <div class="flex items-center justify-center gap-1 mb-2">
                <i class="fas ${w.icon} text-sm" style="color: ${w.color}"></i>
                <span class="text-xs font-bold text-slate-600 dark:text-slate-300">${w.name}</span>
            </div>
            <div class="text-2xl font-black ${pctColor}">${displayValue}</div>
            <div class="flex items-center justify-between gap-1 mt-2 text-[10px] border-t dark:border-slate-600 pt-1">
                <span class="text-slate-500">متوسط شهر: <strong class="text-slate-700 dark:text-slate-300">${w.avg}%</strong></span>
                <span class="flex items-center gap-1 ${w.trendColor} font-bold">
                    <i class="fas ${w.trendIcon} text-[9px]"></i>
                    ${w.trend === 'up' ? 'تحسن' : w.trend === 'down' ? 'تراجع' : 'مستقر'}
                </span>
            </div>
        </div>`;
    }).join('');
}

// ─── Service Tips ─────────────────────────────────────────────────
function renderServiceTips(servants, attendanceCache) {
    const container = document.getElementById('serviceTipsContainer');
    if (!container) return;

    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const tips = [];

    // Calculate overall stats
    const actStats = targetActs.map(act => {
        let attended = 0, meetings = 0;
        Object.values(attendanceCache).forEach(dayData => {
            if (dayData[act.key] && !dayData[act.key].isSpecial && dayData[act.key].note == null) {
                meetings++;
                attended += dayData[act.key].attendees?.length || 0;
            }
        });
        const pct = meetings > 0 && servants.length > 0 ? Math.round((attended / (meetings * servants.length)) * 100) : 0;
        return { name: act.name, pct, meetings };
    });

    // Find weakest and strongest activities
    const sorted = [...actStats].sort((a, b) => a.pct - b.pct);
    const weakest = sorted.find(a => a.meetings > 0);
    const strongest = sorted.reverse().find(a => a.meetings > 0);

    if (weakest && weakest.pct < 60) {
        tips.push({ icon: 'fa-exclamation-triangle', color: 'text-orange-500', text: `نشاط "${weakest.name}" يحتاج اهتمام أكبر (${weakest.pct}%). حاول تشجيع الخدام على المشاركة.` });
    }
    if (strongest && strongest.pct >= 70) {
        tips.push({ icon: 'fa-star', color: 'text-yellow-500', text: `أعلى حضور في "${strongest.name}" (${strongest.pct}%). استمر في هذا المستوى! ⭐` });
    }

    // Count unrecorded Fridays
    const today = new Date();
    let unrec = 0;
    for (let i = 0; i < 4; i++) {
        let fd = new Date(today); fd.setDate(fd.getDate() - (fd.getDay() + 2 + i * 7));
        const ds = fd.toISOString().split('T')[0];
        if (!attendanceCache[ds]) unrec++;
    }
    if (unrec > 0) {
        tips.push({ icon: 'fa-calendar-times', color: 'text-red-500', text: `يوجد ${unrec} جمعة بدون تسجيل في آخر شهر. سجّل الحضور أولاً بأول.` });
    }

    if (servants.length < 5) {
        tips.push({ icon: 'fa-user-plus', color: 'text-teal-500', text: 'عدد الخدام قليل. أضف جميع الخدام للحصول على تقارير دقيقة.' });
    }

    // Default tip if no data-driven tips
    if (tips.length === 0) {
        tips.push({ icon: 'fa-check-circle', color: 'text-green-500', text: 'الخدمة تسير بشكل ممتاز! حافظ على الالتزام 💪' });
    }

    container.innerHTML = tips.map(t => `
        <div class="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border dark:border-slate-600/50">
            <i class="fas ${t.icon} ${t.color} mt-0.5 flex-shrink-0"></i>
            <span class="leading-relaxed">${t.text}</span>
        </div>
    `).join('');
}

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

    if (AppState.charts.activityHome) AppState.charts.activityHome.destroy();
    AppState.charts.activityHome = new Chart(canvas, {
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
        if (AppState.isGeneralSecretaryMode) {
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

    // Collapse state (default = expanded so follow-up section is visible)
    const collapseKey = 'actRegGrid-collapsed';
    const isCollapsed = localStorage.getItem(collapseKey) === 'true';

    const gridCards = svcList.map((svc) => {
        const dayData = getServiceDayData(svc.name);
        const dotsHtml = targetActs.map(act => {
            const actData = dayData[act.key];
            let statusClass = "bg-[#f87171] dark:bg-red-500/80 ring-2 ring-red-200 dark:ring-red-900/50 shadow-sm", icon = "fa-times", desc = "لم يسجل";
            if (actData) {
                if (actData.note != null) { statusClass = "bg-[#facc15] dark:bg-yellow-500/80 ring-2 ring-yellow-200 dark:ring-yellow-900/50 shadow-sm"; icon = "fa-minus"; desc = actData.note; }
                else { statusClass = "bg-[#4ade80] dark:bg-green-500/80 ring-2 ring-green-200 dark:ring-green-900/50 shadow-sm"; icon = "fa-check"; desc = `مسجل (${actData.attendees?.length || 0})`; }
            }
            return `<div title="${act.name}: ${desc}" class="w-5 h-5 sm:w-6 sm:h-6 rounded-full ${statusClass} flex items-center justify-center transform hover:scale-110 transition-transform cursor-help">
                        <i class="fas ${icon} text-[8px] sm:text-[10px] text-white"></i>
                    </div>`;
        }).join('');
        return `<div class="p-3 bg-white dark:bg-slate-800 rounded-xl mb-2 flex items-center justify-between border border-slate-100 dark:border-slate-700 shadow-sm hover:border-slate-200 dark:hover:border-slate-600 transition-all hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <span class="font-bold text-slate-700 dark:text-slate-200 text-xs sm:text-sm truncate pl-2">${svc.name}</span>
                    <div class="flex items-center gap-1.5 sm:gap-2" dir="rtl">${dotsHtml}</div>
                </div>`;
    }).join('');

    container.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-6">
            <button id="actRegGridToggle" class="w-full px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-right border-b border-slate-100 dark:border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-calendar-check text-teal-600 dark:text-teal-400 text-sm"></i>
                    </div>
                    <div class="text-right">
                        <h3 class="font-black text-base text-slate-800 dark:text-slate-100 leading-tight">متابعة تسجيل الحضور</h3>
                        <p class="text-xs text-slate-400 font-bold mt-1">آخر جمعة: <span class="text-teal-600 dark:text-teal-400">${dateAr}</span></p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    <span class="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">${isCollapsed ? 'عرض' : 'إخفاء'}</span>
                    <i id="actRegGridChevron" class="fas fa-chevron-${isCollapsed ? 'down' : 'up'} text-slate-400 text-sm"></i>
                </div>
            </button>
            <div id="actRegGridBody" class="${isCollapsed ? 'hidden' : 'p-3 sm:p-5'}">
                <div class="flex flex-col sm:flex-row justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl mb-4 border border-slate-100 dark:border-slate-800 gap-3">
                    <div class="flex items-center gap-2 text-[10px] font-bold">
                        <span class="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 shadow-sm"><div class="w-3 h-3 rounded-full bg-[#4ade80]"></div> مسجل</span>
                        <span class="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 shadow-sm"><div class="w-3 h-3 rounded-full bg-[#facc15]"></div> ملغى</span>
                        <span class="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 shadow-sm"><div class="w-3 h-3 rounded-full bg-[#f87171]"></div> لم يسجل</span>
                    </div>
                    <div class="text-[9px] sm:text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">ترتيب الأنشطة: الافتقاد - التحضير - القداس - الخدمة - الشرح</div>
                </div>
                <div class="bg-slate-50/50 dark:bg-slate-900/30 p-2 sm:p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    ${gridCards}
                </div>
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
    let servants = isGeneralSecretaryMode ? AppState.allServantsCache : servantsCache;

    // Filter by selected services (GS mode)
    if (isGeneralSecretaryMode && AppState.absenceFilterSelectedServices && AppState.absenceFilterSelectedServices.size > 0) {
        servants = servants.filter(s => AppState.absenceFilterSelectedServices.has(s.serviceName));
    }

    const selectedYear = parseInt(AppState.absenceFilterSelectedYear || new Date().getFullYear(), 10);
    const selectedMonths = AppState.absenceFilterSelectedMonths;
    const selectedActivity = AppState.absenceFilterSelectedActivity;

    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology' && (!selectedActivity || a.key === selectedActivity));

    let totalSessionsGlobal = 0; // to detect "no data" scenario

    // Calculate Raw Results
    const results = servants.map(s => {
        let absentDates = [];
        const cache = isGeneralSecretaryMode
            ? AppState.allAttendanceCache.filter(d => d.serviceName === s.serviceName)
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

        totalSessionsGlobal += totalSessions;
        const pct = totalSessions > 0 ? Math.round((absentDates.length / totalSessions) * 100) : 0;
        return { ...s, absentDates, absentCount: absentDates.length, totalSessions, pct };
    }).filter(s => s.absentCount > 0)
        .sort((a, b) => b.absentCount - a.absentCount);

    // Detect "no sessions" scenario
    AppState.followUpNoDataScenario = servants.length > 0 && totalSessionsGlobal === 0;
    AppState.followUpResultsCache = results;
    renderFollowUpResults();
}

export function renderFollowUpResults() {
    const container = DOM.absenceFollowUpResults;
    if (!container) return;

    const query = (AppState.followUpSearchQuery || '').toLowerCase().trim();
    let results = AppState.followUpResultsCache || [];

    if (query) {
        results = results.filter(r => (r.name || '').toLowerCase().includes(query));
    }

    // Update Badge
    const badge = document.getElementById('followUpResultsCountBadge');
    if (badge) badge.textContent = results.length;

    if (!results.length) {
        if (AppState.followUpNoDataScenario) {
            const noDataMessage = AppState.isGeneralSecretaryMode ? 'عفواً، لم يقم أمين الخدمة بتسجيل حضور هذا النشاط' : 'لا توجد جلسات مسجلة في هذه الفترة';
            const noDataSub = AppState.isGeneralSecretaryMode ? 'تأكد من قيام أمناء الخدمات المختارة بتسجيل بيانات الحضور والغياب للأنشطة.' : 'لم يتم تسجيل بيانات حضور وغياب للخدمات المختارة خلال السنة المحددة. جرب تغيير السنة أو الشهور.';
            container.innerHTML = `
                <div class="text-center py-16 animate-in fade-in duration-700">
                    <div class="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner border border-amber-100 dark:border-amber-800">
                        <i class="fas fa-database text-3xl text-amber-300 dark:text-amber-600"></i>
                    </div>
                    <p class="font-black text-amber-500 dark:text-amber-400 text-base mb-2">${noDataMessage}</p>
                    <p class="text-sm text-slate-400 dark:text-slate-500 max-w-sm mx-auto">${noDataSub}</p>
                </div>`;
        } else {
            container.innerHTML = `
                <div class="text-center py-16 animate-in fade-in duration-700">
                    <div class="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner border border-green-100 dark:border-green-800">
                        <i class="fas fa-check-double text-3xl text-green-300 dark:text-green-600"></i>
                    </div>
                    <p class="font-black text-green-500 dark:text-green-400 text-base mb-2">لا يوجد غياب مسجل</p>
                    <p class="text-sm text-slate-400 dark:text-slate-500">كل الخدام حاضرون في الفترة المحددة أو جرب تغيير شروط البحث.</p>
                </div>`;
        }
        return;
    }

    const buildRow = (r, idx) => {
        // Color coding by absence percentage
        let bgStyle = 'bg-white dark:bg-slate-800/80 border-slate-100 dark:border-slate-700/50';
        let badgeStyle = 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700';
        let numBg = 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400';
        let sideBar = 'bg-slate-300 dark:bg-slate-600';

        if (r.pct >= 60) {
            bgStyle = 'bg-red-50/70 dark:bg-red-900/15 border-red-100 dark:border-red-900/40';
            badgeStyle = 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50';
            numBg = 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400';
            sideBar = 'bg-red-400 dark:bg-red-600';
        } else if (r.pct >= 30) {
            bgStyle = 'bg-orange-50/70 dark:bg-orange-900/15 border-orange-100 dark:border-orange-900/40';
            badgeStyle = 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/50';
            numBg = 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400';
            sideBar = 'bg-orange-400 dark:bg-orange-500';
        }

        const safeSvc = (r.serviceName || AppState.currentServiceName || '').replace(/'/g, "\\'");

        return `
            <div class="group flex items-center gap-2.5 p-3 mb-2 rounded-2xl border transition-all hover:scale-[1.005] hover:shadow-sm cursor-pointer ${bgStyle}"
                 onclick="showServantProfile('${r.id}', '${safeSvc}')">
                <!-- Rank number -->
                <div class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black ${numBg}">
                    ${idx}
                </div>
                <!-- Colored side bar -->
                <div class="flex-shrink-0 w-1 h-10 rounded-full ${sideBar}"></div>
                <!-- Name + service -->
                <div class="flex-1 min-w-0 pr-1">
                    <p class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight break-words whitespace-normal">${r.name}</p>
                    ${AppState.isGeneralSecretaryMode && r.serviceName ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">${r.serviceName}</p>` : ''}
                </div>
                <!-- Badge -->
                <div class="flex-shrink-0 flex items-center gap-1.5">
                    <span class="px-2 py-1 rounded-full text-[11px] font-black ${badgeStyle}">
                        ${r.absentCount} <span class="font-normal opacity-70">غياب</span>
                    </span>
                    <i class="fas fa-chevron-left text-[9px] text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-colors"></i>
                </div>
            </div>
        `;
    };

    // Sticky summary (stays at top, outside scroll)
    const summaryHtml = `
        <div class="sticky top-0 z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm pb-3 mb-2 border-b border-slate-100 dark:border-slate-700">
            <div class="flex items-center gap-3 pt-1">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black shadow"
                     style="background: linear-gradient(135deg, #0d9488, #0891b2);">
                    ${results.length}
                </div>
                <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">إجمالي النتائج</p>
                    <p class="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">خادم بحاجة للمتابعة</p>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="animate-in fade-in duration-500">
            ${summaryHtml}
            <div class="overflow-y-auto custom-scrollbar" style="max-height: 55vh; min-height: 250px; padding-bottom: 24px;">
                ${results.map((r, i) => buildRow(r, i + 1)).join('')}
            </div>
        </div>
    `;
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

// ─── Service Events ────────────────────────────────────────────────

// Event color map by type
const EVENT_COLOR_MAP = {
    'رحلة دينية': { bg: 'from-blue-500 to-cyan-500', icon: '🛕', tag: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
    'رحلة ترفيهية': { bg: 'from-green-500 to-teal-500', icon: '🏕️', tag: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
    'يوم روحي': { bg: 'from-violet-500 to-purple-500', icon: '✨', tag: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
    'يوم رياضي': { bg: 'from-orange-500 to-amber-500', icon: '⚽', tag: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
    'اجتماع خدام': { bg: 'from-slate-500 to-slate-600', icon: '👥', tag: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
    'ندوة': { bg: 'from-indigo-500 to-blue-600', icon: '📚', tag: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' },
    'حفلة': { bg: 'from-pink-500 to-rose-500', icon: '🎉', tag: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300' },
    'أخرى': { bg: 'from-slate-400 to-slate-500', icon: '📌', tag: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
};

// Current event being edited for attendance
let _currentEventId = null;

/** Build a single event card HTML */
function buildEventCard(ev, total) {
    const c = EVENT_COLOR_MAP[ev.type] || EVENT_COLOR_MAP['أخرى'];
    const attendees = ev.attendees || [];
    const pct = total > 0 ? Math.round((attendees.length / total) * 100) : 0;
    const dateStr = ev.date
        ? new Date(ev.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
        : '';
    const safeName = (ev.name || '').replace(/'/g, "\\'");
    const safeType = (ev.type || 'أخرى');

    return `
        <div class="group relative flex flex-col items-center justify-center p-4 rounded-xl cursor-pointer shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
             onclick="window.__openEventAttendance('${ev.id}', '${safeName}', '${safeType}')">
             
            <!-- Edit & Delete buttons -->
            <div class="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button onclick="event.stopPropagation(); window.__editServiceEvent('${ev.id}')"
                        class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 hover:bg-blue-500 text-slate-500 hover:text-white flex items-center justify-center transition-colors" title="تعديل">
                    <i class="fas fa-pen text-[10px]"></i>
                </button>
                <button onclick="event.stopPropagation(); window.__deleteServiceEvent('${ev.id}')"
                        class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 hover:bg-red-500 text-slate-500 hover:text-white flex items-center justify-center transition-colors" title="حذف">
                    <i class="fas fa-trash text-[10px]"></i>
                </button>
            </div>
            
            <span class="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded ${c.tag}">${safeType}</span>
             
            <!-- Image / Icon Bubble -->
            <div class="relative w-14 h-14 sm:w-16 sm:h-16 flex flex-shrink-0 items-center justify-center rounded-full mb-3 shadow-inner border border-white/20 bg-gradient-to-br ${c.bg}">
                ${ev.imageData
            ? `<img src="${ev.imageData}" class="absolute inset-0 w-full h-full object-cover rounded-full">`
            : `<span class="text-2xl text-white drop-shadow-sm">${c.icon}</span>`}
                <!-- Attendance Badge -->
                <span title="نسبة الحضور: ${pct}%" class="absolute -bottom-1 -right-1 bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 text-[9px] sm:text-[10px] font-black rounded-full min-w-[20px] sm:min-w-[22px] h-[20px] sm:h-[22px] flex items-center justify-center shadow-md border border-slate-200 dark:border-slate-600">${attendees.length}</span>
            </div>
            
            <p class="font-bold text-xs sm:text-sm text-center text-slate-800 dark:text-slate-100 w-full truncate mb-1">
                ${ev.name}
            </p>
            <p class="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                ${dateStr} <span class="opacity-50 mx-1">|</span> ${pct}%
            </p>
        </div>`;
}

/** Load and render service events — works for both home section and eventsPage */
export async function renderServiceEvents(targetContainerId = null) {
    // Home section
    const section = document.getElementById('serviceEventsSection');
    const homeContainer = document.getElementById('serviceEventsContainer');
    // Events dedicated page
    const pageContainer = document.getElementById('eventsPageContainer');
    const eventsPageLink = document.getElementById('eventsPageLink');

    // Hide show events page link based on mode
    if (AppState.isGeneralSecretaryMode) {
        section?.classList.add('hidden-view');
        eventsPageLink?.classList.add('hidden-view');
        return;
    }

    section?.classList.remove('hidden-view');
    eventsPageLink?.classList.remove('hidden-view');

    let events = [];
    try {
        await authReady;
        if (!AppState.isLocalMode) {
            const snap = await getDocs(collection(AppState.db, 'services', AppState.currentServiceName, 'events'));
            events = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        } else {
            events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
        }
        events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (e) {
        console.error('renderServiceEvents fetch:', e);
    }

    const total = AppState.servantsCache?.length || 0;
    const emptyHtml = `
        <div class="col-span-full text-center py-16">
            <div class="w-20 h-20 bg-violet-50 dark:bg-violet-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-star text-3xl text-violet-300 dark:text-violet-600"></i>
            </div>
            <p class="font-black text-slate-400 text-base">لا توجد أحداث حتى الآن</p>
            <p class="text-xs text-slate-400 mt-1 opacity-60">اضغط "إنشاء حدث جديد" لإضافة رحلة أو يوم روحي</p>
        </div>`;

    const cardsHtml = events.length ? events.map(ev => buildEventCard(ev, total)).join('') : emptyHtml;

    if (homeContainer) homeContainer.innerHTML = cardsHtml;
    if (pageContainer) pageContainer.innerHTML = cardsHtml;
}

/** Open the create/edit event modal */
export async function openCreateEventModal(eventId = null) {
    const modal = document.getElementById('createServiceEventModal');
    if (!modal) return;

    const form = document.getElementById('createServiceEventForm');
    const preview = document.getElementById('newEventImagePreview');
    const dateInput = document.getElementById('newEventDate');
    const titleText = document.getElementById('eventModalTitleText');
    const editIdInput = document.getElementById('editEventId');

    if (form) form.reset();
    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    if (eventId) {
        if (titleText) titleText.textContent = 'تعديل الحدث';
        if (editIdInput) editIdInput.value = eventId;

        // Fetch event data
        let evData = null;
        try {
            if (!AppState.isLocalMode) {
                const snap = await getDocs(collection(AppState.db, 'services', AppState.currentServiceName, 'events'));
                evData = snap.docs.find(d => d.id === eventId)?.data();
            } else {
                const events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
                evData = events.find(e => e.id === eventId);
            }
        } catch (e) { console.error(e); }

        if (evData) {
            document.getElementById('newEventName').value = evData.name || '';
            document.getElementById('newEventDate').value = evData.date || '';
            document.getElementById('newEventType').value = evData.type || 'أخرى';
            document.getElementById('newEventDescription').value = evData.description || '';
            if (evData.imageData) {
                preview.src = evData.imageData;
                preview.classList.remove('hidden');
                // Store existing image data on the preview element so we know it has one
                preview.dataset.existingImage = evData.imageData;
            } else {
                delete preview.dataset.existingImage;
            }
        }
    } else {
        if (titleText) titleText.textContent = 'إنشاء حدث جديد';
        if (editIdInput) editIdInput.value = '';
        if (preview) delete preview.dataset.existingImage;
    }

    modal.classList.remove('hidden-view');
    modal.classList.add('flex');
}

window.__editServiceEvent = function (eventId) {
    openCreateEventModal(eventId);
}

/** Save new/edited event to Firebase */
export async function saveNewServiceEvent() {
    const name = document.getElementById('newEventName')?.value?.trim();
    const date = document.getElementById('newEventDate')?.value;
    const type = document.getElementById('newEventType')?.value;
    const description = document.getElementById('newEventDescription')?.value?.trim();
    const imageFile = document.getElementById('newEventImage')?.files?.[0];

    if (!name || !date) { showMessage('يرجى ملء اسم الحدث والتاريخ', true); return; }

    showLoading(true);
    try {
        // Convert image to base64 if provided
        let imageData = null;
        if (imageFile) {
            imageData = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(imageFile);
            });
        }

        const editEventId = document.getElementById('editEventId')?.value;
        const preview = document.getElementById('newEventImagePreview');

        // If no new file is uploaded but we have an existing image, keep it
        if (!imageFile && preview && preview.dataset.existingImage) {
            imageData = preview.dataset.existingImage;
        }

        if (editEventId) {
            // Update existing
            if (!AppState.isLocalMode) {
                const { doc: fsDoc, updateDoc: fsUpdateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
                const ref = fsDoc(AppState.db, 'services', AppState.currentServiceName, 'events', editEventId);
                const updates = { name, date, type: type || 'أخرى', description: description || '' };
                if (imageData !== null) updates.imageData = imageData;
                await fsUpdateDoc(ref, updates);
            } else {
                const events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
                const idx = events.findIndex(e => e.id === editEventId);
                if (idx !== -1) {
                    events[idx] = { ...events[idx], name, date, type: type || 'أخرى', description: description || '' };
                    if (imageData !== null) events[idx].imageData = imageData;
                    localStorage.setItem(`events-${AppState.currentServiceName}`, JSON.stringify(events));
                }
            }
            showMessage(`تم تعديل الحدث "${name}" بنجاح ✓`);
        } else {
            const eventData = {
                name, date, type: type || 'أخرى', description: description || '',
                imageData, attendees: [], createdAt: new Date().toISOString(),
                serviceName: AppState.currentServiceName
            };

            let newId = '';
            if (!AppState.isLocalMode) {
                const docRef = await addDoc(collection(AppState.db, 'services', AppState.currentServiceName, 'events'), eventData);
                newId = docRef.id;
            } else {
                newId = `local-${Date.now()}`;
                const events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
                events.push({ ...eventData, id: newId });
                localStorage.setItem(`events-${AppState.currentServiceName}`, JSON.stringify(events));
            }
            showMessage(`تم إنشاء حدث "${name}" بنجاح ✓`);

            // Immediately populate the activity repot so the new event is included
            await populateReportActivitySelector();
            // Automatically select the new event in the Activities Report filter
            if (document.getElementById('reportActivitySelector')) {
                document.getElementById('reportActivitySelector').value = `event_${newId}`;
            }
        }

        // Close modal and refresh
        const modal = document.getElementById('createServiceEventModal');
        if (modal) { modal.classList.add('hidden-view'); modal.classList.remove('flex'); }
        await renderServiceEvents();
    } catch (e) {
        console.error('saveNewServiceEvent:', e);
        showMessage('فشل في حفظ الحدث', true);
    } finally {
        showLoading(false);
    }
}

/** Open the event attendance modal */
export async function openEventAttendanceModal(eventId, eventName, eventType) {
    _currentEventId = eventId;
    const modal = document.getElementById('serviceEventAttendanceModal');
    const titleEl = document.getElementById('eventAttendanceModalTitle');
    const bodyEl = document.getElementById('eventAttendanceModalBody');
    if (!modal || !bodyEl) return;

    const c = EVENT_COLOR_MAP[eventType] || EVENT_COLOR_MAP['أخرى'];
    if (titleEl) titleEl.innerHTML = `<i class="fas fa-clipboard-list text-violet-500"></i> ${c.icon} ${eventName}`;

    // Load event data to get existing attendees
    let currentAttendees = [];
    try {
        if (!AppState.isLocalMode) {
            const evDoc = await import('./firebase.js').then(m => m.getDoc(import('./firebase.js').then(f => f.doc(AppState.db, 'services', AppState.currentServiceName, 'events', eventId))));
            // Simplified: fetch from rendered data
        }
    } catch (_) { }

    // Get attendees from DOM data (rendered cards stored data)
    try {
        const snap = await getDocs(collection(AppState.db, 'services', AppState.currentServiceName, 'events'));
        const evData = snap.docs.find(d => d.id === eventId)?.data();
        currentAttendees = evData?.attendees || [];
    } catch (_) {
        const events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
        currentAttendees = events.find(e => e.id === eventId)?.attendees || [];
    }

    const servants = AppState.servantsCache || [];
    if (!servants.length) {
        bodyEl.innerHTML = `<p class="text-center text-slate-400 p-8">لا يوجد خدام لعرضهم.</p>`;
    } else {
        bodyEl.innerHTML = servants.map(s => {
            const checked = currentAttendees.includes(s.id);
            return `
                <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all
                       ${checked ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800' : 'bg-slate-50 dark:bg-slate-800/80 border border-transparent hover:border-slate-200 dark:hover:border-slate-600'}">
                    <input type="checkbox" value="${s.id}" ${checked ? 'checked' : ''}
                           class="event-attendee-check w-4 h-4 text-violet-600 rounded border-slate-300 dark:border-slate-600 cursor-pointer"
                           onchange="this.closest('label').className = this.checked
                               ? 'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800'
                               : 'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all bg-slate-50 dark:bg-slate-800/80 border border-transparent hover:border-slate-200 dark:hover:border-slate-600'">
                    <div class="flex-1">
                        <p class="font-bold text-slate-800 dark:text-slate-100 text-sm">${s.name}</p>
                        ${s.chapter ? `<p class="text-xs text-slate-400">${s.chapter}</p>` : ''}
                    </div>
                    <i class="fas fa-check text-violet-500 text-xs ${checked ? '' : 'opacity-0'} transition-opacity"></i>
                </label>`;
        }).join('');
    }

    modal.classList.remove('hidden-view');
    modal.classList.add('flex');
}

/** Save event attendance */
export async function saveEventAttendance() {
    if (!_currentEventId) return;

    const checked = [...document.querySelectorAll('.event-attendee-check:checked')].map(cb => cb.value);

    showLoading(true);
    try {
        if (!AppState.isLocalMode) {
            const { doc: fsDoc, updateDoc: fsUpdateDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            const ref = fsDoc(AppState.db, 'services', AppState.currentServiceName, 'events', _currentEventId);
            await fsUpdateDoc(ref, { attendees: checked });
        } else {
            const events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
            const idx = events.findIndex(e => e.id === _currentEventId);
            if (idx !== -1) { events[idx].attendees = checked; localStorage.setItem(`events-${AppState.currentServiceName}`, JSON.stringify(events)); }
        }

        const modal = document.getElementById('serviceEventAttendanceModal');
        if (modal) { modal.classList.add('hidden-view'); modal.classList.remove('flex'); }
        showMessage(`تم حفظ حضور ${checked.length} خادم ✓`);
        await renderServiceEvents();
    } catch (e) {
        console.error('saveEventAttendance:', e);
        showMessage('فشل في حفظ الحضور', true);
    } finally {
        showLoading(false);
    }
}

// Expose globally for inline onclick
window.__openEventAttendance = openEventAttendanceModal;
window.__deleteServiceEvent = async function (eventId) {
    if (!confirm('هل تريد حذف هذا الحدث؟')) return;
    showLoading(true);
    try {
        if (!AppState.isLocalMode) {
            const { doc: fsDoc, deleteDoc: fsDeleteDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            await fsDeleteDoc(fsDoc(AppState.db, 'services', AppState.currentServiceName, 'events', eventId));
        } else {
            const events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
            localStorage.setItem(`events-${AppState.currentServiceName}`, JSON.stringify(events.filter(e => e.id !== eventId)));
        }
        showMessage('تم حذف الحدث');
        await renderServiceEvents();
    } catch (e) {
        console.error(e);
        showMessage('فشل في حذف الحدث', true);
    } finally { showLoading(false); }
};
