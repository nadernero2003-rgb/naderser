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
    const PREFERRED_MODELS = [
        'gemini-1.5-flash', 'gemini-1.5-flash-001', 'gemini-1.5-flash-8b',
        'gemini-1.5-pro', 'gemini-1.5-pro-001', 'gemini-1.0-pro', 'gemini-pro',
        'gemini-2.0-flash-exp'
    ];

    async function getModel(apiKey, excluded = []) {
        const cached = localStorage.getItem('geminiValidModel');
        if (cached && !excluded.includes(cached)) return cached;

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!res.ok) throw new Error('Failed to list models');
            const { models = [] } = await res.json();
            const available = models.filter(m =>
                m.supportedGenerationMethods?.includes('generateContent') &&
                !excluded.includes(m.name.split('/').pop())
            );
            if (!available.length) return null;

            let best = null;
            for (const pref of PREFERRED_MODELS) {
                const found = available.find(m => m.name.toLowerCase().includes(pref.toLowerCase()));
                if (found) { best = found.name.split('/').pop(); break; }
            }
            if (!best) best = available[0].name.split('/').pop();
            localStorage.setItem('geminiValidModel', best);
            return best;
        } catch { return 'gemini-pro'; }
    }

    async function callModel(modelName) {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );
        if (res.status === 429) throw new Error('RATE_LIMIT');
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'لم يُستلم أي رد.';
    }

    // Retry logic with model rotation
    let excluded = [], maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const model = await getModel(apiKey, excluded);
            if (!model) throw new Error('لا توجد نماذج متاحة لهذا المفتاح.');
            return await callModel(model);
        } catch (err) {
            if (err.message === 'RATE_LIMIT') {
                const cur = localStorage.getItem('geminiValidModel');
                if (cur) excluded.push(cur);
                localStorage.removeItem('geminiValidModel');
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            // Invalid key
            if (err.message.includes('API key') || err.message.includes('403')) {
                AppState.geminiApiKey = null;
                localStorage.removeItem('geminiApiKey');
                localStorage.removeItem('geminiValidModel');
                showMessage('مفتاح API غير صالح. الرجاء إعادة إدخاله من الإعدادات.', true);
            }
            throw err;
        }
    }
    throw new Error('تم استنفاد جميع المحاولات. الرجاء الانتظار دقيقة.');
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
    for (const [activity, percent] of Object.entries(stats)) {
        statsText += `${activity}: ${percent}\n`;
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
