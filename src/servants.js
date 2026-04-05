// ==================================================================
// servants.js - Servant Management (CRUD + Excel Import/Export)
// ==================================================================

import { AppState } from './state.js';
import { SERVICES } from './config.js';
import {
    authReady, getServiceCol, getServiceDoc,
    collection, addDoc, onSnapshot, doc, deleteDoc, setDoc, updateDoc,
    Local
} from './firebase.js';
import {
    DOM, showMessage, showLoading, showConfirm, openModal, closeModal,
    getUpcomingBirthdays, getSafeSrc, updateBadge
} from './ui.js';
import { generateBirthdayGreeting, renderMarkdown, copyText, shareWhatsapp, exportCardAsImage } from './ai.js';

// ─── Load & Listen ─────────────────────────────────────────────────
export function loadServants() {
    return new Promise(async resolve => {
        await authReady;
        if (AppState.isLocalMode) {
            AppState.servantsCache = Local.servants(AppState.currentServiceName);
            AppState.servantsCache.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            populateServiceFilter();
            renderServantsTable();
            resolve();
            return;
        }
        if (!AppState.userId || !AppState.currentServiceName) { resolve(); return; }

        if (AppState.subscriptions.servants) AppState.subscriptions.servants();
        const col = getServiceCol('servants');
        AppState.subscriptions.servants = onSnapshot(col, snap => {
            AppState.servantsCache = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            AppState.servantsCache.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            populateServiceFilter();
            renderServantsTable();
            resolve();
        }, err => {
            console.error('servants onSnapshot:', err);
            showMessage('خطأ في تحميل الخدام.', true);
            resolve();
        });
    });
}

export function populateServiceFilter() {
    const filter = document.getElementById('servantServiceFilter');
    const group = document.getElementById('serviceFilterGroup');

    if (!AppState.isGeneralSecretaryMode) {
        group?.classList.add('hidden-view');
        return;
    }

    group?.classList.remove('hidden-view');

    // Only populate if we have data
    const src = AppState.allServantsCache || [];
    if (!src.length) return;

    // Save current value before repopulating
    const currentVal = filter?.value || '';

    // Unique services from cache, sorted by SERVICES config order
    const uniqueServices = [...new Set(
        src.map(s => s.serviceName).filter(Boolean)
    )];
    // Sort by SERVICES config index
    uniqueServices.sort((a, b) => {
        const idxA = SERVICES.findIndex(s => s.name === a);
        const idxB = SERVICES.findIndex(s => s.name === b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    if (filter) {
        filter.innerHTML = '<option value="">كل الخدمات</option>' +
            uniqueServices.map(s => `<option value="${s}">${s}</option>`).join('');

        // Restore previous selection
        if (currentVal && uniqueServices.includes(currentVal)) {
            filter.value = currentVal;
        }
    }
}

// ─── Render Table ─────────────────────────────────────────────────
export async function renderServantsTable(source = null) {
    const isAdmin = AppState.isGeneralSecretaryMode;
    const tbody = DOM.servantsTableBody;
    if (!tbody) return;

    if (!source) {
        source = isAdmin ? AppState.allServantsCache : AppState.servantsCache;

        // Apply Filters (Search & Service)
        const rawQ = (DOM.searchInput?.value || '').trim().toLowerCase();
        const normalizeArabic = (text) => text ? text.replace(/[أإآا]/g, 'ا').replace(/[ةه]/g, 'ه').replace(/[يى]/g, 'ي').replace(/[ؤئ]/g, 'ء') : '';
        const q = normalizeArabic(rawQ);
        const svcFilter = document.getElementById('servantServiceFilter')?.value || '';

        source = source.filter(s => {
            if (!q && !svcFilter) return true;
            const nName = normalizeArabic(s.name || '').toLowerCase();
            const nMobile = String(s.mobile || '');
            const nNatId = String(s.nationalId || '');
            const matchesSearch = !q || nName.includes(q) || nMobile.includes(q) || nNatId.includes(q);
            const matchesService = !svcFilter || (s.serviceName === svcFilter);
            return matchesSearch && matchesService;
        });
    }

    // Count Badge
    const countBadge = document.getElementById('servantFilterCount');
    if (countBadge) {
        if (source.length > 0) {
            countBadge.textContent = source.length + ' خادم';
            countBadge.classList.remove('hidden-view');
        } else {
            countBadge.classList.add('hidden-view');
        }
    }

    if (!source?.length) {
        const msg = isAdmin && AppState.allServantsCache.length === 0
            ? 'جاري تحميل بيانات جميع الخدمات...'
            : 'لا يوجد خدام يتطابقون مع البحث.';
        tbody.className = "w-full";
        tbody.innerHTML = '<div class="col-span-full flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600">' +
            '<i class="fas ' + (isAdmin && AppState.allServantsCache.length === 0 ? 'fa-spinner fa-spin text-teal-500' : 'fa-users-slash text-slate-400') + ' text-5xl mb-4"></i>' +
            '<p class="text-lg font-bold text-slate-500 dark:text-slate-400">' + msg + '</p>' +
            '</div>';
        return;
    }

    if (AppState.servantsViewMode === 'table') {
        tbody.className = "w-full overflow-x-auto bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 block";
        let rows = source.map((s, i) => {
            const val = v => v || '-';
            const imgUrl = s.imageUrl || s.image;
            const imgHtml = imgUrl
                ? '<img src="' + getSafeSrc(imgUrl) + '" class="w-10 h-10 rounded-full object-cover border border-slate-200 mx-auto">'
                : '<div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-xs mx-auto"><i class="fas fa-user"></i></div>';

            // Service badge for admin mode
            const svcConfig = SERVICES.find(sv => sv.name === s.serviceName);
            const svcBadge = isAdmin && s.serviceName
                ? '<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border" style="color:' + (svcConfig?.icon || '#0d9488') + ';border-color:' + (svcConfig?.border || svcConfig?.icon || '#0d9488') + '20;background:' + (svcConfig?.border || svcConfig?.icon || '#0d9488') + '15">' + s.serviceName + '</span>'
                : '';

            return '<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b dark:border-slate-700 last:border-0">' +
                '<td class="p-4 text-center font-bold text-slate-400 text-xs">' + (i + 1) + '</td>' +
                '<td class="p-4 flex justify-center">' + imgHtml + '</td>' +
                '<td class="p-4 text-right font-bold">' +
                '<a href="#" onclick="event.preventDefault(); showServantProfile(\'' + s.id + '\', \'' + (s.serviceName || AppState.currentServiceName) + '\')" class="text-teal-600 dark:text-teal-400 hover:underline servant-profile-link">' + val(s.name) + '</a>' +
                '</td>' +
                (isAdmin ? '<td class="p-4 text-center">' + svcBadge + '</td>' : '') +
                '<td class="p-4 text-center font-bold text-slate-600 dark:text-slate-300 text-sm">' + val(s.chapter) + '</td>' +
                '<td class="p-4 text-center font-bold text-slate-600 dark:text-slate-300 text-sm" dir="ltr">' + val(s.mobile) + '</td>' +
                '<td class="p-4 text-center">' +
                '<div class="flex justify-center gap-2">' +
                '<button class="edit-btn text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 w-8 h-8 rounded-lg transition-all" data-id="' + s.id + '"><i class="fas fa-edit"></i></button>' +
                '<button class="delete-btn text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 w-8 h-8 rounded-lg transition-all" data-id="' + s.id + '"><i class="fas fa-trash"></i></button>' +
                '</div>' +
                '</td>' +
                '</tr>';
        }).join('');

        tbody.innerHTML = '<table class="w-full text-right border-collapse">' +
            '<thead>' +
            '<tr class="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">' +
            '<th class="p-4 text-center font-black">#</th>' +
            '<th class="p-4 text-center font-black w-16">الصورة</th>' +
            '<th class="p-4 text-right font-black">الخادم</th>' +
            (isAdmin ? '<th class="p-4 text-center font-black">الخدمة</th>' : '') +
            '<th class="p-4 text-center font-black">الفصل</th>' +
            '<th class="p-4 text-center font-black">الموبايل</th>' +
            '<th class="p-4 text-center font-black">إجراءات</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
            '</table>';
    } else {
        // Grid View
        tbody.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20";
        tbody.innerHTML = source.map(s => {
            const val = v => v || '-';
            const imgUrl = s.imageUrl || s.image;
            const imgHtml = imgUrl
                ? '<img src="' + getSafeSrc(imgUrl) + '" alt="' + val(s.name) + '" class="w-20 h-20 rounded-full object-cover shadow-md border-4 border-white dark:border-slate-800 -mt-10 mx-auto">'
                : '<div class="w-20 h-20 rounded-full shadow-md border-4 border-white dark:border-slate-800 bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-300 flex items-center justify-center text-3xl -mt-10 mx-auto"><i class="fas fa-user"></i></div>';

            return '<div class="relative bg-white dark:bg-slate-800 rounded-3xl p-5 pt-10 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-xl hover:border-teal-400/50 transition-all transform hover:-translate-y-1.5 group">' +
                imgHtml +
                '<div class="text-center mt-3">' +
                '<h3 class="font-black text-lg mb-1 leading-tight">' +
                '<a href="#" onclick="event.preventDefault(); showServantProfile(\'' + s.id + '\', \'' + (s.serviceName || AppState.currentServiceName) + '\')" class="text-teal-600 dark:text-teal-400 hover:underline servant-profile-link">' + val(s.name) + '</a>' +
                '</h3>' +
                (isAdmin ? '<span class="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-0.5 rounded-full text-[10px] shadow-sm mb-3 inline-block border border-indigo-100 dark:border-indigo-800">' + val(s.serviceName) + '</span>' : '') +
                '</div>' +
                '<div class="grid grid-cols-2 gap-3 mt-4">' +
                '<div class="bg-slate-50 dark:bg-slate-700/40 p-2 rounded-2xl text-center border border-slate-100/50 dark:border-slate-600/30">' +
                '<i class="fas fa-users text-orange-400 block mb-1 text-sm"></i>' +
                '<span class="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate block px-1">' + (s.chapter || 'بدون فصل') + '</span>' +
                '</div>' +
                '<div class="bg-slate-50 dark:bg-slate-700/40 p-2 rounded-2xl text-center border border-slate-100/50 dark:border-slate-600/30">' +
                '<i class="fas fa-phone-alt text-teal-400 block mb-1 text-sm"></i>' +
                '<span class="text-[11px] font-bold text-slate-600 dark:text-slate-300" dir="ltr">' + val(s.mobile) + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="absolute top-4 left-4 flex gap-2">' +
                '<button class="edit-btn bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white w-8 h-8 rounded-full transition-colors flex items-center justify-center shadow-sm" data-id="' + s.id + '" title="تعديل"><i class="fas fa-edit"></i></button>' +
                '<button class="delete-btn bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white w-8 h-8 rounded-full transition-colors flex items-center justify-center shadow-sm" data-id="' + s.id + '" title="حذف"><i class="fas fa-trash"></i></button>' +
                '</div>' +
                '</div>';
        }).join('');
    }
}

// ─── CRUD Operations ───────────────────────────────────────────────
export async function addServant(data) {
    await authReady;
    if (AppState.isLocalMode) {
        const servants = Local.servants(AppState.currentServiceName);
        data.id = 'local-' + Date.now();
        servants.push(data);
        Local.saveServants(servants, AppState.currentServiceName);
        await loadServants();
        showMessage('تم إضافة الخادم بنجاح (محلياً)!');
        return;
    }
    try {
        await addDoc(getServiceCol('servants'), data);
        showMessage('تم إضافة الخادم بنجاح ✓');
    } catch (e) {
        console.error(e);
        showMessage('فشل إضافة الخادم.', true);
    }
}

export async function updateServant(id, data) {
    await authReady;
    if (AppState.isLocalMode) {
        let servants = Local.servants(AppState.currentServiceName);
        const i = servants.findIndex(s => s.id === id);
        if (i > -1) { servants[i] = { ...servants[i], ...data }; Local.saveServants(servants, AppState.currentServiceName); }
        await loadServants();
        showMessage('تم تحديث الخادم (محلياً)!');
        return;
    }
    try {
        await updateDoc(getServiceDoc('servants', id), data);
        showMessage('تم تحديث الخادم بنجاح ✓');
    } catch (e) {
        console.error(e);
        showMessage('فشل تحديث الخادم.', true);
    }
}

export async function deleteServant(id) {
    showConfirm('تأكيد الحذف', 'هل أنت متأكد من حذف هذا الخادم؟ سيتم حذف بياناته نهائياً.', async () => {
        showLoading(true);
        try {
            if (AppState.isLocalMode) {
                let servants = Local.servants(AppState.currentServiceName).filter(s => s.id !== id);
                Local.saveServants(servants, AppState.currentServiceName);
                await loadServants();
            } else {
                await deleteDoc(getServiceDoc('servants', id));
            }
            showMessage('تم حذف الخادم.');
        } catch (e) {
            console.error(e);
            showMessage('فشل الحذف.', true);
        } finally {
            showLoading(false);
        }
    });
}

// ─── Form Handling ─────────────────────────────────────────────────
export function openAddModal() {
    DOM.manualEntryModalTitle.textContent = 'إضافة خادم جديد';
    DOM.manualEntryForm?.reset(); DOM.servantId.value = '';
    DOM.imagePreview?.classList.add('hidden-view'); openModal(DOM.manualEntryModal);
}

export function openEditModal(servantId) {
    const s = AppState.servantsCache.find(x => x.id === servantId);
    if (!s) return;
    DOM.manualEntryModalTitle.textContent = 'تعديل بيانات خادم';
    DOM.manualEntryForm?.reset();
    DOM.servantId.value = s.id;
    DOM.servantName.value = s.name || '';
    DOM.servantMobile.value = s.mobile || '';
    DOM.servantDob.value = s.dob || '';
    DOM.servantNationalId.value = s.nationalId || '';
    DOM.servantCurrentService.value = s.currentService || '';
    DOM.servantChapter.value = s.chapter || '';
    DOM.servantAddress.value = s.address || '';
    DOM.servantQualification.value = s.qualification || '';
    DOM.servantJob.value = s.job || '';
    DOM.servantConfessionFather.value = s.confessionFather || '';
    if (s.imageUrl || s.image) {
        DOM.imagePreview.src = s.imageUrl || s.image;
        DOM.imagePreview?.classList.remove('hidden-view');
    } else { DOM.imagePreview?.classList.add('hidden-view'); }
    openModal(DOM.manualEntryModal);
}

export async function handleServantFormSubmit(e) {
    e.preventDefault();
    const data = {
        name: DOM.servantName.value.trim(),
        mobile: DOM.servantMobile.value.trim(),
        dob: DOM.servantDob.value,
        nationalId: DOM.servantNationalId.value.trim(),
        currentService: DOM.servantCurrentService.value.trim(),
        chapter: DOM.servantChapter.value.trim(),
        address: DOM.servantAddress.value.trim(),
        qualification: DOM.servantQualification.value.trim(),
        job: DOM.servantJob.value.trim(),
        confessionFather: DOM.servantConfessionFather.value.trim(),
        imageUrl: DOM.imagePreview.src || '',
    };
    showLoading(true);
    try {
        if (DOM.servantId.value) await updateServant(DOM.servantId.value, data);
        else await addServant(data);
        closeModal(DOM.manualEntryModal);
    } finally { showLoading(false); }
}

export function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { DOM.imagePreview.src = ev.target.result; DOM.imagePreview.classList.remove('hidden-view'); };
    reader.readAsDataURL(file);
}

// ─── Excel Import ─────────────────────────────────────────────────
export async function handleExcelImport(e) {
    e.preventDefault();
    const file = DOM.excelFile?.files[0];
    if (!file) return;
    showLoading(true);
    try {
        const d = await file.arrayBuffer();
        const wb = XLSX.read(d, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 4 });
        const batch = rows.map(r => {
            if (!r[0]) return null;
            let dobParsed = '';
            if (r[2]) {
                const val = r[2];
                if (val instanceof Date && !isNaN(val)) {
                    dobParsed = `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
                } else if (typeof val === 'number') {
                    const parsed = new Date(Math.round((val - 25569) * 86400 * 1000));
                    if (!isNaN(parsed)) dobParsed = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
                } else {
                    const str = String(val).trim();
                    const parts = str.split(/[\/\-]/);
                    if (parts.length === 3) {
                        // Assuming DD/MM/YYYY
                        if (parts[2].length === 4) dobParsed = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        else if (parts[0].length === 4) dobParsed = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    }
                    if (!dobParsed) {
                        const fallback = new Date(str);
                        if (!isNaN(fallback)) dobParsed = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
                    }
                }
            }
            return {
                name: String(r[0]).trim(),
                mobile: r[1] ? String(r[1]).trim() : '',
                dob: dobParsed,
                nationalId: r[3] ? String(r[3]).trim() : '',
                chapter: r[4] ? String(r[4]).trim() : ''
            };
        }).filter(Boolean);
        await Promise.all(batch.map(item => addDoc(getServiceCol('servants'), item)));
        showMessage('تم استيراد ' + batch.length + ' خادم بنجاح ✓'); closeModal(DOM.importModal);
    } finally { showLoading(false); }
}

export function exportServantsToExcel() {
    const rows = [['الاسم', 'الموبايل', 'تاريخ الميلاد', 'الفصل', 'الخدمة', 'الوظيفة']];
    AppState.servantsCache.forEach(s => rows.push([s.name, s.mobile, s.dob, s.chapter, s.currentService, s.job]));
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'الخدام');
    XLSX.writeFile(wb, 'خدام.xlsx');
}

// ─── Birthdays ─────────────────────────────────────────────────────
export function displayUpcomingBirthdays() {
    const container = DOM.birthdayAlertsContainer; if (!container) return;
    container.innerHTML = '';
    const servants = AppState.isGeneralSecretaryMode ? AppState.allServantsCache : AppState.servantsCache;
    const upcoming = getUpcomingBirthdays(servants, 30);
    if (!upcoming.length) return;
    const options = upcoming.map(u => '<option value="' + u.name + '">' + u.name + '</option>').join('');
    container.innerHTML = '<div class="p-4 bg-teal-50 dark:bg-teal-900/30 border-r-4 border-teal-500 rounded-xl shadow-sm mb-6">' +
        '<div class="flex items-center gap-3 mb-3"><i class="fas fa-birthday-cake text-2xl text-pink-500"></i><h4 class="font-bold text-teal-800 dark:text-teal-200">أعياد ميلاد قادمة (30 يوم)</h4></div>' +
        '<ul class="list-disc list-inside space-y-1 mb-4 text-teal-800 dark:text-teal-200">' +
        upcoming.map(p => {
            const day = p.daysUntil === 0 ? 'اليوم! 🎉' : 'بعد ' + p.daysUntil + ' يوم';
            const svc = AppState.isGeneralSecretaryMode ? ' (' + (p.serviceName || '') + ')' : '';
            return '<li><strong>' + p.name + '</strong>' + svc + ' - ' + p.date + ' (' + day + ')</li>';
        }).join('') +
        '</ul>' +
        '<div class="pt-3 border-t border-teal-200 dark:border-teal-700">' +
        '<h5 class="font-bold text-sm mb-2 flex items-center gap-2"><i class="fas fa-magic text-yellow-500"></i> تهنئة روحية (AI)</h5>' +
        '<div class="flex flex-col sm:flex-row gap-2 mb-3">' +
        '<select id="birthdayServantSelect" class="flex-grow p-2 text-sm rounded-lg border dark:bg-slate-700 border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-400">' + options + '</select>' +
        '<button id="generateBirthdayAiBtn" class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold py-2 px-5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"><i class="fas fa-pen-fancy"></i> كتابة تهنئة</button>' +
        '</div>' +
        '<div id="aiGreetingResultArea" class="hidden-view mt-4">' +
        '<div id="greetingCardToExport" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-xl relative">' +
        '<div class="absolute -top-3 -right-3 text-3xl">🎉</div><h3 class="text-lg font-bold text-pink-600 dark:text-pink-400 mb-3 border-b pb-2">رسالة تهنئة</h3>' +
        '<div id="generatedGreetingContent" class="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-right"></div>' +
        '</div>' +
        '<div class="flex flex-wrap gap-2 mt-3 justify-end">' +
        '<button id="btnCopyGreeting" class="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><i class="fas fa-copy"></i> نسخ</button>' +
        '<button id="btnShareGreetingWhatsapp" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><i class="fab fa-whatsapp"></i> واتساب</button>' +
        '<button id="btnExportGreeting" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><i class="fas fa-image"></i> صورة</button>' +
        '<button id="btnCloseGreeting" class="bg-red-100 hover:bg-red-200 dark:bg-red-900/50 text-red-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><i class="fas fa-times"></i> إغلاق</button>' +
        '</div>' +
        '</div>' +
        '</div></div>';

    // Event binding
    let lastResponse = '';
    document.getElementById('generateBirthdayAiBtn')?.addEventListener('click', async function () {
        const name = document.getElementById('birthdayServantSelect')?.value;
        if (!name) return;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الكتابة...'; this.disabled = true;
        try {
            lastResponse = await generateBirthdayGreeting(name);
            document.getElementById('generatedGreetingContent').innerHTML = renderMarkdown(lastResponse);
            document.getElementById('aiGreetingResultArea').classList.remove('hidden-view');
        } finally { this.innerHTML = '<i class="fas fa-pen-fancy"></i> كتابة تهنئة'; this.disabled = false; }
    });
    document.getElementById('btnCopyGreeting')?.addEventListener('click', () => copyText(lastResponse));
    document.getElementById('btnShareGreetingWhatsapp')?.addEventListener('click', () => shareWhatsapp(lastResponse));
    document.getElementById('btnExportGreeting')?.addEventListener('click', () => exportCardAsImage('greetingCardToExport', 'تهنئة.png'));
    document.getElementById('btnCloseGreeting')?.addEventListener('click', () => document.getElementById('aiGreetingResultArea').classList.add('hidden-view'));
}

// ─── Servant Profile Modal ─────────────────────────────────────────
export async function showServantProfile(servantId, serviceName) {
    const svcName = serviceName || AppState.currentServiceName;
    const servant = (svcName !== AppState.currentServiceName ? AppState.allServantsCache : AppState.servantsCache).find(s => s.id === servantId);
    if (!servant) return;

    const svcConfig = SERVICES.find(s => s.name === svcName) || { color: 'teal', icon: 'fa-user-circle' };
    const color = svcConfig.color || 'teal';

    const modal = DOM.unifiedProfileModal;
    DOM.unifiedProfileModalTitle.textContent = servant.name || '';
    const today = new Date();
    const startD = today.getFullYear() + '-01-01'; const endD = today.toISOString().split('T')[0];

    const val = (data) => data || 'غير متوفر';

    DOM.unifiedProfileModalBody.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border dark:border-slate-700 mb-6">
            <!-- القسم الشخصي (ثابت) -->
            <div class="md:col-span-1 text-center">
                <img src="${getSafeSrc(servant.imageUrl || servant.image || 'https://placehold.co/120x120/E2E8F0/4A5568?text=?')}" class="w-32 h-32 rounded-full mx-auto object-cover border-4 border-teal-500 shadow-lg">
                <h4 class="text-xl font-bold text-slate-800 dark:text-white mt-3">${val(servant.name)}</h4>
                <p class="text-slate-500">${val(svcName)}</p>
                <!-- Birthday & AI feature removed from this area in old code, but we will leave old code pure layout -->
            </div>
            <div class="md:col-span-2 space-y-4">
                <div>
                    <h3 class="text-lg font-bold border-b pb-2 mb-3 text-slate-700 dark:text-slate-200">المعلومات الشخصية</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-700 dark:text-slate-300">
                        <p class="flex items-center"><i class="fas fa-mobile-alt w-5 ml-2 text-teal-600"></i><strong class="mx-1">الموبايل:</strong><span class="mr-2" dir="ltr">${val(servant.mobile)}</span></p>
                        <p class="flex items-center"><i class="fas fa-calendar-alt w-5 ml-2 text-teal-600"></i><strong class="mx-1">ت. الميلاد:</strong><span class="mr-2">${val(servant.dob)}</span></p>
                        <p class="flex items-center col-span-2"><i class="fas fa-id-card w-5 ml-2 text-teal-600"></i><strong class="mx-1">الرقم القومي:</strong><span class="mr-2">${val(servant.nationalId)}</span></p>
                        <p class="flex items-center col-span-2"><i class="fas fa-map-marker-alt w-5 ml-2 text-teal-600"></i><strong class="mx-1">العنوان:</strong><span class="mr-2">${val(servant.address)}</span></p>
                    </div>
                </div>
                <div>
                    <h3 class="text-lg font-bold border-b pb-2 mb-3 text-slate-700 dark:text-slate-200">بيانات الخدمة</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-700 dark:text-slate-300">
                        <p class="flex items-center"><i class="fas fa-briefcase w-5 ml-2 text-teal-600"></i><strong class="mx-1">الوظيفة:</strong><span class="mr-2">${val(servant.job)}</span></p>
                        <p class="flex items-center"><i class="fas fa-graduation-cap w-5 ml-2 text-teal-600"></i><strong class="mx-1">المؤهل:</strong><span class="mr-2">${val(servant.qualification)}</span></p>
                        <p class="flex items-center col-span-2"><i class="fas fa-cross w-5 ml-2 text-teal-600"></i><strong class="mx-1">أب الاعتراف:</strong><span class="mr-2">${val(servant.confessionFather)}</span></p>
                    </div>
                </div>
            </div>
        </div>
        <!-- منطقة التصدير كصورة (تتضمن الفلاتر، الإحصائيات، والرسم البياني) -->
        <div id="profileExportArea" class="mt-6 bg-white dark:bg-slate-800 rounded-xl p-2 border-2 border-transparent">
            
            <!-- Export Title Header -->
            <div class="flex flex-col items-center justify-center text-center mb-6 border-b-2 border-slate-200 dark:border-slate-700 pb-4 w-full">
                <h3 class="text-3xl font-extrabold text-teal-800 dark:text-teal-400 mb-2 text-center">${val(servant.name)}</h3>
                <p class="text-lg font-bold text-slate-600 dark:text-slate-300 mb-2 text-center">تقرير متابعة الحضور والأنشطة</p>
                <!-- Dynamic Text Date Label -->
                <div id="exportDateRangeLabel" class="mt-2 text-xl font-black text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 py-2 px-8 rounded-lg border border-indigo-200 shadow-sm text-center w-fit mx-auto" dir="rtl">
                    الفترة من: <span id="lblEnd">${endD.split('-').reverse().join('/')}</span> إلى: <span id="lblStart">${startD.split('-').reverse().join('/')}</span>
                </div>
            </div>

            <!-- قسم الفلاتر -->
            <div class="border-t dark:border-slate-700 pt-4 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg mb-6" data-html2canvas-ignore="true">
                <div class="flex flex-wrap items-end gap-4">
                    <div class="flex-1 min-w-[150px]">
                        <label class="block text-xs font-bold mb-1 text-slate-500">من تاريخ</label>
                        <input type="date" id="profileStartDate" value="${startD}" class="w-full p-2 text-sm font-bold border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600">
                    </div>
                    <div class="flex-1 min-w-[150px]">
                        <label class="block text-xs font-bold mb-1 text-slate-500">إلى تاريخ</label>
                        <input type="date" id="profileEndDate" value="${endD}" class="w-full p-2 text-sm font-bold border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600">
                    </div>
                    
                    <!-- الأزرار (يتم تجاهلها عند التصوير) -->
                    <div class="flex gap-2">
                        <button id="updateProfileStatsBtn" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all h-[38px] flex items-center justify-center">
                            <i class="fas fa-sync-alt mr-2"></i> تحديث
                        </button>
                        <button id="exportProfileImageBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all h-[38px] flex items-center justify-center" title="حفظ كصورة">
                            <i class="fas fa-camera"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- قسم الإحصائيات -->
            <div class="mt-6 mb-8">
                <h3 class="text-lg mb-4 font-bold text-slate-800 dark:text-slate-200 border-r-4 border-teal-500 pr-3">ملخص الحضور العام</h3>
                <div id="profileStatsContainer" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div class="animate-pulse flex flex-col items-center col-span-full py-10">
                        <i class="fas fa-spinner fa-spin text-2xl text-teal-400"></i>
                        <p class="mt-2 text-xs text-slate-400">جاري تحميل البيانات...</p>
                    </div>
                </div>
            </div>

            <!-- قسم الرسم البياني المرن -->
             <div class="mt-8 border-t-2 border-slate-200 dark:border-slate-700 pt-6">
                <h3 class="text-lg mb-4 font-bold text-slate-800 dark:text-slate-200 border-r-4 border-teal-500 pr-3">المعدل البياني للحضور</h3>
                <div class="relative h-80 bg-white dark:bg-slate-800 p-2 rounded-lg">
                    <canvas id="profileAttendanceChart"></canvas>
                </div>
            </div>
        </div>`;

    document.getElementById('updateProfileStatsBtn')?.addEventListener('click', () => {
        const sd = document.getElementById('profileStartDate').value;
        const ed = document.getElementById('profileEndDate').value;
        document.getElementById('lblStart').textContent = sd.split('-').reverse().join('/');
        document.getElementById('lblEnd').textContent = ed.split('-').reverse().join('/');
        _updateProfileStats(servant, svcName, sd, ed);
    });

    document.getElementById('exportProfileImageBtn')?.addEventListener('click', async () => {
        const { exportCardAsImage } = await import('./ai.js');
        exportCardAsImage('profileExportArea', `تقرير_متابعة_${servant.name.replace(/ /g, '_')}.png`);
    });

    _injectProfileNavBar(servant, svcName);
    openModal(modal);
    await _updateProfileStats(servant, svcName, startD, endD);
}

async function _updateProfileStats(servant, svcName, start, end) {
    const statsContainer = document.getElementById('profileStatsContainer'); if (!statsContainer) return;
    try {
        const { fetchFullAttendance } = await import('./attendance.js');
        const { ACTIVITIES } = await import('./config.js');
        const raw = await fetchFullAttendance(svcName || AppState.currentServiceName);
        const filtered = Object.entries(raw).map(([d, v]) => ({ date: d, ...v })).filter(d => d.date >= start && d.date <= end);
        const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');

        let overallTotal = 0;
        let overallAttended = 0;
        const monthlyStats = {};

        const actsHtml = targetActs.map(act => {
            let total = 0, attended = 0;
            const barColor = act.color ? act.color.match(/rgba\((\d+,\s*\d+,\s*\d+)/)?.[1] : '20, 184, 166'; // fallback to teal

            filtered.forEach(day => {
                if (day[act.key] && day[act.key].note == null) {
                    total++;
                    overallTotal++;
                    if (day[act.key].attendees?.includes(servant.id)) {
                        attended++;
                        overallAttended++;
                    }
                }
            });
            const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
            return `<div class="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg border dark:border-slate-600">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-sm text-slate-800 dark:text-slate-200">${act.name}</span>
                    <span class="text-xs text-slate-500">(${total})</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5 mb-2 relative overflow-hidden">
                    <div class="h-2.5 rounded-full" style="width: ${pct}%; background-color: rgb(${barColor});"></div>
                </div>
                <div class="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span>(${pct}%)</span>
                    <span class="text-slate-800 dark:text-slate-100">${attended}</span>
                </div>
            </div>`;
        }).join('');

        const overallPct = overallTotal > 0 ? Math.round((overallAttended / overallTotal) * 100) : 0;
        const overallHtml = `<div class="bg-indigo-50 dark:bg-indigo-900/40 p-3 rounded-lg border dark:border-indigo-600 shadow-sm">
            <div class="flex justify-between items-center mb-2 gap-1 overflow-hidden">
                <span class="font-bold text-sm text-indigo-800 dark:text-indigo-300 whitespace-nowrap overflow-hidden text-ellipsis">المتوسط العام</span>
                <span class="text-xs font-bold text-indigo-500 shrink-0">(${overallTotal})</span>
            </div>
            <div class="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2.5 mb-2 relative overflow-hidden">
                <div class="bg-indigo-500 h-2.5 rounded-full" style="width: ${overallPct}%"></div>
            </div>
            <div class="flex justify-between text-xs font-bold text-indigo-800 dark:text-indigo-300">
                <span>(${overallPct}%)</span>
                <span>${overallAttended}</span>
            </div>
        </div>`;

        statsContainer.innerHTML = actsHtml + overallHtml;

        // --- Chart Logic ---
        filtered.forEach(day => {
            const month = day.date.substring(0, 7); // YYYY-MM
            if (!monthlyStats[month]) monthlyStats[month] = { total: 0, attended: 0 };
            targetActs.forEach(act => {
                if (day[act.key] && day[act.key].note == null) {
                    monthlyStats[month].total++;
                    if (day[act.key].attendees?.includes(servant.id)) monthlyStats[month].attended++;
                }
            });
        });

        const sortedMonths = Object.keys(monthlyStats).sort();
        const labels = sortedMonths.map(m => {
            const d = new Date(m + '-01');
            return d.toLocaleDateString('ar-EG', { month: 'long', year: '2-digit' });
        });
        const dataPcts = sortedMonths.map(m => {
            const ms = monthlyStats[m];
            return ms.total > 0 ? Math.round((ms.attended / ms.total) * 100) : 0;
        });

        if (window.profileChartInstance) window.profileChartInstance.destroy();
        const ctx = document.getElementById('profileAttendanceChart')?.getContext('2d');
        if (ctx && window.Chart) {
            window.profileChartInstance = new window.Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'المتوسط العام للحضور',
                        data: dataPcts,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.2)',
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#4f46e5',
                        pointBorderWidth: 3,
                        pointRadius: 6,
                        tension: 0.4,
                        fill: true
                    }]
                },
                plugins: [{
                    id: 'customDataLabels',
                    afterDraw: (chart) => {
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';

                        const dataset = chart.data.datasets[0];
                        const meta = chart.getDatasetMeta(0);

                        meta.data.forEach((point, index) => {
                            const value = dataset.data[index];
                            const dateLabel = chart.data.labels[index];

                            ctx.font = 'bold 14px Tajawal, sans-serif';
                            ctx.fillStyle = '#4f46e5';
                            ctx.fillText(value + '%', point.x, point.y - 10);

                            ctx.font = 'bold 11px Tajawal, sans-serif';
                            ctx.fillStyle = '#64748b';
                            ctx.fillText(dateLabel, point.x, point.y - 28);
                        });
                        ctx.restore();
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 45 } },
                    plugins: {
                        legend: {
                            display: true,
                            labels: {
                                font: { family: 'Tajawal', size: 14, weight: 'bold' },
                                boxWidth: 20
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(30,41,59,0.9)',
                            titleFont: { family: 'Tajawal', size: 14 },
                            bodyFont: { family: 'Tajawal', size: 16, weight: 'bold' },
                            callbacks: {
                                label: function (context) { return context.parsed.y + '%'; }
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            beginAtZero: true,
                            ticks: {
                                stepSize: 10,
                                callback: function (value) { return value + '%'; },
                                font: { weight: 'bold' }
                            },
                            grid: { color: 'rgba(148,163,184,0.2)', drawBorder: false }
                        },
                        x: {
                            ticks: { font: { family: 'Tajawal', size: 12, weight: 'bold' } },
                            grid: { display: false, drawBorder: false }
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.error("Profile stats error:", e);
        statsContainer.innerHTML = 'تعذر تحميل الإحصائيات';
    }
}

function _injectProfileNavBar(currentServant, svcName) {
    const modal = DOM.unifiedProfileModal; if (!modal) return;
    modal.querySelector('#profileNavBar')?.remove();
    const list = (svcName !== AppState.currentServiceName ? AppState.allServantsCache : AppState.servantsCache).filter(s => s.name);
    if (list.length < 2) return;
    const currentIdx = list.findIndex(s => s.id === currentServant.id);
    const prev = list[currentIdx - 1], next = list[currentIdx + 1];
    const navBar = document.createElement('div');
    navBar.id = 'profileNavBar'; navBar.className = "flex items-center justify-between p-3 bg-teal-800 rounded-xl mb-4 text-white direction-rtl";
    navBar.innerHTML = '<button id="profilePrevBtn" ' + (!prev ? 'disabled' : '') + ' class="w-8 h-8 rounded-full bg-white/20"><i class="fas fa-chevron-right"></i></button>' +
        '<span class="font-bold">' + (currentIdx + 1) + ' / ' + list.length + '</span>' +
        '<button id="profileNextBtn" ' + (!next ? 'disabled' : '') + ' class="w-8 h-8 rounded-full bg-white/20"><i class="fas fa-chevron-left"></i></button>';
    DOM.unifiedProfileModalBody.before(navBar);
    document.getElementById('profilePrevBtn')?.addEventListener('click', () => prev && showServantProfile(prev.id, svcName));
    document.getElementById('profileNextBtn')?.addEventListener('click', () => next && showServantProfile(next.id, svcName));
}

export function downloadExcelTemplate() {
    try {
        const wb = XLSX.utils.book_new();
        // The import logic reads from row 5 (index 4)
        const wsData = [
            ["قالب استيراد الخدام - نظام إدارة الخدمة"],
            ["ملاحظة: لا تقم بتعديل ترتيب الأعمدة. يتم بدء القراءة من السطر الخامس."],
            [],
            [],
            ["الاسم", "الموبايل", "تاريخ الميلاد", "الرقم القومي", "الفصل"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Basic styling/column width if possible (aoa_to_sheet doesn't support complex styles directly without plugins, but we can set widths)
        ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];

        XLSX.utils.book_append_sheet(wb, ws, "الخدام");
        XLSX.writeFile(wb, "قالب_استيراد_الخدام.xlsx");
        showMessage("تم تحميل قالب الاستيراد بنجاح ✓");
    } catch (e) {
        console.error("Download template error:", e);
        showMessage("فشل تحميل القالب.", true);
    }
}

window.showServantProfile = showServantProfile;
window.openEditModal = openEditModal;
window.deleteServant = deleteServant;
window.downloadExcelTemplate = downloadExcelTemplate;
