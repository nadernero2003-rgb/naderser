// ==================================================================
// auth.js - Authentication, Password Management, Login/Logout
// ==================================================================

import { AppState } from './state.js';
import { SERVICES } from './config.js';
import {
    authReady, loadGeminiKeyFromFirestore,
    collection, query, where, getDocs, getDoc, doc
} from './firebase.js';
import { DOM, showMessage, openModal, closeModal, applyServiceTheme, applyTheme } from './ui.js';
import { updateServiceCardBadges } from './announcements.js';

// ─── Password Verification (Legacy - Deprecated) ──────────────────
export function verifyPassword(serviceName, enteredPassword) {
    return false; // Replaced by Firestore check
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

// ─── Password Modal Handler (New Firestore Version) ───────────────
export async function handlePasswordSubmit(e) {
    if (e) e.preventDefault();

    const mobile = document.getElementById('serviceUserMobile').value.trim();
    const password = DOM.servicePasswordInput.value.trim();
    const serviceName = DOM.passwordModal.dataset.targetService;
    const errorEl = document.getElementById('loginErrorMessage');

    if (!mobile || !password) {
        showMessage('يرجى إدخال رقم الموبايل وكلمة السر', true);
        return;
    }

    if (errorEl) errorEl.classList.add('hidden-view');

    // Show loading on button
    const submitBtn = DOM.passwordModal.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-1"></i> جاري التحقق...';

    try {
        // 1. Find user in 'users' collection (matched to your screenshot)
        const usersRef = collection(AppState.db, 'users');
        const q = query(usersRef, where("mobile", "==", mobile), where("password", "==", password));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            if (errorEl) errorEl.classList.remove('hidden-view');
            return;
        }

        const userDoc = querySnapshot.docs[0].data();

        // 2. Check Permissions (assignedServices in your screenshot)
        // role: 'admin' OR role: 'leader' (with assignedServices match)
        const isAdmin = userDoc.role === 'admin';
        const isLeaderForThisService = userDoc.role === 'leader' &&
            userDoc.assignedServices &&
            userDoc.assignedServices.includes(serviceName);

        const hasPermission = isAdmin || isLeaderForThisService;

        if (!hasPermission) {
            showMessage(`عذراً، ${userDoc.name} ليس لديه صلاحية دخول لـ ${serviceName}`, true);
            return;
        }

        // 3. Success -> Grant Access
        AppState.currentUser = userDoc;
        AppState.currentServiceName = serviceName;
        // Identify General Secretary mode
        AppState.isGeneralSecretaryMode = isAdmin || serviceName === 'الامين العام';

        // Clean UI
        closeModal(DOM.passwordModal);
        const mobileInput = document.getElementById('serviceUserMobile');
        if (mobileInput) mobileInput.value = '';
        DOM.servicePasswordInput.value = '';

        // If it was a group card (like Ameen General), show the next menu
        const service = SERVICES.find(s => s.name === serviceName);
        if (service && service.isGroup) {
            openServiceChoiceModal(serviceName);
        } else {
            const { showDashboard } = await import('./dashboard.js');
            await showDashboard();
        }

    } catch (error) {
        console.error("Auth error:", error);
        showMessage("حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.", true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

export async function handleServiceCardClick(serviceName) {
    const service = SERVICES.find(s => s.name === serviceName);
    if (!service) return;

    // Set target service and current name in UI
    const serviceNameEl = document.getElementById('passwordModalServiceName');
    if (serviceNameEl) serviceNameEl.textContent = serviceName;
    DOM.passwordModal.dataset.targetService = serviceName;

    // Reset errors
    const errorEl = document.getElementById('loginErrorMessage');
    if (errorEl) errorEl.classList.add('hidden-view');

    // Open login modal
    openModal(DOM.passwordModal);
    setTimeout(() => document.getElementById('serviceUserMobile')?.focus(), 300);
}

// ─── Logout ────────────────────────────────────────────────────────
export function logout() {
    AppState.reset();
    applyTheme('light');

    if (DOM.mainDashboard) DOM.mainDashboard.classList.add('hidden-view');
    if (DOM.loginOrServicesView) DOM.loginOrServicesView.classList.remove('hidden-view');

    // Show install banner again on front page (if not already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone) {
        document.getElementById('staticInstallBanner')?.classList.remove('hidden');
    }

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

export async function handleSettingsPasswordSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('settingsPasswordInput');
    const errEl = document.getElementById('settingsPasswordError');
    const pass = input?.value?.trim();

    // Add loading state
    const submitBtn = e?.target?.querySelector('button[type="submit"]') || document.getElementById('settingsPasswordSubmitBtn');
    let originalText = '';
    if (submitBtn) {
        originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جاري التحقق...';
        submitBtn.disabled = true;
    }

    try {
        const docRef = doc(AppState.db, 'system_settings', 'main');
        const docSnap = await getDoc(docRef);

        let validPassword = '2203';
        if (docSnap.exists() && docSnap.data().settingsPassword) {
            validPassword = docSnap.data().settingsPassword;
        }

        if (pass === validPassword) {
            closeModal(document.getElementById('settingsPasswordModal'));
            if (input) input.value = '';
            openModal(DOM.settingsModal);
        } else {
            if (errEl) errEl.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Error verifying settings password:", err);
        // Fallback for offline mode or permissions error
        if (pass === '2203') {
            closeModal(document.getElementById('settingsPasswordModal'));
            if (input) input.value = '';
            openModal(DOM.settingsModal);
        } else {
            if (errEl) errEl.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

// ─── Bootstrap (Optional First Setup) ──────────────────────────────
export async function bootstrapFirstAdmin() {
    const status = document.getElementById('bootstrapStatus');
    if (status) {
        status.textContent = 'جاري إنشاء الحساب...';
        status.className = 'text-[10px] font-bold mt-2 text-center text-indigo-500';
        status.classList.remove('hidden');
    }

    try {
        const usersRef = collection(AppState.db, 'users');

        // 1. Check if ANY user exists (to prevent abuse)
        const snap = await getDocs(usersRef);
        if (!snap.empty) {
            if (status) {
                status.textContent = 'النظام مهيأ بالفعل بجداول المستخدمين.';
                status.className = 'text-[10px] font-bold mt-2 text-center text-red-500';
            }
            return;
        }

        // 2. Create the first admin
        const adminData = {
            name: "المدير العام",
            mobile: "admin",
            password: "admin", // Initial password
            role: "admin",
            assignedServices: SERVICES.map(s => s.name)
        };

        const { addDoc } = await import('./firebase.js');
        await addDoc(usersRef, adminData);

        if (status) {
            status.textContent = 'تم بنجاح! الإسم: admin | السر: admin';
            status.className = 'text-[10px] font-bold mt-2 text-center text-green-500';
        }
    } catch (e) {
        console.error(e);
        if (status) {
            status.textContent = 'خطأ: ' + e.message;
            status.className = 'text-[10px] font-bold mt-2 text-center text-red-500';
        }
    }
}
