// ==================================================================
// reports.js - All Report Types + AI Analysis
// ==================================================================

import { AppState } from './state.js';
import { ACTIVITIES, ACTIVITY_MAP, MONTHS_AR, SERVICES } from './config.js';
import { DOM, showMessage, showLoading, getPercentageColor, getPercentageBGColor, getPercentageTextColor } from './ui.js';
import { generateIndividualAnalysis, generateComprehensiveAnalysis, renderMarkdown, shareWhatsapp, exportCardAsImage } from './ai.js';
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

    // Admin vs service
    DOM.serviceFilterContainer?.classList.toggle('hidden-view', !AppState.isGeneralSecretaryMode);
    DOM.comparisonReportTab?.classList.toggle('hidden-view', !AppState.isGeneralSecretaryMode);

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
    if (DOM.reportActivitySelector) {
        DOM.reportActivitySelector.innerHTML = '<option value="">-- اختر نشاط --</option>';
        ACTIVITIES.filter(a => a.key !== 'apology').forEach(a => {
            DOM.reportActivitySelector.innerHTML += `<option value="${a.key}">${a.name}</option>`;
        });
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
export function generateReport() {
    const start = DOM.reportStartDate?.value;
    const end = DOM.reportEndDate?.value;
    if (!start || !end || start > end) { showMessage('الرجاء تحديد فترة زمنية صحيحة.', true); return; }

    const { attendance, servants, serviceName } = getReportSources();

    if (AppState.currentReportType === 'individual') {
        const servantId = DOM.reportServantSelector?.value;
        if (!servantId) { showMessage('الرجاء اختيار خادم.', true); return; }
        servantId === 'all'
            ? displayAllServantsAvgReport(attendance, servants, serviceName)
            : displayIndividualReport(servantId, attendance, servants);
    } else if (AppState.currentReportType === 'comprehensive') {
        displayComprehensiveReport(attendance, servants, serviceName);
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
function displayIndividualReport(servantId, data, servants) {
    const servant = servants.find(s => s.id === servantId);
    if (!servant) return;

    const stats = {}, statsForAi = {};
    const targetActs = ACTIVITIES.filter(a => a.key !== 'apology');
    targetActs.forEach(a => { stats[a.key] = { total: 0, attended: 0 }; });

    data.forEach(day => {
        targetActs.forEach(act => {
            const d = day[act.key];
            if (d && d.note == null) {
                stats[act.key].total++;
                if (d.attendees?.includes(servantId)) stats[act.key].attended++;
            }
        });
    });

    const percentages = targetActs.map(act => {
        const { total, attended } = stats[act.key];
        const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
        statsForAi[act.name] = `${pct}%`;
        return pct;
    });
    const avg = percentages.length ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0;

    let cards = `<div class="grid grid-cols-2 md:grid-cols-3 gap-4">`;
    targetActs.forEach((act, i) => {
        const pct = percentages[i];
        const { total, attended } = stats[act.key];
        cards += `<div class="text-center p-4 rounded-xl ${getPercentageBGColor(pct)}">
            <div class="font-bold text-lg">${act.name}</div>
            <div class="text-4xl font-extrabold my-2">${pct}%</div>
            <div class="text-sm opacity-70">(${attended} من ${total})</div>
            <div class="w-full bg-white/50 rounded-full h-2 mt-2">
                <div class="${getPercentageColor(pct)} h-2 rounded-full" style="width:${pct}%"></div>
            </div>
        </div>`;
    });
    cards += `<div class="text-center p-4 rounded-xl bg-indigo-100 dark:bg-indigo-900 border-2 border-indigo-500 col-span-2 md:col-span-1">
        <div class="font-bold text-lg text-indigo-700 dark:text-indigo-300">المتوسط العام</div>
        <div class="text-4xl font-extrabold my-2 text-indigo-600 dark:text-indigo-300">${avg}%</div>
    </div></div>`;

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

    DOM.reportContent.innerHTML = reportHeader('تقرير الحضور الفردي', servant.name) + cards + aiSection;
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
                if (day[act.key]?.note == null && day[act.key]) {
                    meetings++;
                    if (day[act.key].attendees?.includes(s.id)) attended++;
                }
            });
            return meetings > 0 ? Math.round((attended/meetings)*100) : 0;
        });
        const avg = percs.length ? Math.round(percs.reduce((a,b)=>a+b,0)/percs.length) : 0;
        return { ...s, percs, avg };
    }).sort((a, b) => b.avg - a.avg);

    let table = `<div class="overflow-x-auto rounded-xl border dark:border-slate-700">
        <table class="w-full text-right min-w-[800px] border-collapse">
        <thead class="bg-slate-50 dark:bg-slate-700">
        <tr><th class="p-3 font-bold border-b dark:border-slate-600">الخادم</th>
        ${targetActs.map(a => `<th class="p-3 font-bold text-center border-b dark:border-slate-600">${a.name}</th>`).join('')}
        <th class="p-3 font-bold text-center border-b dark:border-slate-600">المتوسط</th></tr></thead><tbody>`;

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
                if (day[act.key]?.note == null && day[act.key]) {
                    meetings++;
                    if (day[act.key].attendees?.includes(s.id)) attended++;
                }
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
        <table class="w-full text-right min-w-[1000px] border-collapse">
        <thead class="bg-slate-50 dark:bg-slate-700 sticky top-0">
        <tr>
            <th class="p-3 font-bold border-b dark:border-slate-600">الخادم</th>
            <th class="p-3 font-bold border-b dark:border-slate-600">الخدمة</th>
            ${targetActs.map(a => `<th class="p-3 font-bold text-center border-b dark:border-slate-600">${a.name}</th>`).join('')}
            <th class="p-3 font-bold text-center border-b dark:border-slate-600">المتوسط</th>
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
    const act = ACTIVITY_MAP.get(actKey);

    const rows = data.filter(d => d[actKey]?.note == null && d[actKey])
        .map(d => {
            const attendees = d[actKey]?.attendees || [];
            return {
                date: d.date,
                count: attendees.length,
                total: servants.length,
                pct: servants.length ? Math.round((attendees.length / servants.length) * 100) : 0
            };
        }).sort((a, b) => a.date.localeCompare(b.date));

    if (!rows.length) { showMessage('لا توجد بيانات لهذا النشاط في الفترة المحددة.', true); return; }

    let table = `<div class="overflow-x-auto rounded-xl border dark:border-slate-700">
        <table class="w-full text-right min-w-[500px] border-collapse">
        <thead class="bg-slate-50 dark:bg-slate-700">
        <tr>
            <th class="p-3 font-bold border-b dark:border-slate-600">التاريخ</th>
            <th class="p-3 font-bold text-center border-b dark:border-slate-600">الحضور</th>
            <th class="p-3 font-bold text-center border-b dark:border-slate-600">النسبة</th>
        </tr></thead><tbody>`;

    rows.forEach(r => {
        table += `<tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
            <td class="p-3">${r.date}</td>
            <td class="p-3 text-center">${r.count} / ${r.total}</td>
            <td class="p-3 text-center font-bold ${getPercentageTextColor(r.pct)}">${r.pct}%</td>
        </tr>`;
    });
    table += `</tbody></table></div>`;

    const avgPct = rows.length ? Math.round(rows.reduce((a,r)=>a+r.pct,0)/rows.length) : 0;
    DOM.reportContent.innerHTML = reportHeader(`تقرير نشاط: ${act.name}`, serviceName) +
        `<div class="mb-4 text-center">
            <span class="text-4xl font-extrabold ${getPercentageTextColor(avgPct)}">${avgPct}%</span>
            <p class="text-slate-500 text-sm">متوسط الحضور</p>
        </div>` + table;
    DOM.reportOutput?.classList.remove('hidden-view');
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

    // Build chart data
    const datasets = periods.map((period, i) => {
        const COLORS = ['rgba(59,130,246,0.8)','rgba(16,185,129,0.8)','rgba(139,92,246,0.8)','rgba(249,115,22,0.8)'];
        const data = targetActs.map(act => {
            let attended = 0, meetings = 0;
            AppState.allAttendanceCache.forEach(day => {
                if (day.date >= period.start && day.date <= period.end) {
                    if (day[act.key]?.note == null && day[act.key]) {
                        meetings++;
                        servants.forEach(s => {
                            if (day[act.key].attendees?.includes(s.id)) attended++;
                        });
                    }
                }
            });
            return meetings > 0 ? Math.round((attended / (meetings * servants.length)) * 100) : 0;
        });
        return { label: `${period.label} (${period.start} → ${period.end})`, data, backgroundColor: COLORS[i % COLORS.length] };
    });

    // Render chart
    const output = DOM.periodReportOutput;
    if (!output) return;
    output.innerHTML = `<canvas id="periodComparisonChart" class="max-h-80"></canvas>`;
    output.classList.remove('hidden-view');

    if (AppState.charts.comparison) AppState.charts.comparison.destroy();
    AppState.charts.comparison = new Chart(
        document.getElementById('periodComparisonChart').getContext('2d'),
        {
            type: 'bar',
            data: { labels: targetActs.map(a => a.name), datasets },
            options: {
                responsive: true,
                plugins: { legend: { display: true } },
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                }
            }
        }
    );
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
        pdf.save(`تقرير-${new Date().toLocaleDateString('ar')}.pdf`);
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
        a.download = `تقرير-${new Date().toLocaleDateString('ar')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        showMessage('تم تصدير الصورة ✓');
    } catch (e) { console.error(e); showMessage('فشل التصدير.', true); }
    finally { showLoading(false); }
}
