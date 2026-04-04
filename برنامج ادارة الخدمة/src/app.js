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
import { handlePasswordSubmit, handleServiceCardClick, logout, openSettings } from './auth.js';
import { handleSettingsSave } from './ai.js';
import {
    loadServants, openAddModal, openEditModal, handleServantFormSubmit,
    handleImageSelect, handleExcelImport, exportServantsToExcel,
    showServantProfile, deleteServant, renderServantsTable
} from './servants.js';
import {
    loadAttendancePage, loadAttendanceForYear, populateMonths,
    populateFridaysGrid, renderActivityButtons, renderServantChecklist, saveActivityAttendance
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
    backupData, restoreData, renderAdminServantsTable, renderActivityRegistrationGrid
} from './dashboard.js';
import { generateBirthdayGreeting, renderMarkdown, copyText, shareWhatsapp } from './ai.js';

// Make deleteServant available globally for event delegation
window.__servants = { deleteServant };

// Expose showServantProfile globally for inline onclick in dynamic HTML
window.showServantProfile = showServantProfile;

// ─── Color map for service cards (replaces dynamic Tailwind classes) ─
const COLOR_MAP = {
    teal:   { bg: '#f0fdfa', border: '#5eead4', icon: '#0d9488', dark: { bg: '#042f2e', border: '#0d9488' } },
    lime:   { bg: '#f7fee7', border: '#bef264', icon: '#65a30d', dark: { bg: '#1a2e05', border: '#65a30d' } },
    green:  { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', dark: { bg: '#052e16', border: '#16a34a' } },
    yellow: { bg: '#fefce8', border: '#fde047', icon: '#ca8a04', dark: { bg: '#2d1f00', border: '#ca8a04' } },
    pink:   { bg: '#fdf2f8', border: '#f9a8d4', icon: '#db2777', dark: { bg: '#2d0a1e', border: '#db2777' } },
    indigo: { bg: '#eef2ff', border: '#a5b4fc', icon: '#4f46e5', dark: { bg: '#1e1b4b', border: '#4f46e5' } },
    red:    { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', dark: { bg: '#2d0707', border: '#dc2626' } },
    purple: { bg: '#faf5ff', border: '#d8b4fe', icon: '#9333ea', dark: { bg: '#1a0838', border: '#9333ea' } },
    cyan:   { bg: '#ecfeff', border: '#67e8f9', icon: '#0891b2', dark: { bg: '#042830', border: '#0891b2' } },
    orange: { bg: '#fff7ed', border: '#fdba74', icon: '#ea580c', dark: { bg: '#2d1200', border: '#ea580c' } },
    blue:   { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', dark: { bg: '#0c1a3d', border: '#2563eb' } },
};

// ─── AI Global Helpers ────────────────────────────────────────────
window.generateAndShowAIGreeting = async function(name) {
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
    const isDark = document.documentElement.classList.contains('dark');

    grid.innerHTML = SERVICES.map(svc => {
        const c = COLOR_MAP[svc.color] || COLOR_MAP.teal;
        const mode = isDark ? c.dark : c;
        const badgeId = `service-badge-${svc.name.replace(/\s+/g, '-')}`;
        return `
        <div class="service-card" data-service="${svc.name}"
            style="background:${mode.bg}; border:2px solid ${mode.border}; border-radius:16px;
                   padding:20px 12px; display:flex; flex-direction:column; align-items:center;
                   text-align:center; cursor:pointer; position:relative;
                   transition:transform 0.2s, box-shadow 0.2s; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;
                border-radius:50%;background:${mode.bg};border:2px solid ${mode.border};
                box-shadow:0 2px 8px rgba(0,0,0,0.1);margin-bottom:12px;position:relative;">
                <i class="fas ${svc.icon}" style="font-size:1.6rem;color:${c.icon}"></i>
                <span id="${badgeId}" class="hidden-view"
                    style="position:absolute;top:-4px;left:-4px;background:#ef4444;color:#fff;
                    font-size:0.6rem;font-weight:800;border-radius:99px;min-width:18px;height:18px;
                    display:flex;align-items:center;justify-content:center;padding:0 4px;
                    box-shadow:0 2px 6px rgba(239,68,68,0.5);">0</span>
            </div>
            <p style="font-weight:700;font-size:0.85rem;color:${isDark ? '#e2e8f0' : '#1e293b'};
                line-height:1.3;">${svc.name}</p>
        </div>`;
    }).join('');

    // Hover effect
    grid.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
            card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
        });
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
    document.getElementById('importForm')?.addEventListener('submit', handleExcelImport);
    DOM.servantImageFile?.addEventListener('change', handleImageSelect);

    DOM.searchInput?.addEventListener('input', () => {
        renderServantsTable();
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
        const editBtn   = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (editBtn)    openEditModal(editBtn.dataset.id);
        if (deleteBtn)  deleteServant(deleteBtn.dataset.id);
    });

    DOM.servantsViewToggle?.addEventListener('click', () => {
        AppState.servantsViewMode = AppState.servantsViewMode === 'grid' ? 'table' : 'grid';
        const icon = DOM.servantsViewToggle.querySelector('i');
        if (icon) {
            icon.className = AppState.servantsViewMode === 'grid' ? 'fas fa-th-large' : 'fas fa-list';
        }
        renderServantsTable();
    });

    // ── Attendance Page ────────────────────────────────────────────
    DOM.yearSelector?.addEventListener('change', async function() {
        showLoading(true);
        await loadAttendanceForYear(this.value);
        showLoading(false);
        populateMonths(this.value);
        if (DOM.monthSelector) DOM.monthSelector.value = '';
        if (DOM.fridaysGrid) DOM.fridaysGrid.innerHTML = '';
        DOM.activityButtons?.classList.add('hidden-view');
        DOM.attendanceListContainer?.classList.add('hidden-view');
    });

    DOM.monthSelector?.addEventListener('change', function() {
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

    DOM.noActivityCheck?.addEventListener('change', function() {
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

    // ── Backup / Restore ───────────────────────────────────────────
    DOM.backupBtn?.addEventListener('click', backupData);
    DOM.restoreBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.addEventListener('change', restoreData);
        input.click();
    });

    // ── Follow-up ──────────────────────────────────────────────────
    document.getElementById('generateFollowUpBtn')?.addEventListener('click', generateFollowUpReport);
    DOM.absenceFilterYearSelector?.addEventListener('change', async function() {
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
}

// ─── Page Navigation ──────────────────────────────────────────────
async function navigateTo(page) {
    switch (page) {
        case 'homePage':
            await loadHomePage();
            break;
        case 'servantsPage':
            // Re-render table to ensure filters are applied correctly
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
    }
}

// ─── Follow-up Page Init ──────────────────────────────────────────
function initFollowUpPage() {
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
}

// ─── App Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', bootstrap);
