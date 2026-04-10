// ==================================================================
// app.js - Main Application Entry Point & Event Binding
// ==================================================================

import { AppState } from './state.js';
import { SERVICES, ACTIVITIES, MONTHS_AR } from './config.js';
import { initFirebase } from './firebase.js';
import {
    DOM, initDOM, showLoading, showMessage, openModal, closeModal,
    initCloseButtons, toggleTheme, switchPage, applyTheme
} from './ui.js';
import { handlePasswordSubmit, handleServiceCardClick, logout, openSettings, handleSettingsPasswordSubmit } from './auth.js';
import { handleSettingsSave } from './ai.js';
import {
    loadServants, openAddModal, openEditModal, handleServantFormSubmit,
    handleImageSelect, exportServantsToExcel,
    showServantProfile, deleteServant, renderServantsTable
} from './servants.js';
import {
    loadAttendancePage, loadAttendanceForYear, populateMonths,
    populateFridaysGrid, renderActivityButtons, renderServantChecklist,
    saveActivityAttendance, setupAttendanceUIListeners
} from './attendance.js';
import {
    loadReportsPage, switchReportTab, generateReport, addPeriodRow,
    generatePeriodComparisonReport, exportToPDF, exportToPNG,
    populateReportServantSelector
} from './reports.js';
import {
    loadCalendarPage, renderCalendar, saveCalendarEvent,
    deleteCalendarEvent, listenForCalendarEvents
} from './calendar.js';
import {
    sendNoteToAdmin, markNotesAsRead, sendAnnouncement,
    markServiceAnnouncementsAsRead, loadMoreAnnouncements,
    populateAnnouncementTargetSelector, updateServiceCardBadges
} from './announcements.js';
import {
    showDashboard, loadHomePage, generateFollowUpReport, renderFollowUpResults,
    backupData, restoreData, renderAdminServantsTable, renderActivityRegistrationGrid,
    renderServiceEvents, openCreateEventModal, openEventAttendanceModal
} from './dashboard.js';
import { generateBirthdayGreeting, renderMarkdown, copyText, shareWhatsapp } from './ai.js';

// Make deleteServant available globally for event delegation
window.__servants = { deleteServant };

// Expose showServantProfile globally for inline onclick in dynamic HTML
window.showServantProfile = showServantProfile;

// ─── Color map for service cards (replaces dynamic Tailwind classes) ─
const COLOR_MAP = {
    teal: { bg: '#f0fdfa', border: '#5eead4', icon: '#0d9488', dark: { bg: '#042f2e', border: '#0d9488' } },
    lime: { bg: '#f7fee7', border: '#bef264', icon: '#65a30d', dark: { bg: '#1a2e05', border: '#65a30d' } },
    green: { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', dark: { bg: '#052e16', border: '#16a34a' } },
    yellow: { bg: '#fefce8', border: '#fde047', icon: '#ca8a04', dark: { bg: '#2d1f00', border: '#ca8a04' } },
    pink: { bg: '#fdf2f8', border: '#f9a8d4', icon: '#db2777', dark: { bg: '#2d0a1e', border: '#db2777' } },
    indigo: { bg: '#eef2ff', border: '#a5b4fc', icon: '#4f46e5', dark: { bg: '#1e1b4b', border: '#4f46e5' } },
    red: { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', dark: { bg: '#2d0707', border: '#dc2626' } },
    purple: { bg: '#faf5ff', border: '#d8b4fe', icon: '#9333ea', dark: { bg: '#1a0838', border: '#9333ea' } },
    cyan: { bg: '#ecfeff', border: '#67e8f9', icon: '#0891b2', dark: { bg: '#042830', border: '#0891b2' } },
    orange: { bg: '#fff7ed', border: '#fdba74', icon: '#ea580c', dark: { bg: '#2d1200', border: '#ea580c' } },
    blue: { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', dark: { bg: '#0c1a3d', border: '#2563eb' } },
};

// ─── AI Global Helpers ────────────────────────────────────────────
window.generateAndShowAIGreeting = async function (name) {
    if (!DOM.aiGreetingModal) return;

    // Open modal and show loading
    openModal(DOM.aiGreetingModal);
    DOM.aiGreetingModalBody.innerHTML = `
        <div class="text-center p-8">
            <i class="fas fa-spinner fa-spin text-teal-500 text-3xl mb-4"></i>
            <p class="text-slate-500 font-bold">جاري كتابة تهنئة روحية لـ ${name}...</p>
        </div>`;
    DOM.aiGreetingActions.classList.add('hidden-view');

    try {
        const text = await generateBirthdayGreeting(name);
        const html = renderMarkdown(text);

        DOM.aiGreetingModalBody.innerHTML = `
            <div id="aiGreetingTextContent" class="text-right whitespace-pre-wrap w-full p-2 leading-relaxed text-slate-700 dark:text-slate-200">
                ${html}
            </div>`;

        DOM.aiGreetingActions.classList.remove('hidden-view');

        // Setup buttons
        DOM.copyGreetingBtn.onclick = () => {
            const content = document.getElementById('aiGreetingTextContent').innerText;
            copyText(content);
        };

        DOM.whatsappGreetingBtn.onclick = () => {
            const content = document.getElementById('aiGreetingTextContent').innerText;
            shareWhatsapp(content);
        };

    } catch (e) {
        DOM.aiGreetingModalBody.innerHTML = `
            <div class="text-center p-8">
                <i class="fas fa-exclamation-circle text-red-500 text-3xl mb-4"></i>
                <p class="text-red-600 font-bold">${e.message}</p>
                <p class="text-xs text-slate-500 mt-2">تأكد من إعداد مفتاح API في الإعدادات</p>
            </div>`;
    }
};

// ─── Bootstrap ────────────────────────────────────────────────────
async function bootstrap() {
    initDOM();
    setupAttendanceUIListeners();
    await initFirebase();
    initCloseButtons();
    renderServicesGrid();
    bindGlobalEvents();
    await updateServiceCardBadges();
    showLoading(false);
}

// ─── Service Selection Grid ────────────────────────────────────────
function renderServicesGrid() {
    const grid = DOM.servicesGrid;
    if (!grid) return;

    grid.innerHTML = SERVICES.map(svc => {
        const c = COLOR_MAP[svc.color] || COLOR_MAP.teal;
        const badgeId = `service-badge-${svc.name.replace(/\s+/g, '-')}`;
        
        return `
        <div class="service-card group relative flex flex-col items-center justify-center p-5 md:p-6 rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-[1.03] active:scale-[0.98]"
             data-service="${svc.name}"
             style="background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(148, 163, 184, 0.12); box-shadow: 0 4px 24px -4px rgba(0,0,0,0.3);">
             
            <!-- Hover glow effect -->
            <div class="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                 style="background: radial-gradient(circle at 50% 50%, ${c.icon}15, transparent 70%); box-shadow: 0 8px 40px -8px ${c.icon}30;"></div>
            
            <!-- Top accent line -->
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[2px] rounded-full opacity-60 group-hover:w-20 group-hover:opacity-100 transition-all duration-500"
                 style="background: linear-gradient(90deg, transparent, ${c.icon}, transparent);"></div>

            <div class="relative w-14 h-14 md:w-16 md:h-16 flex items-center justify-center rounded-2xl mb-3 transition-all duration-300 group-hover:shadow-lg"
                 style="background: linear-gradient(135deg, ${c.icon}18, ${c.icon}08); border: 1px solid ${c.icon}30; box-shadow: 0 0 0 0 ${c.icon}00;">
                <i class="fas ${svc.icon} text-xl md:text-2xl transition-transform duration-300 group-hover:scale-110" style="color: ${c.icon};"></i>
                <span id="${badgeId}" class="hidden-view absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center shadow-lg border-2 border-slate-800 animate-pulse">0</span>
            </div>
            
            <p class="relative font-bold text-xs md:text-sm text-center text-slate-200 group-hover:text-white transition-colors duration-300 leading-tight">
                ${svc.name}
            </p>
        </div>`;
    }).join('');

    // Bind clicks
    grid.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('click', () => handleServiceCardClick(card.dataset.service));
    });
}

// ─── Global Event Bindings ─────────────────────────────────────────
function bindGlobalEvents() {

    // ── Auth / Navigation ──────────────────────────────────────────
    document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordSubmit);
    DOM.backToServices?.addEventListener('click', logout);
    DOM['theme-checkbox']?.addEventListener('change', toggleTheme);
    document.getElementById('openSettingsBtn')?.addEventListener('click', openSettings);
    document.getElementById('settingsForm')?.addEventListener('submit', handleSettingsSave);

    // ── Settings Password Modal ────────────────────────────────────
    document.getElementById('settingsPasswordForm')?.addEventListener('submit', handleSettingsPasswordSubmit);
    document.getElementById('toggleSettingsPwdVisibility')?.addEventListener('click', () => {
        const input = document.getElementById('settingsPasswordInput');
        const icon = document.querySelector('#toggleSettingsPwdVisibility i');
        if (!input || !icon) return;
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash text-sm';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye text-sm';
        }
    });
    // Allow Enter key in settings password input
    document.getElementById('settingsPasswordInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSettingsPasswordSubmit(e);
    });

    // ── Sidebar ────────────────────────────────────────────────────
    DOM.hamburgerBtn?.addEventListener('click', () => {
        DOM.sidebar?.classList.toggle('open');
        DOM.sidebarOverlay?.classList.toggle('hidden');
    });
    DOM.sidebarOverlay?.addEventListener('click', () => {
        DOM.sidebar?.classList.remove('open');
        DOM.sidebarOverlay?.classList.add('hidden');
    });

    // ── Page Navigation (sidebar links) ────────────────────────────
    DOM.sidebarLinks?.addEventListener('click', async e => {
        const link = e.target.closest('.sidebar-link');
        if (!link) return;
        const page = link.dataset.page;
        if (!page) return;
        e.preventDefault();

        // Close sidebar on mobile
        DOM.sidebar?.classList.remove('open');
        DOM.sidebarOverlay?.classList.add('hidden');

        switchPage(page);
        await navigateTo(page);
    });

    // ── Servants Page ──────────────────────────────────────────────
    DOM.addManualBtn?.addEventListener('click', openAddModal);
    DOM.importExcelBtn?.addEventListener('click', () => openModal(DOM.importModal));
    DOM.exportServantsExcelBtn?.addEventListener('click', exportServantsToExcel);
    DOM.manualEntryForm?.addEventListener('submit', handleServantFormSubmit);
    DOM.servantImageFile?.addEventListener('change', handleImageSelect);

    // --- New Excel Import Events ---
    document.getElementById('excelFile')?.addEventListener('change', function() {
        const btn = document.getElementById('importPreviewBtn');
        if (btn) btn.disabled = !this.files.length;
    });

    document.getElementById('importPreviewBtn')?.addEventListener('click', async () => {
        const { processExcelPreview } = await import('./servants.js');
        await processExcelPreview();
    });

    document.getElementById('confirmImportBtn')?.addEventListener('click', async () => {
        const { commitExcelImport } = await import('./servants.js');
        await commitExcelImport();
    });

    document.getElementById('backToImportUploadBtn')?.addEventListener('click', () => {
        document.getElementById('importStep1').classList.remove('hidden-view');
        document.getElementById('importStep2').classList.add('hidden-view');
        document.getElementById('excelFile').value = '';
        document.getElementById('importPreviewBtn').disabled = true;
    });

    // ── Events ──────────────────────────────────────────────
    document.getElementById('createNewEventBtn')?.addEventListener('click', () => openCreateEventModal());
    document.getElementById('eventsPageCreateBtn')?.addEventListener('click', () => openCreateEventModal());
    document.getElementById('createServiceEventForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveNewServiceEvent();
    });

    DOM.searchInput?.addEventListener('input', () => {
        renderServantsTable();
    });

    // --- Follow-up View Toggle ---
    DOM.followUpGridViewBtn?.addEventListener('click', () => {
        AppState.followUpViewMode = 'grid';
        renderFollowUpResults();
    });

    DOM.followUpTableViewBtn?.addEventListener('click', () => {
        AppState.followUpViewMode = 'table';
        renderFollowUpResults();
    });

    DOM.servantServiceFilter?.addEventListener('change', () => {
        renderServantsTable();
    });

    DOM.adminSearchInput?.addEventListener('input', e => {
        const normalizeArabic = (text) => text ? text.replace(/[أإآا]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي').replace(/[ؤئ]/g, 'ء') : '';
        const q = normalizeArabic(e.target.value.trim().toLowerCase());
        const filtered = AppState.allServantsCache.filter(s =>
            normalizeArabic((s.name || '').toLowerCase()).includes(q) ||
            normalizeArabic((s.serviceName || '').toLowerCase()).includes(q) ||
            (s.mobile || '').includes(q) ||
            (s.nationalId || '').includes(q)
        );
        renderAdminServantsTable(filtered);
    });

    // Delegate clicks on servant table (edit / delete / profile link)
    DOM.servantsTableBody?.addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (editBtn) openEditModal(editBtn.dataset.id);
        if (deleteBtn) deleteServant(deleteBtn.dataset.id);
    });

    DOM.servantsViewToggle?.addEventListener('click', () => {
        AppState.servantsViewMode = AppState.servantsViewMode === 'grid' ? 'table' : 'grid';
        // Persist the GS choice
        if (AppState.isGeneralSecretaryMode) {
            localStorage.setItem('gs-servants-view', AppState.servantsViewMode);
        }
        const icon = DOM.servantsViewToggle.querySelector('i');
        if (icon) {
            icon.className = AppState.servantsViewMode === 'grid' ? 'fas fa-th-large' : 'fas fa-list';
        }
        renderServantsTable();
    });

    // ── Attendance Page ────────────────────────────────────────────
    DOM.yearSelector?.addEventListener('change', async function () {
        showLoading(true);
        await loadAttendanceForYear(this.value);
        showLoading(false);
        populateMonths(this.value);
        if (DOM.monthSelector) DOM.monthSelector.value = '';
        if (DOM.fridaysGrid) DOM.fridaysGrid.innerHTML = '';
        DOM.activityButtons?.classList.add('hidden-view');
        DOM.attendanceListContainer?.classList.add('hidden-view');
    });

    DOM.monthSelector?.addEventListener('change', function () {
        if (this.value === '') return;
        AppState.selectedFriday = '';
        AppState.currentActivity = '';
        DOM.activityButtons?.classList.add('hidden-view');
        DOM.attendanceListContainer?.classList.add('hidden-view');
        populateFridaysGrid(parseInt(DOM.yearSelector.value), parseInt(this.value));
    });

    DOM.fridaysGrid?.addEventListener('click', e => {
        const btn = e.target.closest('.friday-btn');
        if (!btn) return;
        document.querySelectorAll('.friday-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AppState.selectedFriday = btn.dataset.date;
        renderActivityButtons(btn.dataset.date);
        DOM.attendanceListContainer?.classList.add('hidden-view');
    });

    DOM.activityButtons?.addEventListener('click', e => {
        const btn = e.target.closest('.activity-btn');
        if (!btn) return;
        renderServantChecklist(btn.dataset.activity, AppState.selectedFriday);
    });

    DOM.noActivityCheck?.addEventListener('change', function () {
        DOM.noActivityReason?.classList.toggle('hidden', !this.checked);
        DOM.servantsChecklist?.classList.toggle('hidden', this.checked);
    });

    DOM.saveActivityAttendanceBtn?.addEventListener('click', saveActivityAttendance);

    // ── Reports Page ───────────────────────────────────────────────
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.addEventListener('click', () => switchReportTab(tab.dataset.reportType));
    });

    DOM.generateReportBtn?.addEventListener('click', generateReport);
    DOM.exportPdfBtn?.addEventListener('click', exportToPDF);
    DOM.exportPngBtn?.addEventListener('click', exportToPNG);

    DOM.addPeriodBtn?.addEventListener('click', () => addPeriodRow());
    DOM.generatePeriodComparisonBtn?.addEventListener('click', generatePeriodComparisonReport);

    DOM.reportServiceSelector?.addEventListener('change', () => {
        populateReportServantSelector();
    });

    // ── Calendar Page ──────────────────────────────────────────────
    DOM.calendarYearSelector?.addEventListener('change', renderCalendar);
    DOM.calendarMonthSelector?.addEventListener('change', renderCalendar);
    DOM.calendarServiceSelector?.addEventListener('change', listenForCalendarEvents);
    document.getElementById('calendarEventForm')?.addEventListener('submit', saveCalendarEvent);
    DOM.deleteEventBtn?.addEventListener('click', deleteCalendarEvent);

    // ── Correspondence ─────────────────────────────────────────────
    DOM.sendNoteToAdminBtn?.addEventListener('click', sendNoteToAdmin);
    DOM.noteToAdminInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNoteToAdmin(); }
    });
    DOM.correspondenceCenterLink?.addEventListener('click', () => setTimeout(markNotesAsRead, 500));

    // ── Announcements ──────────────────────────────────────────────
    DOM.serviceAnnouncementsLink?.addEventListener('click', () => setTimeout(markServiceAnnouncementsAsRead, 500));
    DOM.loadMoreAnnouncementsBtn?.addEventListener('click', loadMoreAnnouncements);
    DOM.addAnnouncementBtn?.addEventListener('click', sendAnnouncement);

    // ── Home Quick Buttons ─────────────────────────────────────────
    DOM.quickAddServant?.addEventListener('click', () => { switchPage('servantsPage'); openAddModal(); });
    DOM.quickGoToAttendance?.addEventListener('click', async () => {
        switchPage('attendancePage');
        showLoading(true);
        await loadAttendancePage();
        showLoading(false);
    });
    document.getElementById('quickGoToReports')?.addEventListener('click', async () => {
        switchPage('reportsPage');
        showLoading(true);
        await loadReportsPage();
        showLoading(false);
    });

    // ── Backup / Restore ───────────────────────────────────────────
    DOM.backupBtn?.addEventListener('click', backupData);
    DOM.restoreBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.addEventListener('change', restoreData);
        input.click();
    });

    // ── Service Events ─────────────────────────────────────────────
    document.getElementById('createNewEventBtn')?.addEventListener('click', openCreateEventModal);
    document.getElementById('createServiceEventForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { saveNewServiceEvent } = await import('./dashboard.js');
        await saveNewServiceEvent();
    });
    document.getElementById('saveEventAttendanceBtn')?.addEventListener('click', async () => {
        const { saveEventAttendance } = await import('./dashboard.js');
        await saveEventAttendance();
    });
    document.getElementById('newEventImage')?.addEventListener('change', function () {
        const preview = document.getElementById('newEventImagePreview');
        if (!preview) return;
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = e => { preview.src = e.target.result; preview.classList.remove('hidden'); };
            reader.readAsDataURL(this.files[0]);
        } else { preview.classList.add('hidden'); preview.src = ''; }
    });

    // ── Follow-up ──────────────────────────────────────────────────
    document.getElementById('generateFollowUpBtn')?.addEventListener('click', generateFollowUpReport);
    DOM.absenceFilterYearSelector?.addEventListener('change', async function () {
        AppState.absenceFilterSelectedYear = parseInt(this.value);
        showLoading(true);
        await loadAttendanceForYear(AppState.absenceFilterSelectedYear);
        showLoading(false);
        generateFollowUpReport();
    });

    document.getElementById('monthFilterBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.monthFilterDropdown?.classList.toggle('hidden-view');
    });

    DOM.monthFilterDropdown?.addEventListener('change', (e) => {
        const allCheckbox = document.getElementById('month-filter-all');
        const monthCheckboxes = DOM.monthFilterDropdown.querySelectorAll('.month-filter-checkbox');

        if (e.target.id === 'month-filter-all') {
            monthCheckboxes.forEach(cb => cb.checked = e.target.checked);
        } else if (e.target.classList.contains('month-filter-checkbox')) {
            if (allCheckbox) allCheckbox.checked = Array.from(monthCheckboxes).every(cb => cb.checked);
        }

        AppState.absenceFilterSelectedMonths.clear();
        DOM.monthFilterDropdown.querySelectorAll('.month-filter-checkbox:checked').forEach(cb => {
            AppState.absenceFilterSelectedMonths.add(parseInt(cb.value));
        });

        const count = AppState.absenceFilterSelectedMonths.size;
        if (DOM.monthFilterBtnText) {
            DOM.monthFilterBtnText.textContent = count > 0 ? `${count} شهور مختارة` : 'اختر الشهور';
        }

        generateFollowUpReport();
    });

    DOM.activityFilterButtons?.addEventListener('click', (e) => {
        const button = e.target.closest('.activity-filter-btn');
        if (button) {
            DOM.activityFilterButtons.querySelectorAll('.activity-filter-btn').forEach(btn => {
                btn.classList.remove('active', 'bg-white', 'dark:bg-slate-800', 'shadow-xl');
                btn.querySelector('.w-12')?.classList.remove('border-[var(--color-border)]');
                btn.querySelector('.w-12')?.classList.add('border-slate-100', 'dark:border-slate-700');
            });
            button.classList.add('active', 'bg-white', 'dark:bg-slate-800', 'shadow-xl');
            button.style.boxShadow = `0 10px 25px -5px ${button.style.getPropertyValue('--color-shadow')}`;
            button.querySelector('.w-12')?.classList.remove('border-slate-100', 'dark:border-slate-700');
            button.querySelector('.w-12')?.classList.add('border-[var(--color-border)]');

            AppState.absenceFilterSelectedActivity = button.dataset.activityKey;
            generateFollowUpReport();
        }
    });

    // ── Admin Dashboard: servant profile click ─────────────────────
    DOM.adminDashboardContainer?.addEventListener('click', e => {
        const profileLink = e.target.closest('.servant-profile-link');
        if (profileLink) { e.preventDefault(); showServantProfile(profileLink.dataset.id, profileLink.dataset.service); }
    });

    // ─── Follow-up: Quick Search Interactivity ──────────────────────
    DOM.followUpSearchInput?.addEventListener('input', (e) => {
        AppState.followUpSearchQuery = e.target.value;
        DOM.clearSearchBtn?.classList.toggle('hidden-view', !e.target.value);
        renderFollowUpResults();
    });

    DOM.clearSearchBtn?.addEventListener('click', () => {
        if (DOM.followUpSearchInput) DOM.followUpSearchInput.value = '';
        AppState.followUpSearchQuery = '';
        DOM.clearSearchBtn?.classList.add('hidden-view');
        renderFollowUpResults();
    });

    // ─── Follow-up: Quick Search Interactivity ──────────────────────
    DOM.followUpSearchInput?.addEventListener('input', (e) => {
        AppState.followUpSearchQuery = e.target.value;
        DOM.clearSearchBtn?.classList.toggle('hidden-view', !e.target.value);
        renderFollowUpResults();
    });

    DOM.clearSearchBtn?.addEventListener('click', () => {
        if (DOM.followUpSearchInput) DOM.followUpSearchInput.value = '';
        AppState.followUpSearchQuery = '';
        DOM.clearSearchBtn?.classList.add('hidden-view');
        renderFollowUpResults();
    });

    // ── Global: close month filter dropdown on outside click -------
    document.addEventListener('click', e => {
        if (!e.target.closest('#monthFilterBtn') && !e.target.closest('#monthFilterDropdown')) {
            DOM.monthFilterDropdown?.classList.add('hidden-view');
        }
        if (!e.target.closest('#serviceFilterFollowupBtn') && !e.target.closest('#serviceFilterFollowupDropdown')) {
            document.getElementById('serviceFilterFollowupDropdown')?.classList.add('hidden-view');
        }
    });

    // ── Follow-up: Month Multi-select logic ───────────────────────
    DOM.monthFilterDropdown?.addEventListener('change', (e) => {
        const target = e.target;
        if (target.id === 'month-filter-all') {
            const isChecked = target.checked;
            document.querySelectorAll('.month-filter-checkbox').forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) AppState.absenceFilterSelectedMonths.add(parseInt(cb.value));
                else AppState.absenceFilterSelectedMonths.delete(parseInt(cb.value));
            });
        } else if (target.classList.contains('month-filter-checkbox')) {
            const val = parseInt(target.value);
            if (target.checked) AppState.absenceFilterSelectedMonths.add(val);
            else AppState.absenceFilterSelectedMonths.delete(val);

            // Sync "Select All" state
            const allCb = document.getElementById('month-filter-all');
            if (allCb) {
                const total = document.querySelectorAll('.month-filter-checkbox').length;
                const checked = document.querySelectorAll('.month-filter-checkbox:checked').length;
                allCb.checked = (total === checked);
                allCb.indeterminate = (checked > 0 && checked < total);
            }
        }

        // Update Button Text
        const count = AppState.absenceFilterSelectedMonths.size;
        if (count === 0) DOM.monthFilterBtnText.textContent = 'اختر الشهور';
        else if (count === 12) DOM.monthFilterBtnText.textContent = 'كل الشهور';
        else DOM.monthFilterBtnText.textContent = `${count} شهور مختارة`;

        generateFollowUpReport();
    });

    // ── Follow-up: Service Filter logic ───────────────────────────
    document.getElementById('serviceFilterFollowupBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('serviceFilterFollowupDropdown')?.classList.toggle('hidden-view');
    });

    document.getElementById('serviceFilterFollowupDropdown')?.addEventListener('change', (e) => {
        const target = e.target;
        if (!AppState.absenceFilterSelectedServices) AppState.absenceFilterSelectedServices = new Set();
        
        if (target.id === 'service-f-filter-all') {
            const isChecked = target.checked;
            document.querySelectorAll('.service-f-filter-checkbox').forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) AppState.absenceFilterSelectedServices.add(cb.value);
                else AppState.absenceFilterSelectedServices.delete(cb.value);
            });
        } else if (target.classList.contains('service-f-filter-checkbox')) {
            const val = target.value;
            if (target.checked) AppState.absenceFilterSelectedServices.add(val);
            else AppState.absenceFilterSelectedServices.delete(val);
            
            const allCb = document.getElementById('service-f-filter-all');
            if (allCb) {
                const total = document.querySelectorAll('.service-f-filter-checkbox').length;
                const checked = document.querySelectorAll('.service-f-filter-checkbox:checked').length;
                allCb.checked = (total === checked);
                allCb.indeterminate = (checked > 0 && checked < total);
            }
        }
        
        const count = AppState.absenceFilterSelectedServices.size;
        const total = document.querySelectorAll('.service-f-filter-checkbox').length;
        const btnText = document.getElementById('serviceFilterFollowupBtnText');
        if (btnText) {
            if (count === 0) btnText.textContent = 'اختر الخدمات';
            else if (count === total) btnText.textContent = 'كل الخدمات';
            else btnText.textContent = `${count} خدمة محددة`;
        }
        
        generateFollowUpReport();
    });

    // ── Follow-up View Toggle logic ───────────────────────────────
    document.getElementById('followUpGridViewBtn')?.addEventListener('click', () => {
        AppState.followUpViewMode = 'grid';
        if (AppState.isGeneralSecretaryMode) localStorage.setItem('gs-followup-view', 'grid');
        if (AppState.followUpResultsCache && AppState.followUpResultsCache.length > 0) {
            import('./dashboard.js').then(m => m.renderFollowUpResults());
        }
    });

    document.getElementById('followUpTableViewBtn')?.addEventListener('click', () => {
        AppState.followUpViewMode = 'table';
        if (AppState.isGeneralSecretaryMode) localStorage.setItem('gs-followup-view', 'table');
        if (AppState.followUpResultsCache && AppState.followUpResultsCache.length > 0) {
            import('./dashboard.js').then(m => m.renderFollowUpResults());
        }
    });
}

// ─── Page Navigation ──────────────────────────────────────────────
async function navigateTo(page) {
    switch (page) {
        case 'homePage':
            await loadHomePage();
            break;
        case 'servantsPage':
            // Restore view mode preference for GS
            if (AppState.isGeneralSecretaryMode) {
                const savedView = localStorage.getItem('gs-servants-view');
                if (savedView) {
                    AppState.servantsViewMode = savedView;
                    const icon = DOM.servantsViewToggle?.querySelector('i');
                    if (icon) icon.className = savedView === 'grid' ? 'fas fa-th-large' : 'fas fa-list';
                }
            }
            renderServantsTable();
            break;
        case 'attendancePage':
            showLoading(true);
            await loadAttendancePage();
            showLoading(false);
            break;
        case 'reportsPage':
            showLoading(true);
            await loadReportsPage();
            showLoading(false);
            break;
        case 'calendarPage':
            loadCalendarPage();
            break;
        case 'correspondenceCenterPage':
            populateAnnouncementTargetSelector();
            break;
        case 'followUpPage':
            initFollowUpPage();
            // Privacy: Only GS sees the global registration status grid
            if (AppState.isGeneralSecretaryMode) {
                DOM.activityRegistrationGridContainer?.classList.remove('hidden-view');
                renderActivityRegistrationGrid();
            } else {
                DOM.activityRegistrationGridContainer?.classList.add('hidden-view');
            }
            // Auto-generate the absent servants list
            generateFollowUpReport();
            break;
        case 'eventsPage':
            await renderServiceEvents('eventsPageContainer');
            break;
    }
}

// ─── Follow-up Page Init ──────────────────────────────────────────
function initFollowUpPage() {
    // ── Restore Follow-up View Mode ─────────────────────────────────
    if (AppState.isGeneralSecretaryMode) {
        const savedFUView = localStorage.getItem('gs-followup-view');
        if (savedFUView) AppState.followUpViewMode = savedFUView;
    }

    // ── Year Selector Range 2025-2031 ───────────────────────────────
    const yearSel = DOM.absenceFilterYearSelector;
    if (yearSel && !yearSel.options.length) {
        const startYear = 2025;
        const endYear = 2031;
        const currentYear = new Date().getFullYear();

        yearSel.innerHTML = '';
        for (let i = startYear; i <= endYear; i++) {
            yearSel.innerHTML += `<option value="${i}" ${i === currentYear ? 'selected' : ''}>${i}</option>`;
        }

        AppState.absenceFilterSelectedYear = parseInt(yearSel.value);
        if (!AppState.isGeneralSecretaryMode) {
            loadAttendanceForYear(AppState.absenceFilterSelectedYear);
        }
    }

    // ── Month Dropdown with Select All ───────────────────────────────
    const monthDropdown = DOM.monthFilterDropdown;
    if (monthDropdown && !monthDropdown.dataset.initialized) {
        monthDropdown.dataset.initialized = 'true';
        const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

        let dropdownHTML = `
            <div class="flex items-center p-2 border-b dark:border-slate-700 mb-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <input type="checkbox" id="month-filter-all" class="w-4 h-4 text-teal-600 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded focus:ring-teal-500 ml-2 cursor-pointer">
                <label for="month-filter-all" class="font-black cursor-pointer w-full text-slate-700 dark:text-slate-200">الكل</label>
            </div>`;

        months.forEach((month, index) => {
            dropdownHTML += `
                <div class="flex items-center p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <input type="checkbox" id="month-filter-${index}" value="${index}" class="month-filter-checkbox w-4 h-4 text-teal-600 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded focus:ring-teal-500 ml-2 cursor-pointer">
                    <label for="month-filter-${index}" class="cursor-pointer w-full text-sm font-bold text-slate-600 dark:text-slate-300">${month}</label>
                </div>`;
        });
        monthDropdown.innerHTML = dropdownHTML;
    }

    // ── Activity Filter Buttons (Premium Style) ──────────────────────
    const actContainer = DOM.activityFilterButtons;
    if (actContainer && !actContainer.dataset.initialized) {
        actContainer.dataset.initialized = 'true';
        const activitiesToFilter = ACTIVITIES.filter(a => ['visiting', 'preparation', 'mass', 'service', 'explanation'].includes(a.key));

        actContainer.innerHTML = activitiesToFilter.map(act => `
            <button class="activity-filter-btn group flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl hover:shadow-[var(--color-shadow)] shadow-transparent" 
                    data-activity-key="${act.key}" 
                    style="--color-shadow: ${act.border}20;">
                <div class="w-12 h-12 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 shadow-sm border-2 border-slate-100 dark:border-slate-700 group-hover:border-[var(--color-border)] transition-all"
                     style="--color-border: ${act.border};">
                    <i class="fas ${act.icon}" style="color: ${act.border}; font-size: 1.25rem;"></i>
                </div>
                <span class="text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-black group-hover:text-slate-800 dark:group-hover:text-white transition-colors">${act.name}</span>
            </button>
        `).join('');

        // Initial highlight
        if (!AppState.absenceFilterSelectedActivity) {
            AppState.absenceFilterSelectedActivity = activitiesToFilter[0]?.key || 'visiting';
        }
        setTimeout(() => {
            const btn = actContainer.querySelector(`[data-activity-key="${AppState.absenceFilterSelectedActivity}"]`);
            if (btn) {
                btn.classList.add('active', 'bg-white', 'dark:bg-slate-800', 'shadow-xl');
                btn.style.boxShadow = `0 10px 25px -5px ${btn.style.getPropertyValue('--color-shadow')}`;
                btn.querySelector('.w-12')?.classList.remove('border-slate-100', 'dark:border-slate-700');
                btn.querySelector('.w-12')?.classList.add('border-[var(--color-border)]');
            }
        }, 100);
    }

    // ── Service Filter (Follow-up) - Admin Only ──────────────────────
    const serviceFilterContainer = document.getElementById('serviceFilterFollowupContainer');
    if (AppState.isGeneralSecretaryMode && serviceFilterContainer) {
        serviceFilterContainer.classList.remove('hidden-view');
        const serviceDropdown = document.getElementById('serviceFilterFollowupDropdown');
        if (serviceDropdown && !serviceDropdown.dataset.initialized) {
            serviceDropdown.dataset.initialized = 'true';
            
            const svcNames = SERVICES.filter(s => !s.isGroup).map(s => s.name);
            let dsHtml = `
            <div class="flex items-center p-2 border-b dark:border-slate-700 mb-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <input type="checkbox" id="service-f-filter-all" checked class="w-4 h-4 text-teal-600 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded focus:ring-teal-500 ml-2 cursor-pointer">
                <label for="service-f-filter-all" class="font-black cursor-pointer w-full text-slate-700 dark:text-slate-200">الكل</label>
            </div>`;
            
            svcNames.forEach((svc, index) => {
                dsHtml += `
                <div class="flex items-center p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <input type="checkbox" id="service-f-filter-${index}" value="${svc}" checked class="service-f-filter-checkbox w-4 h-4 text-teal-600 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded focus:ring-teal-500 ml-2 cursor-pointer">
                    <label for="service-f-filter-${index}" class="cursor-pointer w-full text-sm font-bold text-slate-600 dark:text-slate-300">${svc}</label>
                </div>`;
            });
            serviceDropdown.innerHTML = dsHtml;
            AppState.absenceFilterSelectedServices = new Set(svcNames);
        }
    }
}

// ─── App Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', bootstrap);
