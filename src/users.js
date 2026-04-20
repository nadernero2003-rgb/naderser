// ==================================================================
// users.js - User Management Control Panel (Admin Only)
// ==================================================================

import { AppState } from './state.js';
import { SERVICES } from './config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from './firebase.js';
import { DOM, showMessage, openModal, closeModal } from './ui.js';

let usersCache = [];

// ─── Initialize the User Management Page ──────────────────────────
export async function initUserManagement() {
    // Populate Services Checkboxes
    const container = document.getElementById('userMgmtServicesContainer');
    if (container && !container.dataset.initialized) {
        container.dataset.initialized = 'true';
        container.innerHTML = SERVICES.map((svc, idx) => `
            <div class="flex items-center p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent dark:border-slate-700/50">
                <input type="checkbox" id="user-svc-${idx}" value="${svc.name}" class="user-svc-checkbox w-4 h-4 text-indigo-600 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded focus:ring-indigo-500 cursor-pointer">
                <label for="user-svc-${idx}" class="cursor-pointer w-full text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">${svc.name}</label>
            </div>
        `).join('');
    }

    await loadUsers();
    
    // Bind search bar
    document.getElementById('userSearchBar')?.addEventListener('input', (e) => {
        renderUsersTable(e.target.value.trim().toLowerCase());
    });
}

// ─── Load Users from Firestore ────────────────────────────────────
export async function loadUsers() {
    const tableBody = document.getElementById('usersTableBody');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-slate-400"><i class="fas fa-spinner fa-spin mx-2"></i>جاري التحميل...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(collection(AppState.db, 'users'));
        usersCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Render
        const searchInput = document.getElementById('userSearchBar');
        renderUsersTable(searchInput ? searchInput.value.trim().toLowerCase() : '');
    } catch (e) {
        console.error("Error loading users", e);
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-red-500"><i class="fas fa-exclamation-triangle mx-2"></i>خطأ في تحميل المستخدمين</td></tr>';
    }
}

// ─── Render Users Table ───────────────────────────────────────────
export function renderUsersTable(searchQuery = '') {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    const filtered = usersCache.filter(u => {
        const str = `${u.name||''} ${u.mobile||''}`.toLowerCase();
        return str.includes(searchQuery);
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-slate-400">لا يوجد مستخدمين لعرضهم.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map(u => {
        const isSuperAdmin = u.role === 'admin' && u.name === 'المدير العام';
        
        const roleLabel = u.role === 'admin' 
            ? `<span class="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 px-2 py-1 rounded-md text-xs font-bold"><i class="fas fa-user-shield ml-1"></i>أمين عام</span>`
            : `<span class="bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400 px-2 py-1 rounded-md text-xs font-bold"><i class="fas fa-user ml-1"></i>أمين خدمة</span>`;
            
        const svcs = (u.assignedServices || []).join('، ');
        const svcsHtml = svcs.length > 30 ? `<span title="${svcs}">${svcs.substring(0,30)}...</span>` : svcs;

        const actionBtns = isSuperAdmin 
            ? `<span class="text-xs text-slate-400"><i class="fas fa-lock ml-1"></i>لا يمكن حذفه</span>`
            : `
                <button class="edit-user-btn text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-2 transition-colors mx-1" data-id="${u.id}" title="تعديل">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-user-btn text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 transition-colors mx-1" data-id="${u.id}" title="حذف">
                    <i class="fas fa-trash"></i>
                </button>
            `;

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td class="p-4 font-bold text-slate-800 dark:text-slate-200">${u.name || '-'}</td>
                <td class="p-4 font-bold font-mono text-sm">${u.mobile || '-'}</td>
                <td class="p-4">${roleLabel}</td>
                <td class="p-4 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">${u.role === 'admin' ? 'كل الخدمات (ضمنياً)' : svcsHtml}</td>
                <td class="p-4 text-center">${actionBtns}</td>
            </tr>
        `;
    }).join('');
}

// ─── Open Add/Edit Modal (Exposed to Global) ──────────────────────
export function openUserModal(userId = null) {
    document.getElementById('userMgmtErrorMessage').classList.add('hidden-view');
    const form = document.getElementById('userManagementForm');
    form.reset();
    document.querySelectorAll('.user-svc-checkbox').forEach(cb => cb.checked = false);
    
    if (userId) {
        // Edit mode
        const u = usersCache.find(x => x.id === userId);
        if (!u) return;
        document.getElementById('userModalTitle').innerHTML = `<i class="fas fa-user-edit text-indigo-500"></i> تعديل المستخدم`;
        document.getElementById('userManagementDocId').value = u.id;
        document.getElementById('userMgmtName').value = u.name || '';
        document.getElementById('userMgmtMobile').value = u.mobile || '';
        document.getElementById('userMgmtPassword').value = u.password || '';
        document.getElementById('userMgmtRole').value = u.role || 'leader';
        
        // Check services
        if (u.assignedServices) {
            document.querySelectorAll('.user-svc-checkbox').forEach(cb => {
                cb.checked = u.assignedServices.includes(cb.value);
            });
        }
    } else {
        // Add mode
        document.getElementById('userModalTitle').innerHTML = `<i class="fas fa-user-plus text-indigo-500"></i> إضافة مستخدم جديد`;
        document.getElementById('userManagementDocId').value = '';
    }
    
    openModal(document.getElementById('userManagementModal'));
}

// ─── Save / Add User ──────────────────────────────────────────────
export async function handleUserSave() {
    const errorEl = document.getElementById('userMgmtErrorMessage');
    errorEl.classList.add('hidden-view');
    
    const docId = document.getElementById('userManagementDocId').value;
    const name = document.getElementById('userMgmtName').value.trim();
    const mobile = document.getElementById('userMgmtMobile').value.trim();
    const password = document.getElementById('userMgmtPassword').value.trim();
    const role = document.getElementById('userMgmtRole').value;
    
    // Get checked services
    const assignedServices = [];
    document.querySelectorAll('.user-svc-checkbox:checked').forEach(cb => {
        assignedServices.push(cb.value);
    });

    if (!name || !mobile || !password) {
        errorEl.innerHTML = '<i class="fas fa-exclamation-circle ml-1"></i> يرجى استكمال جميع البيانات الأساسية';
        errorEl.classList.remove('hidden-view');
        return;
    }

    if (role === 'leader' && assignedServices.length === 0) {
        errorEl.innerHTML = '<i class="fas fa-exclamation-circle ml-1"></i> يجب اختيار خدمة واحدة على الأقل لأمين الخدمة';
        errorEl.classList.remove('hidden-view');
        return;
    }

    const saveBtn = document.getElementById('userMgmtSaveBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-1"></i> جاري الحفظ...';

    try {
        const usersRef = collection(AppState.db, 'users');
        
        // Check uniqueness of mobile if adding or changing mobile
        const q = query(usersRef, where("mobile", "==", mobile));
        const mobileCheck = await getDocs(q);
        
        const existingDoc = mobileCheck.docs.find(d => d.id !== docId);
        if (existingDoc) {
            errorEl.innerHTML = '<i class="fas fa-exclamation-circle ml-1"></i> رقم الموبايل (اسم الدخول) مسجل مسبقاً لمستخدم آخر!';
            errorEl.classList.remove('hidden-view');
            return;
        }

        const userData = { name, mobile, password, role, assignedServices };

        if (docId) {
            // Update
            await updateDoc(doc(AppState.db, 'users', docId), userData);
            showMessage('تم تعديل بيانات المستخدم بنجاح');
        } else {
            // Add
            await addDoc(usersRef, userData);
            showMessage('تم تسجيل المستخدم الجديد بنجاح');
        }

        closeModal(document.getElementById('userManagementModal'));
        await loadUsers(); // Refresh table

    } catch(e) {
        console.error("Save User logic failed", e);
        errorEl.innerHTML = '<i class="fas fa-exclamation-triangle ml-1"></i> حدث خطأ أثناء الاتصال بالخادم';
        errorEl.classList.remove('hidden-view');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// ─── Delete User ──────────────────────────────────────────────────
export async function handleDeleteUser(userId) {
    if(!confirm("هل أنت متأكد أنك تريد حذف هذا المستخدم لاحقاً؟ لا يمكن التراجع عن هذا الإجراء.")) return;

    try {
        await deleteDoc(doc(AppState.db, 'users', userId));
        showMessage('تم حذف المستخدم بنجاح', false);
        await loadUsers(); // Refresh table
    } catch(e) {
        console.error("Delete user failed: ", e);
        showMessage("حدث خطأ أثناء الحذف.", true);
    }
}
