// ==================================================================
// auth.js - Authentication, Password Management, Login/Logout
// ==================================================================

import { AppState } from './state.js';
import { SERVICES } from './config.js';
import { authReady, loadGeminiKeyFromFirestore } from './firebase.js';
import { DOM, showMessage, openModal, closeModal, applyServiceTheme, applyTheme } from './ui.js';
import { updateServiceCardBadges } from './announcements.js';

// ─── Password Verification ─────────────────────────────────────────
export function verifyPassword(serviceName, enteredPassword) {
    return true; // Passwords disabled fully for trial
}

// ─── Service Choice Modal ─────────────────────────────────────────
export function openServiceChoiceModal(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName);
    if (!service || !service.children) return;

    document.getElementById('serviceChoiceModalTitle').textContent = service.name;
    const body = document.getElementById('serviceChoiceModalBody');
    body.innerHTML = '';

    service.children.forEach(child => {
        const card = document.createElement('div');
        card.className = `p-4 mb-3 rounded-xl border-2 cursor-pointer flex items-center gap-4
            border-${child.color}-300 hover:bg-${child.color}-50 dark:hover:bg-${child.color}-900/30
            transition-all hover:shadow-md`;
        card.innerHTML = `
            <div class="w-14 h-14 rounded-full flex items-center justify-center
                bg-gradient-to-br from-${child.color}-100 to-${child.color}-200
                dark:from-${child.color}-800/50 dark:to-${child.color}-900/50">
                <i class="fas ${child.icon} text-2xl text-${child.color}-600 dark:text-${child.color}-400"></i>
            </div>
            <div>
                <p class="font-bold text-lg">${child.name}</p>
                <p class="text-sm text-slate-500">${child.description || ''}</p>
            </div>`;

        card.addEventListener('click', async () => {
            closeModal(document.getElementById('serviceChoiceModal'));
            AppState.currentServiceName = child.name === 'الامين العام' ? serviceName : child.name;
            AppState.isGeneralSecretaryMode = !!child.isGeneralSecretary;

            const { showDashboard } = await import('./dashboard.js');
            await showDashboard();
        });
        body.appendChild(card);
    });

    openModal(document.getElementById('serviceChoiceModal'));
}

// ─── Password Modal Handler ────────────────────────────────────────
export async function handlePasswordSubmit(e) {
    e.preventDefault();
    const password = DOM.servicePasswordInput.value.trim();
    const serviceName = DOM.passwordModal.dataset.targetService;
    const action = DOM.passwordModal.dataset.targetAction;

    if (!verifyPassword(serviceName, password)) {
        showMessage('كلمة السر غير صحيحة!', true);
        DOM.servicePasswordInput.value = '';
        DOM.servicePasswordInput.focus();
        return;
    }

    closeModal(DOM.passwordModal);
    DOM.servicePasswordInput.value = '';

    if (action === 'open-service-menu') {
        openServiceChoiceModal(serviceName);
    } else if (action === 'login-leader') {
        AppState.currentServiceName = serviceName;
        AppState.isGeneralSecretaryMode = false;
        const { showDashboard } = await import('./dashboard.js');
        await showDashboard();
    } else if (action === 'login-admin') {
        AppState.currentServiceName = serviceName;
        AppState.isGeneralSecretaryMode = true;
        const { showDashboard } = await import('./dashboard.js');
        await showDashboard();
    }
}

export async function handleServiceCardClick(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName);
    if (!service) return;

    // Password verification disabled for trial period
    if (service.isGroup) {
        openServiceChoiceModal(serviceName);
    } else {
        AppState.currentServiceName = serviceName;
        AppState.isGeneralSecretaryMode = false;
        const { showDashboard } = await import('./dashboard.js');
        await showDashboard();
    }
}

// ─── Logout ────────────────────────────────────────────────────────
export function logout() {
    AppState.reset();
    applyTheme('light');

    if (DOM.mainDashboard) DOM.mainDashboard.classList.add('hidden-view');
    if (DOM.loginOrServicesView) DOM.loginOrServicesView.classList.remove('hidden-view');

    // Reset sidebar visibility
    ['servantsPage', 'attendancePage', 'calendarPage'].forEach(page => {
        const link = DOM.sidebarLinks?.querySelector(`[data-page="${page}"]`);
        if (link) link.classList.remove('hidden-view');
    });
    ['announcementsBoardLink', 'correspondenceLink', 'followUpLink', 'serviceAnnouncementsLink']
        .forEach(id => DOM[id]?.classList.add('hidden-view'));

    // Refresh service badges
    updateServiceCardBadges();
}

// ─── Settings ──────────────────────────────────────────────────────
export function openSettings() {
    const modal = document.getElementById('settingsPasswordModal');
    if (!modal) return;
    // Clear previous input and error
    const input = document.getElementById('settingsPasswordInput');
    const errEl = document.getElementById('settingsPasswordError');
    if (input) { input.value = ''; input.type = 'password'; }
    if (errEl) errEl.classList.add('hidden');
    // Reset eye icon
    const eyeBtn = document.getElementById('toggleSettingsPwdVisibility');
    if (eyeBtn) eyeBtn.querySelector('i').className = 'fas fa-eye text-sm';
    openModal(modal);
    setTimeout(() => input?.focus(), 100);
}

export function handleSettingsPasswordSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('settingsPasswordInput');
    const errEl = document.getElementById('settingsPasswordError');
    const pass = input?.value?.trim();

    if (pass === '2203') {
        closeModal(document.getElementById('settingsPasswordModal'));
        if (input) input.value = '';
        openModal(DOM.settingsModal);
    } else {
        if (errEl) errEl.classList.remove('hidden');
        if (input) { input.value = ''; input.classList.add('border-red-400'); }
        setTimeout(() => {
            if (input) input.classList.remove('border-red-400');
        }, 1000);
        input?.focus();
    }
}
