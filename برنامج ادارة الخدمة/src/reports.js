// ==================================================================
// reports.js - All Report Types + AI Analysis
// ==================================================================

import { AppState } from './state.js';
import { ACTIVITIES, ACTIVITY_MAP, MONTHS_AR, SERVICES } from './config.js';
import { DOM, showMessage, showLoading, getPercentageColor, getPercentageBGColor, getPercentageTextColor } from './ui.js';
import { generateIndividualAnalysis, generateComprehensiveAnalysis, generatePeriodAnalysis, renderMarkdown, shareWhatsapp, exportCardAsImage } from './ai.js';
import { fetchFullAttendance } from './attendance.js';

// ─── Initialize Reports Page ───────────────────────────────────────
export async function loadReportsPage() {
    // Reset UI
    DOM.reportOutput?.classList.add('hidden-view');
    DOM.periodReportOutput?.classList.add('hidden-view');

    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    if (DOM.reportStartDate) DOM.reportStartDate.value = first.toISOString().split('T')[0];
    if (DOM.reportEndDate) DOM.reportEndDate.value = today.toISOString().split('T')[0];

    // Default tab: individual
    switchReportTab('individual');

    // Admin vs service - hide comparison tab in GS mode (not relevant)
    DOM.serviceFilterContainer?.classList.toggle('hidden-view', !AppState.isGeneralSecretaryMode);
    // GS mode: hide the service-comparison tab (comparing 2 services is not the GS workflow)
    DOM.comparisonReportTab?.classList.add('hidden-view');

    if (AppState.isGeneralSecretaryMode) {
        populateServiceFilter();
        populateComparisonSelectors();
        if (!AppState.allServantsCache.length) {
            const { loadAllServicesData } = await import('./dashboard.js');
            await loadAllServicesData();
        }
    } else {
        const att = await fetchFullAttendance(AppState.currentServiceName);
        AppState.allAttendanceCache = Object.entries(att).map(([date, data]) => ({ date, ...data }));
    }

    populateReportServantSelector();
    populatePeriodReportServantSelector();
    initPeriodComparison();

    // Activity selector
    await populateReportActivitySelector();
}

export async function populateReportActivitySelector() {
    if (!DOM.reportActivitySelector) return;
    
    // Preserve current selection if any
    const currentVal = DOM.reportActivitySelector.value;
    
    DOM.reportActivitySelector.innerHTML = '<option value="">-- اختر نشاط --</option>';
    ACTIVITIES.filter(a => a.key !== 'apology').forEach(a => {
        DOM.reportActivitySelector.innerHTML += `<option value="${a.key}">${a.name}</option>`;
    });

    // Load custom events
    let events = [];
    try {
        if (!AppState.isLocalMode) {
            const { getDocs, collection } = await import('./firebase.js');
            const snap = await getDocs(collection(AppState.db, 'services', AppState.currentServiceName, 'events'));
            events = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        } else {
            events = JSON.parse(localStorage.getItem(`events-${AppState.currentServiceName}`) || '[]');
        }
        
        if (events.length > 0) {
            events.sort((a, b) => new Date(b.date) - new Date(a.date));
            events.forEach(ev => {
                DOM.reportActivitySelector.innerHTML += `<option value="event_${ev.id}">⭐ ${ev.name} (${ev.date})</option>`;
            });
            AppState.eventsCacheForReports = events;
        }
    } catch(e) {
        console.error('Error loading events for filter:', e);
    }
    
    // Restore previous selection if still exists
    if (currentVal && Array.from(DOM.reportActivitySelector.options).some(o => o.value === currentVal)) {
        DOM.reportActivitySelector.value = currentVal;
    }
}

// ─── Tab Switching ─────────────────────────────────────────────────
export function switchReportTab(type) {
    AppState.currentReportType = type;
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-report-type="${type}"]`)?.classList.add('active');

    // Show/hide containers
    const isComparison = type === 'comparison';
    const isPeriod = type === 'period-comparison';
    const isStandard = !isComparison && !isPeriod;

    DOM.standardReportsContainer?.classList.toggle('hidden-view', !isStandard);
    DOM.comparisonReportContainer?.classList.toggle('hidden-view', !isComparison);
    DOM.periodComparisonReportContainer?.classList.toggle('hidden-view', !isPeriod);

    // Show/hide servant/activity selectors
    if (isStandard) {
        DOM.servantSelectorContainer?.classList.toggle('hidden-view', type === 'activity');
        DOM.activitySelectorContainer?.classList.toggle('hidden-view', type !== 'activity');
    }
    DOM.reportOutput?.classList.add('hidden-view');
}

// ─── Populate Selectors ────────────────────────────────────────────
export function populateReportServantSelector(list) {
    let src = list || (AppState.isGeneralSecretaryMode ? AppState.allServantsCache : AppState.servantsCache);
    if (AppState.isGeneralSecretaryMode && !list) {
        const svcFilter = DOM.reportServiceSelector?.value;
        if (svcFilter && svcFilter !== 'all') {
            src = AppState.allServantsCache.filter(s => s.serviceName === svcFilter);
        }
    }
    
    if (!DOM.reportServantSelector) return;
    DOM.reportServantSelector.innerHTML = '<option value="">-- اختر --</option><option value="all">-- كل الخدام --</option>';
    [...src].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(s => {
        const label = AppState.isGeneralSecretaryMode && s.serviceName ? `${s.name} (${s.serviceName})` : s.name;
        DOM.reportServantSelector.innerHTML += `<option value="${s.id}">${label}</option>`;
    });
}

export function populatePeriodReportServantSelector() {
    const src = AppState.isGeneralSecretaryMode ? AppState.allServantsCache : AppState.servantsCache;
    if (!DOM.periodReportServantSelector) return;
    DOM.periodReportServantSelector.innerHTML = '<option value="all">-- كل الخدام --</option>';
    [...src].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(s => {
        const label = AppState.isGeneralSecretaryMode && s.serviceName ? `${s.name} (${s.serviceName})` : s.name;
        DOM.periodReportServantSelector.innerHTML += `<option value="${s.id}">${label}</option>`;
    });
}

export function populateServiceFilter() {
    if (!DOM.reportServiceSelector) return;
    DOM.reportServiceSelector.innerHTML = '<option value="all">كل الخدمات</option>';
    // Get service names from loaded servants cache
    const names = AppState.allServantsCache.reduce((acc, s) => {
        if (s.serviceName && !acc.includes(s.serviceName)) acc.push(s.serviceName);
        return acc;
    }, []).sort((a, b) => a.localeCompare(b, 'ar'));
    names.forEach(name => {
        DOM.reportServiceSelector.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

export function populateComparisonSelectors() {
    [DOM.comparisonServiceSelector1, DOM.comparisonServiceSelector2].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        AppState.allServantsCache.reduce((names, s) => {
            if (s.serviceName && !names.includes(s.serviceName)) names.push(s.serviceName);
            return names;
        }, []).forEach(name => {
            sel.innerHTML += `<option value="${name}">${name}</option>`;
        });
    });
}

// ─── Determine Data Sources ────────────────────────────────────────
function getReportSources() {
    let attendance = AppState.allAttendanceCache;
    let servants = AppState.isGeneralSecretaryMode ? AppState.allServantsCache : AppState.servantsCache;
    let serviceName = AppState.currentServiceName;

    if (AppState.isGeneralSecretaryMode) {
        const sel = DOM.reportServiceSelector?.value;
        if (sel && sel !== 'all') {
            attendance = AppState.allAttendanceCache.filter(i => i.serviceName === sel);
            servants = AppState.allServantsCache.filter(s => s.serviceName === sel);
            serviceName = sel;
        } else {
            serviceName = 'جميع الخدمات';
        }
    }

    const start = DOM.reportStartDate?.value;
    const end = DOM.reportEndDate?.value;
    const filtered = attendance.filter(i => i.date >= start && i.date <= end);

    return { attendance: filtered, servants, serviceName, start, end };
}

// ─── GENERATE REPORT ──────────────────────────────────────────────
export async function generateReport() {
    const start = DOM.reportStartDate?.value;
    const end = DOM.reportEndDate?.value;
    if (!start || !end || start > end) { showMessage('الرجاء تحديد فترة زمنية صحيحة.', true); return; }

    const { attendance, servants, serviceName } = getReportSources();

    if (AppState.currentReportType === 'individual') {
        const servantId = DOM.reportServantSelector?.value;
        if (!servantId) { showMessage('الرجاء اختيار خادم.', true); return; }
        servantId === 'all'
            ? await displayAllServantsAvgReport(attendance, servants, serviceName)
            : await displayIndividualReport(servantId, attendance, servants);
    } else if (AppState.currentReportType === 'comprehensive') {
        const servantId = DOM.reportServantSelector?.value;
        let filteredServants = servants;
        if (servantId && servantId !== 'all') {
            filteredServants = servants.filter(s => s.id === servantId);
            if (!filteredServants.length) {
                 showMessage('هذا الخادم غير موجود في الخدمة المحددة.', true);
                 return;
            }
        }
        displayComprehensiveReport(attendance, filteredServants, serviceName);
    } else if (AppState.currentReportType === 'activity') {
        displayActivityReport(attendance, servants, serviceName);
    }
}

// ─── Helper: Report Header ─────────────────────────────────────────
function reportHeader(title, subtitle = '') {
    const s = DOM.reportStartDate?.value, e = DOM.reportEndDate?.value;
    return `<div class="mb-6 text-center border-b pb-4 dark:border-slate-700">
        <h2 class="text-2xl font-bold text-teal-700 dark:text-teal-400">${title}</h2>
        ${subtitle ? `<p class="text-lg text-slate-600 dark:text-slate-400 font-semibold mt-1">${subtitle}</p>` : ''}
        <p class="text-sm text-slate-400 mt-1">الفترة من ${s} إلى ${e}</p>
    </div>`;
}

// ─── Individual Report ─────────────────────────────────────────────
async function displayIndividualReport(servantId, data, servants) {
    const servant = servants.find(s => s.id === servantId);
    if (!servant) return;

    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const statsForAi = [];
    let cards = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">`;

    targetActs.forEach(act => {
        let attended = 0, meetings = 0;
        data.forEach(day => {
            const actData = day[act.key];
            if (actData && actData.isSpecial) return; 
            meetings++;
            if (actData?.attendees?.includes(servantId)) attended++;
        });
        const perc = meetings > 0 ? Math.round((attended/meetings)*100) : 0;
        statsForAi.push({ name: act.name, perc });
        cards += `<div class="p-4 rounded-xl ${getPercentageBGColor(perc)} border-2 border-slate-200 dark:border-slate-700">
            <div class="font-bold text-sm text-slate-600 dark:text-slate-300">${act.name}</div>
            <div class="text-3xl font-extrabold my-1 ${getPercentageTextColor(perc)}">${perc}%</div>
            <div class="text-xs text-slate-500">${attended} من ${meetings} لقاء</div>
        </div>`;
    });

    const totalPercs = statsForAi.map(s => s.perc);
    const avg = totalPercs.length ? Math.round(totalPercs.reduce((a,b)=>a+b,0)/totalPercs.length) : 0;
    cards += `<div class="text-center p-4 rounded-xl bg-indigo-100 dark:bg-indigo-900 border-2 border-indigo-500 col-span-2 md:col-span-1">
        <div class="font-bold text-lg text-indigo-700 dark:text-indigo-300">المتوسط العام</div>
        <div class="text-4xl font-extrabold my-2 text-indigo-600 dark:text-indigo-300">${avg}%</div>
    </div></div>`;

    // --- EVENTS REPORTING SECTION ---
    let eventsSectionHtml = '';
    try {
        let events = [];
        if (!AppState.isLocalMode) {
            const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            const snap = await getDocs(collection(AppState.db, 'services', servant.serviceName || AppState.currentServiceName, 'events'));
            events = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        } else {
            events = JSON.parse(localStorage.getItem(`events-${servant.serviceName || AppState.currentServiceName}`) || '[]');
        }

        const startStr = DOM.reportStartDate?.value;
        const endStr = DOM.reportEndDate?.value;
        
        // Filter events within date range
        let filteredEvents = events;
        if (startStr && endStr) {
            filteredEvents = events.filter(e => e.date && e.date >= startStr && e.date <= endStr);
        }

        if (filteredEvents.length > 0) {
            // Sort by date ascending
            filteredEvents.sort((a,b) => (a.date||'').localeCompare(b.date||''));
            let attendedEventsCount = 0;
            
            const eventsRowsHtml = filteredEvents.map(ev => {
                const attended = ev.attendees && ev.attendees.includes(servantId);
                if (attended) attendedEventsCount++;
                const statusHtml = attended 
                    ? `<span class="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-3 py-1 rounded-full font-bold text-xs"><i class="fas fa-check-circle"></i> حضر</span>`
                    : `<span class="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-3 py-1 rounded-full font-bold text-xs"><i class="fas fa-times-circle"></i> لم يحضر</span>`;
                
                return `
                    <tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td class="p-3 text-sm font-bold">${ev.name}</td>
                        <td class="p-3 text-sm"><span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-xs">${ev.type || 'أخرى'}</span></td>
                        <td class="p-3 text-sm text-slate-600 dark:text-slate-400 font-mono text-center">${ev.date || '---'}</td>
                        <td class="p-3 text-center">${statusHtml}</td>
                    </tr>
                `;
            }).join('');

            eventsSectionHtml = `
            <div class="mt-8 border-t dark:border-slate-700 pt-8">
                <h3 class="text-xl font-bold text-violet-700 dark:text-violet-400 mb-4 flex items-center justify-between">
                    <span><i class="fas fa-star mr-2"></i> سجل الأنشطة الخاصة</span>
                    <span class="text-sm font-bold bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 px-4 py-1.5 rounded-full">
                        حضر ${attendedEventsCount} من المجموع ${filteredEvents.length}
                    </span>
                </h3>
                <div class="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <table class="w-full text-right">
                        <thead class="bg-slate-100 dark:bg-slate-800/80">
                            <tr>
                                <th class="p-3 font-black text-slate-700 dark:text-slate-300">اسم النشاط</th>
                                <th class="p-3 font-black text-slate-700 dark:text-slate-300">النوع</th>
                                <th class="p-3 font-black text-slate-700 dark:text-slate-300 text-center">التاريخ</th>
                                <th class="p-3 font-black text-slate-700 dark:text-slate-300 text-center">الحضور</th>
                            </tr>
                        </thead>
                        <tbody>${eventsRowsHtml}</tbody>
                    </table>
                </div>
            </div>`;
        }
    } catch(e) { console.error('Error loading events for report:', e); }

    const aiSection = `
        <div class="mt-8 pt-6 border-t dark:border-slate-700 text-center">
            <button id="aiAnalysisBtn"
                class="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all hover:scale-105 inline-flex items-center gap-2">
                <i class="fas fa-magic text-yellow-300"></i> تحليل الأداء وتشجيع الخادم (AI)
            </button>
            <div id="aiAnalysisResult" class="hidden-view mt-6 text-right max-w-2xl mx-auto">
                <div id="aiMsgCard" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-2xl relative">
                    <div class="absolute -top-3 -right-3 text-4xl">✨</div>
                    <h3 class="text-xl font-bold text-teal-700 dark:text-teal-400 mb-4 border-b pb-2">رسالة خاصة للخادم</h3>
                    <div id="aiAnalysisContent" class="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed mb-6 whitespace-pre-line"></div>
                    <div class="flex gap-3 justify-end border-t pt-4 dark:border-slate-700" data-html2canvas-ignore="true">
                        <button id="shareAiWhatsapp" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><i class="fab fa-whatsapp"></i> واتساب</button>
                        <button id="saveAiImage" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><i class="fas fa-image"></i> حفظ كصورة</button>
                    </div>
                </div>
            </div>
        </div>`;

    DOM.reportContent.innerHTML = reportHeader('تقرير الحضور الفردي', servant.name) + cards + eventsSectionHtml + aiSection;
    DOM.reportOutput?.classList.remove('hidden-view');

    let lastAiText = '';
    document.getElementById('aiAnalysisBtn')?.addEventListener('click', async function() {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الكتابة...';
        this.disabled = true;
        try {
            lastAiText = await generateIndividualAnalysis(servant.name, statsForAi, avg);
            document.getElementById('aiAnalysisContent').innerHTML = renderMarkdown(lastAiText);
            document.getElementById('aiAnalysisResult').classList.remove('hidden-view');
            document.getElementById('aiAnalysisResult').scrollIntoView({ behavior: 'smooth' });
        } catch (e) { showMessage(e.message || 'خطأ في الذكاء الاصطناعي', true); }
        finally { this.innerHTML = '<i class="fas fa-magic text-yellow-300"></i> تحليل الأداء وتشجيع الخادم (AI)'; this.disabled = false; }
    });
    document.getElementById('shareAiWhatsapp')?.addEventListener('click', () => shareWhatsapp(lastAiText));
    document.getElementById('saveAiImage')?.addEventListener('click', () => exportCardAsImage('aiMsgCard', `تحليل_${servant.name}.png`));
}

// ─── All Servants Average Report ──────────────────────────────────
function displayAllServantsAvgReport(data, servants, serviceName) {
    if (!servants.length) { showMessage('لا يوجد خدام في الفترة المحددة.', true); return; }
    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const rows = servants.map(s => {
        const percs = targetActs.map(act => {
            let attended = 0, meetings = 0;
            data.forEach(day => {
                const actData = day[act.key];
                if (actData && actData.isSpecial) return; // Special day exception

                meetings++;
                if (actData?.attendees?.includes(s.id)) attended++;
            });
            return meetings > 0 ? Math.round((attended/meetings)*100) : 0;
        });
        const avg = percs.length ? Math.round(percs.reduce((a,b)=>a+b,0)/percs.length) : 0;
        return { ...s, percs, avg };
    }).sort((a, b) => b.avg - a.avg);

    let table = `<div class="overflow-x-auto rounded-xl border dark:border-slate-700">
        <table class="w-full text-right min-w-[800px] border-collapse dark:text-slate-200">
        <thead class="bg-slate-50 dark:bg-slate-800/80">
        <tr><th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">الخادم</th>
        ${targetActs.map(a => `<th class="p-3 font-bold text-center border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">${a.name}</th>`).join('')}
        <th class="p-3 font-bold text-center border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">المتوسط</th></tr></thead><tbody>`;

    rows.forEach(r => {
        table += `<tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
            <td class="p-3 font-semibold">${r.name}</td>
            ${r.percs.map(p => `<td class="p-3 text-center font-bold ${getPercentageTextColor(p)}">${p}%</td>`).join('')}
            <td class="p-3 text-center font-extrabold text-teal-600 dark:text-teal-400">${r.avg}%</td>
        </tr>`;
    });
    table += `</tbody></table></div>`;

    DOM.reportContent.innerHTML = reportHeader('متوسط حضور جميع الخدام', serviceName) + table;
    DOM.reportOutput?.classList.remove('hidden-view');
}

// ─── Comprehensive Report ─────────────────────────────────────────
function displayComprehensiveReport(data, servants, serviceName) {
    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const rows = servants.map(s => {
        const percs = targetActs.map(act => {
            let attended = 0, meetings = 0;
            data.forEach(day => {
                const actData = day[act.key];
                if (actData && actData.isSpecial) return; // Special day exception

                meetings++;
                if (actData?.attendees?.includes(s.id)) attended++;
            });
            return meetings > 0 ? Math.round((attended/meetings)*100) : 0;
        });
        const avg = percs.length ? Math.round(percs.reduce((a,b)=>a+b,0)/percs.length) : 0;
        return { ...s, percs, avg };
    }).sort((a, b) => {
        const sc = (a.serviceName||'').localeCompare(b.serviceName||'', 'ar');
        return sc !== 0 ? sc : (a.name||'').localeCompare(b.name||'', 'ar');
    });

    let table = `<div class="overflow-x-auto rounded-xl border dark:border-slate-700 mb-6">
        <table class="w-full text-right min-w-[1000px] border-collapse dark:text-slate-200">
        <thead class="bg-slate-50 dark:bg-slate-800/80 sticky top-0">
        <tr>
            <th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">الخادم</th>
            <th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">الخدمة</th>
            ${targetActs.map(a => `<th class="p-3 font-bold text-center border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">${a.name}</th>`).join('')}
            <th class="p-3 font-bold text-center border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">المتوسط</th>
        </tr></thead><tbody>`;

    const allAvgs = [];
    rows.forEach(r => {
        allAvgs.push(r.avg);
        table += `<tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <td class="p-3 font-semibold">${r.name}</td>
            <td class="p-3 text-sm text-slate-500">${r.serviceName||'-'}</td>
            ${r.percs.map(p => `<td class="p-3 text-center font-bold ${getPercentageTextColor(p)}">${p}%</td>`).join('')}
            <td class="p-3 text-center font-extrabold text-teal-600 dark:text-teal-400 bg-slate-50 dark:bg-slate-800/30">${r.avg}%</td>
        </tr>`;
    });
    table += `</tbody></table></div>`;

    const overallAvg = allAvgs.length ? Math.round(allAvgs.reduce((a,b)=>a+b,0)/allAvgs.length) : 0;
    const top3 = rows.sort((a,b)=>b.avg-a.avg).slice(0,3).map(r=>r.name);
    const low3 = rows.sort((a,b)=>a.avg-b.avg).slice(0,3).map(r=>r.name);

    const aiSection = `
        <div class="mt-6 pt-4 border-t dark:border-slate-700 text-center">
            <button id="aiCompAnalysisBtn"
                class="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all hover:scale-105 inline-flex items-center gap-2">
                <i class="fas fa-chart-line text-yellow-300"></i> تحليل التقرير الشامل (AI)
            </button>
            <div id="aiCompResult" class="hidden-view mt-6 text-right max-w-2xl mx-auto">
                <div id="aiCompCard" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-2xl relative">
                    <div class="absolute -top-3 -right-3 text-4xl">📊</div>
                    <h3 class="text-xl font-bold text-emerald-700 dark:text-emerald-400 mb-4 border-b pb-2">التقرير التحليلي</h3>
                    <div id="aiCompContent" class="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed mb-4 whitespace-pre-line"></div>
                    <div class="flex gap-3 justify-end border-t pt-4 dark:border-slate-700" data-html2canvas-ignore="true">
                        <button id="shareCompWhatsapp" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><i class="fab fa-whatsapp"></i> واتساب</button>
                        <button id="saveCompImage" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><i class="fas fa-image"></i> حفظ كصورة</button>
                    </div>
                </div>
            </div>
        </div>`;

    DOM.reportContent.innerHTML = reportHeader('التقرير الشامل', serviceName) + table + aiSection;
    DOM.reportOutput?.classList.remove('hidden-view');

    let lastAiText2 = '';
    document.getElementById('aiCompAnalysisBtn')?.addEventListener('click', async function() {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل...';
        this.disabled = true;
        try {
            lastAiText2 = await generateComprehensiveAnalysis(serviceName, overallAvg, top3, low3, {
                start: DOM.reportStartDate?.value, end: DOM.reportEndDate?.value
            });
            document.getElementById('aiCompContent').innerHTML = renderMarkdown(lastAiText2);
            document.getElementById('aiCompResult').classList.remove('hidden-view');
            document.getElementById('aiCompResult').scrollIntoView({ behavior: 'smooth' });
        } catch(e) { showMessage(e.message||'خطأ في التحليل', true); }
        finally {
            this.innerHTML = '<i class="fas fa-chart-line text-yellow-300"></i> تحليل التقرير الشامل (AI)';
            this.disabled = false;
        }
    });
    document.getElementById('shareCompWhatsapp')?.addEventListener('click', ()=>shareWhatsapp(lastAiText2));
    document.getElementById('saveCompImage')?.addEventListener('click', ()=>exportCardAsImage('aiCompCard','التقرير_الشامل.png'));
}

// ─── Activity Report ──────────────────────────────────────────────
function displayActivityReport(data, servants, serviceName) {
    const actKey = DOM.reportActivitySelector?.value;
    if (!actKey) { showMessage('الرجاء اختيار نشاط', true); return; }
    
    let actName = '';
    let rows = [];

    if (actKey.startsWith('event_')) {
        const eventId = actKey.replace('event_', '');
        const ev = AppState.eventsCacheForReports?.find(e => e.id === eventId);
        if (!ev) { showMessage('تعذر العثور على بيانات النشاط الخاص', true); return; }
        
        actName = ev.name;
        const attendees = ev.attendees || [];
        rows = [{
            date: ev.date || 'غير محدد',
            count: attendees.length,
            total: servants.length,
            pct: servants.length ? Math.round((attendees.length / servants.length) * 100) : 0
        }];
    } else {
        const act = ACTIVITY_MAP.get(actKey);
        actName = act.name;
        rows = data.filter(d => d[actKey] && !d[actKey].isSpecial)
            .map(d => {
                const attendees = d[actKey].attendees || [];
                return {
                    date: d.date,
                    count: attendees.length,
                    total: servants.length,
                    pct: servants.length ? Math.round((attendees.length / servants.length) * 100) : 0
                };
            }).sort((a, b) => a.date.localeCompare(b.date));
    }

    if (!rows.length) { showMessage('لا توجد بيانات لهذا النشاط في الفترة المحددة.', true); return; }

    const avgPct = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0;
    const maxRow = rows.reduce((a, b) => b.pct > a.pct ? b : a, rows[0]);
    const minRow = rows.reduce((a, b) => b.pct < a.pct ? b : a, rows[0]);
    const trend = rows.length >= 2 ? (rows[rows.length - 1].pct - rows[0].pct) : 0;
    const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
    const trendColor = trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-slate-500';

    // KPI Cards
    const kpiHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm text-center">
                <span class="text-3xl font-extrabold ${getPercentageTextColor(avgPct)}">${avgPct}%</span>
                <p class="text-xs text-slate-400 font-bold mt-1">متوسط الحضور</p>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm text-center">
                <span class="text-3xl font-extrabold text-slate-700 dark:text-slate-200">${rows.length}</span>
                <p class="text-xs text-slate-400 font-bold mt-1">عدد الجمعات</p>
            </div>
            <div class="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 border border-green-100 dark:border-green-800 shadow-sm text-center">
                <span class="text-xl font-extrabold text-green-600 dark:text-green-400">${maxRow.pct}%</span>
                <p class="text-xs text-green-500 font-bold mt-1">الأعلى حضوراً</p>
                <p class="text-[10px] text-slate-400">${maxRow.date}</p>
            </div>
            <div class="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-100 dark:border-red-800 shadow-sm text-center">
                <span class="text-xl font-extrabold text-red-500 dark:text-red-400">${minRow.pct}%</span>
                <p class="text-xs text-red-500 font-bold mt-1">الأقل حضوراً</p>
                <p class="text-[10px] text-slate-400">${minRow.date}</p>
            </div>
        </div>`;

    // Line Chart
    const chartHtml = `
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm mb-6">
            <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-slate-700 dark:text-slate-300 text-sm">منحنى الحضور عبر الزمن</h3>
                <span class="text-sm font-bold ${trendColor}">${trendIcon} ${Math.abs(trend)}% اتجاه</span>
            </div>
            <div class="relative h-48">
                <canvas id="activityLineChart"></canvas>
            </div>
        </div>`;

    // Rows Table with progress bars
    let tableRows = '';
    rows.forEach((r, i) => {
        const barColor = r.pct >= 80 ? 'bg-green-500' : r.pct >= 60 ? 'bg-yellow-400' : r.pct >= 40 ? 'bg-orange-400' : 'bg-red-500';
        tableRows += `
            <tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td class="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">${i + 1}</td>
                <td class="p-3 font-bold">${r.date}</td>
                <td class="p-3 text-center font-bold text-slate-700 dark:text-slate-300">${r.count} / ${r.total}</td>
                <td class="p-3 min-w-[120px]">
                    <div class="flex items-center gap-2">
                        <div class="flex-grow h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full rounded-full ${barColor}" style="width:${r.pct}%"></div>
                        </div>
                        <span class="text-xs font-extrabold ${getPercentageTextColor(r.pct)} w-10 text-left">${r.pct}%</span>
                    </div>
                </td>
            </tr>`;
    });

    const tableHtml = `
        <div class="overflow-x-auto rounded-xl border dark:border-slate-700">
            <table class="w-full text-right min-w-[500px] border-collapse dark:text-slate-200">
            <thead class="bg-slate-50 dark:bg-slate-800/80">
            <tr>
                <th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300 w-10">#</th>
                <th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">التاريخ</th>
                <th class="p-3 font-bold text-center border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">الحضور</th>
                <th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">النسبة</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
            </table>
        </div>`;

    DOM.reportContent.innerHTML = reportHeader(`تقرير نشاط: ${actName}`, serviceName) + kpiHtml + chartHtml + tableHtml;
    DOM.reportOutput?.classList.remove('hidden-view');

    // Draw the line chart
    setTimeout(() => {
        const ctx = document.getElementById('activityLineChart')?.getContext('2d');
        if (!ctx || !window.Chart) return;
        if (AppState.charts.activity) AppState.charts.activity.destroy();
        AppState.charts.activity = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: rows.map(r => r.date),
                datasets: [{
                    label: 'نسبة الحضور %',
                    data: rows.map(r => r.pct),
                    borderColor: '#0d9488',
                    backgroundColor: 'rgba(13,148,136,0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: rows.map(r => r.pct >= 80 ? '#22c55e' : r.pct >= 60 ? '#eab308' : r.pct >= 40 ? '#f97316' : '#ef4444'),
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    fill: true,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw}% (${rows[ctx.dataIndex].count}/${rows[ctx.dataIndex].total})` } } },
                scales: {
                    y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }
                }
            }
        });
    }, 50);
}

// ─── Period Comparison Report ─────────────────────────────────────
export function initPeriodComparison() {
    AppState.periodCount = 0;
    const container = DOM.periodsContainer;
    if (!container) return;
    container.innerHTML = '';
    // Add default 2 periods
    const today = new Date();
    addPeriodRow(
        new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0],
        new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0]
    );
    addPeriodRow(
        new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        today.toISOString().split('T')[0]
    );
}

export function addPeriodRow(start = '', end = '') {
    AppState.periodCount++;
    const id = `period-${Date.now()}-${AppState.periodCount}`;
    const colors = ['blue', 'emerald', 'purple', 'orange', 'rose'];
    const color = colors[(AppState.periodCount - 1) % colors.length];
    const div = document.createElement('div');
    div.id = id;
    div.className = 'period-row p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border dark:border-slate-600 relative';
    div.innerHTML = `
        <div class="flex justify-between items-center mb-3 border-b border-${color}-200 dark:border-${color}-800 pb-2">
            <h3 class="font-bold text-${color}-600 dark:text-${color}-400">الفترة ${AppState.periodCount}</h3>
            <button type="button" onclick="document.getElementById('${id}').remove()"
                class="text-red-500 hover:text-red-700 text-sm"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div><label class="block mb-1 text-sm text-slate-500">من:</label>
                <input type="date" class="period-start w-full p-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600" value="${start}"></div>
            <div><label class="block mb-1 text-sm text-slate-500">إلى:</label>
                <input type="date" class="period-end w-full p-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600" value="${end}"></div>
        </div>`;
    DOM.periodsContainer?.appendChild(div);
}

export function generatePeriodComparisonReport() {
    const periods = [...document.querySelectorAll('.period-row')].map(row => ({
        start: row.querySelector('.period-start')?.value,
        end: row.querySelector('.period-end')?.value,
        label: row.querySelector('h3')?.textContent || ''
    })).filter(p => p.start && p.end);

    if (periods.length < 2) { showMessage('الرجاء إضافة فترتين على الأقل.', true); return; }

    const servantId = DOM.periodReportServantSelector?.value;
    const src = AppState.isGeneralSecretaryMode ? AppState.allServantsCache : AppState.servantsCache;
    const servants = servantId === 'all' ? src : [src.find(s => s.id === servantId)].filter(Boolean);
    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    const COLORS = ['rgba(59,130,246,1)', 'rgba(16,185,129,1)', 'rgba(139,92,246,1)', 'rgba(249,115,22,1)', 'rgba(236,72,153,1)'];

    // Build data per period per activity
    const periodData = periods.map((period, i) => {
        const actPcts = targetActs.map(act => {
            let attended = 0, meetings = 0;
            const cache = AppState.isGeneralSecretaryMode ? AppState.allAttendanceCache : AppState.allAttendanceCache;
            cache.forEach(day => {
                if (day.date >= period.start && day.date <= period.end) {
                    const actData = day[act.key];
                    if (actData && actData.isSpecial) return;
                    meetings++;
                    servants.forEach(s => { if (actData?.attendees?.includes(s.id)) attended++; });
                }
            });
            return { act: act.name, key: act.key, pct: meetings > 0 ? Math.round((attended / (meetings * servants.length)) * 100) : 0, sessions: meetings };
        });
        const avgPct = actPcts.length ? Math.round(actPcts.reduce((a, b) => a + b.pct, 0) / actPcts.length) : 0;
        return { ...period, color: COLORS[i % COLORS.length], actPcts, avgPct };
    });

    // Summary table rows
    let summaryRows = '';
    targetActs.forEach((act, j) => {
        const cells = periodData.map(pd => {
            const item = pd.actPcts[j];
            const color = item.pct >= 80 ? 'text-green-600' : item.pct >= 60 ? 'text-yellow-600' : item.pct >= 40 ? 'text-orange-500' : 'text-red-500';
            return `<td class="p-3 text-center font-extrabold ${color}">${item.pct}%<br><span class="text-[10px] text-slate-400 font-normal">(${item.sessions} جلسة)</span></td>`;
        }).join('');
        summaryRows += `<tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30"><td class="p-3 font-bold text-slate-700 dark:text-slate-300">${act.name}</td>${cells}</tr>`;
    });
    // Average row
    const avgCells = periodData.map(pd => {
        const c = pd.avgPct >= 80 ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : pd.avgPct >= 60 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700' : 'bg-red-100 dark:bg-red-900/30 text-red-600';
        return `<td class="p-3 text-center"><span class="px-3 py-1 rounded-full text-sm font-extrabold ${c}">${pd.avgPct}%</span></td>`;
    }).join('');
    summaryRows += `<tr class="bg-slate-50 dark:bg-slate-800/50"><td class="p-3 font-extrabold text-slate-800 dark:text-slate-200">المتوسط العام</td>${avgCells}</tr>`;

    // Period headers for summary table
    const periodHeaders = periodData.map(pd =>
        `<th class="p-3 text-center font-bold border-b dark:border-slate-700" style="color:${pd.color}">${pd.label}<br><span class="text-[10px] font-normal text-slate-400">${pd.start} → ${pd.end}</span></th>`
    ).join('');

    const output = DOM.periodReportOutput;
    if (!output) { console.error('periodReportOutput element not found'); return; }

    const aiSection = `
            <!-- AI Analysis for Period Comparison -->
            <div class="mt-6 pt-4 border-t dark:border-slate-700 text-center">
                <button id="aiPeriodAnalysisBtn"
                    class="bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-700 hover:to-indigo-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all hover:scale-105 inline-flex items-center gap-2">
                    <i class="fas fa-brain text-yellow-300"></i> تحليل مقارنة الفترات (AI)
                </button>
                <div id="aiPeriodResult" class="hidden-view mt-6 text-right max-w-2xl mx-auto">
                    <div id="aiPeriodCard" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-2xl relative">
                        <div class="absolute -top-3 -right-3 text-4xl">📈</div>
                        <h3 class="text-xl font-bold text-violet-700 dark:text-violet-400 mb-4 border-b pb-2">تحليل مقارنة الفترات</h3>
                        <div id="aiPeriodContent" class="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed mb-4 whitespace-pre-line"></div>
                        <div class="flex gap-3 justify-end border-t pt-4 dark:border-slate-700" data-html2canvas-ignore="true">
                            <button id="sharePeriodWhatsapp" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><i class="fab fa-whatsapp"></i> واتساب</button>
                            <button id="savePeriodImage" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><i class="fas fa-image"></i> حفظ كصورة</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    output.innerHTML = `
        <div class="space-y-6">
            <!-- Chart -->
            <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm">
                <h3 class="font-bold text-slate-700 dark:text-slate-300 mb-4 text-sm border-r-4 border-teal-500 pr-3">مقارنة الأنشطة عبر الفترات</h3>
                <div class="relative h-64">
                    <canvas id="periodComparisonChart"></canvas>
                </div>
            </div>
            <!-- Summary Table -->
            <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <h3 class="font-bold text-slate-700 dark:text-slate-300 p-4 pb-0 text-sm border-r-4 border-indigo-500 pr-3">جدول تفصيلي للمقارنة</h3>
                <div class="overflow-x-auto mt-3">
                    <table class="w-full text-right border-collapse dark:text-slate-200 min-w-[500px]">
                        <thead class="bg-slate-50 dark:bg-slate-800/80">
                            <tr>
                                <th class="p-3 font-bold border-b dark:border-slate-700 text-slate-700 dark:text-slate-300">النشاط</th>
                                ${periodHeaders}
                            </tr>
                        </thead>
                        <tbody>${summaryRows}</tbody>
                    </table>
                </div>
            </div>
            ${aiSection}`;
    output.classList.remove('hidden-view');

    // AI Period Analysis button
    let lastAiPeriodText = '';
    document.getElementById('aiPeriodAnalysisBtn')?.addEventListener('click', async function() {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل...';
        this.disabled = true;
        try {
            lastAiPeriodText = await generatePeriodAnalysis(periodData);
            document.getElementById('aiPeriodContent').innerHTML = renderMarkdown(lastAiPeriodText);
            document.getElementById('aiPeriodResult').classList.remove('hidden-view');
            document.getElementById('aiPeriodResult').scrollIntoView({ behavior: 'smooth' });
        } catch (e) { showMessage(e.message || 'خطأ في التحليل', true); }
        finally {
            this.innerHTML = '<i class="fas fa-brain text-yellow-300"></i> تحليل مقارنة الفترات (AI)';
            this.disabled = false;
        }
    });
    document.getElementById('sharePeriodWhatsapp')?.addEventListener('click', () => shareWhatsapp(lastAiPeriodText));
    document.getElementById('savePeriodImage')?.addEventListener('click', () => exportCardAsImage('aiPeriodCard', 'تحليل_الفترات.png'));

    // Draw bar chart
    setTimeout(() => {
        const ctx = document.getElementById('periodComparisonChart')?.getContext('2d');
        if (!ctx || !window.Chart) return;
        if (AppState.charts.comparison) AppState.charts.comparison.destroy();
        AppState.charts.comparison = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: targetActs.map(a => a.name),
                datasets: periodData.map(pd => ({
                    label: `${pd.label} (${pd.start} → ${pd.end})`,
                    data: pd.actPcts.map(a => a.pct),
                    backgroundColor: pd.color.replace(',1)', ',0.75)'),
                    borderColor: pd.color,
                    borderWidth: 1.5,
                    borderRadius: 6
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { font: { family: 'Tajawal', size: 11 }, padding: 16 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}%` } }
                },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.1)' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }, 50);
}

// ─── Helper: Get report filename ─────────────────────────────────
function getReportFileName(ext) {
    const date = new Date().toISOString().slice(0, 10);
    // Get report type from active tab
    const activeTab = document.querySelector('.report-tab.active');
    const typeMap = { individual: 'فردي', comprehensive: 'شامل', activity: 'نشاط', comparison: 'مقارنة', 'period-comparison': 'فترات' };
    const reportType = typeMap[activeTab?.dataset?.reportType] || 'تقرير';
    // Try to get servant or service name from report heading
    const headingEl = DOM.reportContent?.querySelector('h2, h3');
    let name = '';
    if (headingEl) {
        // Get the second line which is usually the servant name
        const lines = DOM.reportContent.querySelectorAll('h2, h3, p');
        for (const line of lines) {
            const text = line.textContent.trim();
            if (text && !text.includes('تقرير') && !text.includes('الفترة') && text.length > 2 && text.length < 50) {
                name = text.replace(/[\\/:*?"<>|]/g, '').trim();
                break;
            }
        }
    }
    const namePart = name ? `_${name.replace(/\s+/g, '_')}` : '';
    return `تقرير_${reportType}${namePart}_${date}.${ext}`;
}

// ─── Export PDF ───────────────────────────────────────────────────
export async function exportToPDF() {
    const el = DOM.reportContent;
    if (!el || typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') return;
    showLoading(true);
    try {
        const canvas = await html2canvas(el, { scale: 1.5, useCORS: true });
        const { jsPDF } = jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height * w) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, w, h);
        pdf.save(getReportFileName('pdf'));
        showMessage('تم تصدير PDF ✓');
    } catch (e) { console.error(e); showMessage('فشل التصدير.', true); }
    finally { showLoading(false); }
}

export async function exportToPNG() {
    const el = DOM.reportContent;
    if (!el || typeof html2canvas === 'undefined') return;
    showLoading(true);
    try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true });
        const a = document.createElement('a');
        a.download = getReportFileName('png');
        a.href = canvas.toDataURL('image/png');
        a.click();
        showMessage('تم تصدير الصورة ✓');
    } catch (e) { console.error(e); showMessage('فشل التصدير.', true); }
    finally { showLoading(false); }
}
