// ==================================================================
// ui.js - UI Utilities (Modals, Messages, Loading, Theme)
// ==================================================================

import { AppState } from './state.js';

// ─── DOM Cache ────────────────────────────────────────────────────
export const DOM = {};

export function initDOM() {
    const ids = [
        'loadingOverlay','loginOrServicesView','mainDashboard','servicesGrid',
        'sidebar','sidebarOverlay','sidebarLinks','mobilePageTitle','hamburgerBtn',
        // Pages
        'homePage','servantsPage','attendancePage','reportsPage',
        'calendarPage','correspondencePage','correspondenceCenterPage',
        'followUpPage','serviceAnnouncementsPage','announcementsBoardPage',
        // Sidebar links
        'correspondenceLink','followUpLink','attendancePageLink','correspondenceCenterLink',
        'serviceAnnouncementsLink','announcementsBoardLink','comparisonReportTab','calendarPageLink',
        // Servants Page
        'servantsTableBody','serviceColumnHeader','serviceFilterGroup','servantServiceFilter','birthdayAlertsContainer','servantsViewToggle',
        'searchInput','addManualBtn','importExcelBtn','exportServantsExcelBtn',
        'manualEntryModal','manualEntryModalTitle','manualEntryForm',
        'servantId','servantName','servantMobile','servantDob','servantNationalId',
        'servantChapter','servantCurrentService','servantJob','servantAddress','servantQualification',
        'servantConfessionFather','servantImageFile','imagePreview',
        // Attendance Page
        'yearSelector','monthSelector','fridaysGrid','activityButtons',
        'attendanceListContainer','attendanceListTitle','noActivitySection',
        'noActivityCheck','isSpecialCheck','specialReasonInput',
        'servantsChecklist','saveActivityAttendanceBtn',
        // Reports Page
        'reportTabs','standardReportsContainer','comparisonReportContainer',
        'periodComparisonReportContainer','reportFilters','reportOutput','reportContent',
        'reportStartDate','reportEndDate','reportServantSelector','reportServiceSelector',
        'reportActivitySelector','servantSelectorContainer','activitySelectorContainer',
        'serviceFilterContainer','generateReportBtn','exportPngBtn','exportPdfBtn',
        'generateComparisonBtn','comparisonChart','comparisonServiceSelector1',
        'comparisonServiceSelector2','periodsContainer','addPeriodBtn',
        'generatePeriodComparisonBtn','periodReportOutput','periodReportServantSelector',
        // Calendar Page
        'calendarContent','calendarYearSelector','calendarMonthSelector',
        'calendarServiceFilterContainer','calendarServiceSelector',
        'calendarEventModal','eventModalDate','calendarEventForm','eventDate',
        'eventTypeSelector','eventDetailsInput','deleteEventBtn','saveEventBtn',
        // Home Page elements
        'serviceDashboardContainer','adminDashboardContainer',
        'totalServantsStat','upcomingBirthdayStat','lastFridayAbsenceStat',
        'lastFridayAbsenceCount','lastFridayStatusContainer',
        'absenceFollowUpResults','absenceFilterYearSelector',
        'monthFilterBtn','monthFilterBtnText','monthFilterDropdown','activityFilterButtons',
        'homeAttendanceChart','kpiContainer','adminServantsTableBody','adminAttendanceChart',
        'adminSearchInput','quickAddServant','quickGoToAttendance','backupBtn','restoreBtn',
        'backupRestoreSection','generateFollowUpBtn',
        // Announcements Board
        'announcementTarget','newAnnouncementInput','addAnnouncementBtn','adminAnnouncementsList',
        // Correspondence
        'incomingNotesContainer','noteToAdminInput','sendNoteToAdminBtn','sentNotesHistory',
        // Follow-up
        'attendanceFollowUpPanel','followUpPanel','birthdaysPanel',
        'followUpSearchInput','clearSearchBtn',
        // Service Announcements
        'bulletinBoard','bulletinBoardTitle','loadMoreAnnouncementsBtn','loadMoreAnnouncementsContainer',
        // Aggregated Events Modal
        'aggregatedEventsModal','aggregatedEventsModalTitle','aggregatedEventsModalBody',
        // Modals
        'confirmModal','passwordModal','servicePasswordInput','passwordModalServiceName',
        'serviceChoiceModal','serviceChoiceModalTitle','serviceChoiceModalBody',
        'importModal','importForm','excelFile',
        'unifiedProfileModal','unifiedProfileModalTitle','unifiedProfileModalBody',
        'activityAttendeesModal','activityAttendeesModalTitle','activityAttendeesModalBody',
        // Settings
        'settingsModal','geminiApiKeyInput',
        // AI Greeting Modal
        'aiGreetingModal','aiGreetingModalBody','aiGreetingActions','copyGreetingBtn','whatsappGreetingBtn',
        // Sidebar UI
        'sidebarServiceName','backToServices','logoutBtn','theme-checkbox',
        // iFrame
        'iframeView','iframeTitle','iframeLoading','externalAppFrame','backFromIframeBtn',
        // Notification badges
        'correspondenceBadge','serviceAnnouncementsBadge','correspondenceCenterBadge',
    ];

    ids.forEach(id => { DOM[id] = document.getElementById(id); });
}

// ─── Loading Overlay ───────────────────────────────────────────────
export function showLoading(isLoading) {
    if (!DOM.loadingOverlay) return;
    DOM.loadingOverlay.classList.toggle('flex', isLoading);
    DOM.loadingOverlay.classList.toggle('hidden-view', !isLoading);
}

// ─── Toast Messages ────────────────────────────────────────────────
export function showMessage(message, isError = false) {
    // Remove existing toasts
    document.querySelectorAll('.toast-msg').forEach(t => t.remove());

    const div = document.createElement('div');
    div.className = `toast-msg fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl z-[100] font-bold text-white text-sm transition-all duration-300 ${isError ? 'bg-red-500' : 'bg-teal-600'}`;
    div.innerHTML = `<i class="fas ${isError ? 'fa-circle-xmark' : 'fa-circle-check'} mr-2"></i>${message}`;
    document.body.appendChild(div);

    setTimeout(() => {
        div.classList.add('opacity-0', '-translate-y-4');
        setTimeout(() => div.remove(), 300);
    }, 3500);
}

// ─── Confirm Dialog ────────────────────────────────────────────────
export function showConfirm(title, body, onConfirm) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').innerHTML = body;
    openModal(DOM.confirmModal);

    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    const cancelBtn  = document.getElementById('confirmModalCancelBtn');

    const fresh = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(fresh, confirmBtn);

    fresh.addEventListener('click', () => { onConfirm(); closeModal(DOM.confirmModal); }, { once: true });
    cancelBtn.addEventListener('click', () => closeModal(DOM.confirmModal), { once: true });
}

// ─── Modal Helpers ─────────────────────────────────────────────────
export function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden-view');
    modal.classList.add('flex');

    // Special handling
    if (modal.id === 'settingsModal') {
        const k = AppState.geminiApiKey || localStorage.getItem('geminiApiKey') || '';
        if (DOM.geminiApiKeyInput) DOM.geminiApiKeyInput.value = k;
    }
}

export function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden-view');
    modal.classList.remove('flex');
}

export function initCloseButtons() {
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('[id$="Modal"]') || btn.closest('[id$="modal"]');
            if (modal) closeModal(modal);
        });
    });
}

// ─── Theme Management ──────────────────────────────────────────────
export function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        if (DOM['theme-checkbox']) DOM['theme-checkbox'].checked = true;
    } else {
        document.documentElement.classList.remove('dark');
        if (DOM['theme-checkbox']) DOM['theme-checkbox'].checked = false;
    }
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    // Save per-service key if logged in, also save global key for the login screen
    if (AppState.currentServiceName) {
        localStorage.setItem(`theme-${AppState.currentServiceName}`, newTheme);
    }
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

export function applyServiceTheme() {
    const saved = localStorage.getItem(`theme-${AppState.currentServiceName}`);
    const osPref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || osPref);
}

// ─── Page Switching ────────────────────────────────────────────────
export function switchPage(pageId) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden-view'));
    const page = document.getElementById(pageId);
    if (page) page.classList.remove('hidden-view');

    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const activeLink = DOM.sidebarLinks?.querySelector(`.sidebar-link[data-page="${pageId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
        const titleEl = activeLink.querySelector('span') || activeLink;
        if (DOM.mobilePageTitle) DOM.mobilePageTitle.textContent = titleEl.textContent.trim();
    }

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
        DOM.sidebar?.classList.add('translate-x-full');
        DOM.sidebarOverlay?.classList.add('hidden');
    }

    return pageId;
}


// ─── Notification Badge ────────────────────────────────────────────
export function updateBadge(el, count) {
    if (!el) return;
    if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.classList.remove('hidden-view');
    } else {
        el.classList.add('hidden-view');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────
export function getPercentageColor(p) {
    if (p >= 80) return 'bg-green-500';
    if (p >= 60) return 'bg-yellow-400';
    if (p >= 40) return 'bg-orange-400';
    return 'bg-red-500';
}
export function getPercentageBGColor(p) {
    if (p >= 80) return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
    if (p >= 60) return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
    if (p >= 40) return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200';
    return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
}
export function getPercentageTextColor(p) {
    if (p >= 80) return 'text-green-600 dark:text-green-400';
    if (p >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (p >= 40) return 'text-orange-500 dark:text-orange-400';
    return 'text-red-500 dark:text-red-400';
}

export function formatDateAr(dateStr) {
    if (!dateStr) return 'غير محدد';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('ar-EG', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

export function getUpcomingBirthdays(servants, daysAhead = 30) {
    const today = new Date();
    today.setHours(0,0,0,0);
    return servants
        .filter(s => s.dob && typeof s.dob === 'string')
        .map(s => {
            const parts = s.dob.split('-');
            if (parts.length !== 3) return null;
            const [y, m, d] = parts.map(Number);
            if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
            let next = new Date(today.getFullYear(), m-1, d);
            if (next < today) next.setFullYear(today.getFullYear() + 1);
            const diff = Math.round((next - today) / 86400000);
            return { ...s, daysUntil: diff, date: `${d}/${m}` };
        })
        .filter(s => s !== null && s.daysUntil <= daysAhead)
        .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function getSafeSrc(url) {
    return url && url.startsWith('data:') ? url :
           (url && url.startsWith('http') ? url :
           'https://placehold.co/60x60/E2E8F0/4A5568?text=?');
}
