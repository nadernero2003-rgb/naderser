// ==================================================================
// ai.js - Google Gemini AI Integration
// ==================================================================

import { AppState } from './state.js';
import { showMessage, openModal } from './ui.js';
import { DOM } from './ui.js';
import { loadGeminiKeyFromFirestore, saveGeminiKeyToFirestore } from './firebase.js';

// ─── Load Key ─────────────────────────────────────────────────────
export async function ensureGeminiKey() {
    // 1. Check in-memory
    if (AppState.geminiApiKey) return AppState.geminiApiKey;
    // 2. Try Firestore
    const fromFirestore = await loadGeminiKeyFromFirestore();
    if (fromFirestore) return fromFirestore;
    // 3. Fallback: localStorage (from old version)
    const fromStorage = localStorage.getItem('geminiApiKey');
    if (fromStorage) {
        AppState.geminiApiKey = fromStorage;
        return fromStorage;
    }
    return null;
}

// ─── Main Generate Function ────────────────────────────────────────
export async function generateContent(prompt) {
    let apiKey = await ensureGeminiKey();

    // If no key, ask user
    if (!apiKey) {
        return new Promise((resolve, reject) => {
            openModal(DOM.settingsModal);
            showMessage('الرجاء إدخال مفتاح Gemini AI في الإعدادات', true);

            const interval = setInterval(async () => {
                const key = AppState.geminiApiKey || localStorage.getItem('geminiApiKey');
                if (key) {
                    clearInterval(interval);
                    generateContent(prompt).then(resolve).catch(reject);
                } else if (DOM.settingsModal?.classList.contains('hidden-view')) {
                    clearInterval(interval);
                    reject(new Error('تم الإلغاء: لم يتم إدخال مفتاح API.'));
                }
            }, 500);
        });
    }

    // ─── Try calling the API ───────────────────────────────────────
    // Each entry: [endpoint, modelName] - trying different API versions and models
    // because some models only work on v1beta, others only on v1
    const MODEL_ENDPOINTS = [
        ['v1beta', 'gemini-2.0-flash-lite'],
        ['v1beta', 'gemini-2.0-flash'],
        ['v1', 'gemini-1.5-flash'],
        ['v1beta', 'gemini-1.5-flash'],
        ['v1', 'gemini-pro'],
        ['v1beta', 'gemini-pro'],
    ];

    async function callModel(apiVersion, modelName) {
        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;
        console.log(`[AI] Trying ${apiVersion}/${modelName}...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        console.log(`[AI] ${modelName} → HTTP ${res.status}`);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${res.status}`;
            console.error(`[AI] ${modelName} error:`, errMsg);
            // Model not found - skip (don't count as rate limit)
            if (res.status === 404) throw new Error('MODEL_NOT_FOUND');
            if (res.status === 429 || res.status === 503) throw new Error('RATE_LIMIT');
            throw new Error(errMsg);
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) console.warn('[AI] Empty response from', modelName, data);
        return text || 'لم يُستلم أي رد.';
    }

    let lastError = null;
    let rateLimitCount = 0;
    for (const [apiVersion, modelName] of MODEL_ENDPOINTS) {
        try {
            const result = await callModel(apiVersion, modelName);
            localStorage.setItem('geminiValidModel', modelName);
            console.log(`[AI] ✓ Success with ${modelName}`);
            return result;
        } catch (err) {
            lastError = err;
            // Invalid API key - stop immediately
            if (err.message.includes('API key') || err.message.includes('API_KEY') || err.message.includes('403')) {
                AppState.geminiApiKey = null;
                localStorage.removeItem('geminiApiKey');
                localStorage.removeItem('geminiValidModel');
                showMessage('مفتاح API غير صالح. الرجاء إعادة إدخاله من الإعدادات.', true);
                throw err;
            }
            if (err.message === 'RATE_LIMIT') {
                rateLimitCount++;
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            if (err.message === 'MODEL_NOT_FOUND') continue;
            continue;
        }
    }
    // If hardcoded ones fail, try dynamically discovering available models
    if (lastError && lastError.message === 'MODEL_NOT_FOUND') {
        console.log('[AI] Hardcoded models not found. Attempting dynamic discovery...');
        try {
            const discoveryRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (discoveryRes.ok) {
                const discoveryData = await discoveryRes.json();
                const availableGemini = discoveryData.models?.filter(m => 
                    m.supportedGenerationMethods?.includes('generateContent') && 
                    m.name.includes('gemini')
                );
                
                if (availableGemini && availableGemini.length > 0) {
                    const dynamicModelName = availableGemini[0].name.replace('models/', '');
                    console.log(`[AI] Discovered model: ${dynamicModelName}, trying it...`);
                    const result = await callModel('v1beta', dynamicModelName);
                    localStorage.setItem('geminiValidModel', dynamicModelName);
                    console.log(`[AI] ✓ Success with dynamically discovered ${dynamicModelName}`);
                    return result;
                }
            }
        } catch (e) {
            console.error('[AI] Dynamic discovery failed:', e);
        }
    }

    // Better error message based on what actually happened
    if (rateLimitCount >= MODEL_ENDPOINTS.length / 2) {
        console.error('[AI] All models returned 429 (quota exhausted).');
        throw new Error('تم استنفاذ حصة مفتاح API بالكامل. الرجاء إنشاء مفتاح جديد من aistudio.google.com أو الانتظار حتى تجديد الحصة.');
    }
    const detail = lastError?.message || 'خطأ غير معروف';
    console.error('[AI] All models failed. Last error:', detail);
    throw new Error(`فشل الاتصال بالذكاء الصناعي. السبب: ${detail}. تأكد أن المفتاح يعمل في بلدك وأنه يحتوي على رصيد/حصة.`);
}

// ─── AI Features ──────────────────────────────────────────────────

/**
 * Generate a spiritual birthday greeting message
 */
export async function generateBirthdayGreeting(name) {
    const prompt = `أكتب رسالة تهنئة بعيد ميلاد للخادم "${name}"، تكون روحية ومشجعة وقصيرة، وتتضمن آية من الكتاب المقدس، بدون مقدمات أو تحيات رسمية. استخدم emojis بشكل معتدل.`;
    return await generateContent(prompt);
}

/**
 * Generate individual performance AI analysis
 */
export async function generateIndividualAnalysis(servantName, stats, avgPercent) {
    let statsText = `المتوسط العام: ${avgPercent}%\n`;
    // stats is an array of {name, perc} objects
    for (const item of stats) {
        statsText += `${item.name}: ${item.perc}%\n`;
    }

    const prompt = `أنت خادم أمين في الكنيسة. اكتب رسالة شخصية ومشجعة للخادم "${servantName}" بناءً على تقرير حضوره:
${statsText}

المطلوب:
1. ابدأ باسمه بأسلوب محبة.
2. أبرز نقاط القوة (الأنشطة عالية الحضور).
3. شجعه بلطف على تحسين الأنشطة المنخفضة.
4. أضف آية من الكتاب المقدس مناسبة.
5. اجعلها قصيرة واحترافية وجاهزة للإرسال على واتساب.
لا تستخدم جداول. استخدم emojis.`;

    return await generateContent(prompt);
}

/**
 * Generate comprehensive report AI analysis
 */
export async function generateComprehensiveAnalysis(serviceName, avgPercent, topServants, lowestServants, period) {
    const prompt = `أنت مسؤول تقارير في كنيسة. قدّم تقريراً تحليلياً وتشجيعياً عن أداء ${serviceName} للفترة من ${period.start} إلى ${period.end}:

- متوسط الحضور العام: ${avgPercent}%
- أعلى الخدام حضوراً: ${topServants.join('، ')}
- الخدام بحاجة للمتابعة: ${lowestServants.join('، ')}

المطلوب:
1. تقييم عام موجز للأداء.
2. مدح الخدام الملتزمين.
3. خطة تشجيعية مختصرة للمتابعة.
4. آية كتابية للتشجيع.
استخدم أسلوباً مشجعاً وروحياً. لا جداول.`;

    return await generateContent(prompt);
}

/**
 * Generate period comparison AI analysis
 */
export async function generatePeriodAnalysis(periodData) {
    let periodsText = '';
    periodData.forEach(pd => {
        periodsText += `\n${pd.label} (${pd.start} → ${pd.end}): المتوسط ${pd.avgPct}%`;
        pd.actPcts.forEach(a => {
            periodsText += `\n  - ${a.act}: ${a.pct}%`;
        });
    });

    const prompt = `أنت محلل بيانات تعليمية في كنيسة. حلّل مقارنة الفترات التالية لخدمة ابتدائي:
${periodsText}

المطلوب:
1. ملخص التطور أو التراجع بين الفترات.
2. أي الأنشطة تحسنت وأيها تراجعت.
3. توصيات عملية لتحسين الأنشطة الضعيفة.
4. آية كتابية مشجعة.
كن مختصراً ومشجعاً. استخدم emojis. لا جداول.`;

    return await generateContent(prompt);
}

// ─── Settings Save ────────────────────────────────────────────────
export async function handleSettingsSave(e) {
    e.preventDefault();
    const key = DOM.geminiApiKeyInput?.value?.trim();
    if (key) {
        await saveGeminiKeyToFirestore(key);
    } else {
        AppState.geminiApiKey = null;
        localStorage.removeItem('geminiApiKey');
        showMessage('تم حذف مفتاح API', true);
    }
    const modal = document.getElementById('settingsModal');
    if (modal) { modal.classList.add('hidden-view'); modal.classList.remove('flex'); }
}

// ─── Greeting Card Export Utilities ──────────────────────────────
export function renderMarkdown(text) {
    return typeof marked !== 'undefined'
        ? marked.parse(text)
        : text.replace(/\n/g, '<br>');
}

export function copyText(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    showMessage('تم النسخ ✓');
}

export function shareWhatsapp(text) {
    const clean = text.replace(/[#*]/g, '');
    window.open(`https://wa.me/?text=${encodeURIComponent(clean)}`, '_blank');
}

export async function exportCardAsImage(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el || typeof html2canvas === 'undefined') return;
    try {
        const canvas = await html2canvas(el, {
            scale: 2,
            backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
            ignoreElements: el => el.hasAttribute('data-html2canvas-ignore')
        });
        const a = document.createElement('a');
        a.download = filename;
        a.href = canvas.toDataURL('image/png');
        a.click();
        showMessage('تم حفظ الصورة ✓');
    } catch (e) {
        console.error(e);
        showMessage('فشل حفظ الصورة', true);
    }
}
