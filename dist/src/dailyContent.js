// ==================================================================
// dailyContent.js - Fetch verse + synaxarium from Katameros API
// Source: https://katamars.avabishoy.com/
// API: https://api.katameros.app/
// ==================================================================

const KATAMEROS_API = 'https://api.katameros.app/readings/gregorian';
const LANGUAGE_AR = 3;  // Arabic
const LANGUAGE_EN = 2;  // English (fallback)

/**
 * Format today's date as DD-MM-YYYY for the API
 */
function getTodayFormatted() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

/**
 * Fetch today's readings from Katameros API
 */
async function fetchKatamerosData() {
    const dateStr = getTodayFormatted();
    const url = `${KATAMEROS_API}/${dateStr}?languageId=${LANGUAGE_AR}`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(8000) // 8 second timeout
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    return data;
}

/**
 * Extract a random Bible verse from the day's readings
 * Picks randomly from Vespers, Matins, and Liturgy psalm/gospel passages
 */
function extractRandomVerse(data) {
    const allVerses = [];

    if (!data.sections) return null;

    for (const section of data.sections) {
        if (!section.subSections) continue;
        for (const sub of section.subSections) {
            if (!sub.readings) continue;
            for (const reading of sub.readings) {
                if (!reading.passages) continue;
                for (const passage of reading.passages) {
                    const bookName = passage.bookTranslation || '';
                    const ref = passage.ref || '';
                    if (passage.verses && passage.verses.length > 0) {
                        // Collect each verse
                        for (const v of passage.verses) {
                            if (v.text && v.text.trim()) {
                                allVerses.push({
                                    text: v.text.trim().replace(/\\n/g, ' ').replace(/\\/g, ''),
                                    ref: `${bookName} ${ref}`,
                                    book: bookName
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    if (allVerses.length === 0) return null;

    // Pick a RANDOM verse — different every time the app opens
    const idx = Math.floor(Math.random() * allVerses.length);
    return allVerses[idx];
}

/**
 * Extract Synaxarium content from today's readings
 */
function extractSynaxarium(data) {
    if (!data.sections) return null;

    for (const section of data.sections) {
        // Synaxarium section has readings with title and html but no passages
        if (!section.subSections && section.readings) {
            // Check if this looks like synaxarium
            const firstReading = section.readings[0];
            if (firstReading && firstReading.html && !firstReading.passages) {
                const titles = section.readings
                    .filter(r => r.title)
                    .map(r => r.title);

                return {
                    introduction: (section.introduction || '').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n'),
                    titles: titles,
                    fullTitle: titles.length > 0 ? titles[0] : 'سنكسار اليوم'
                };
            }
        }

        // Also check in subSections
        if (section.subSections) {
            for (const sub of section.subSections) {
                if (sub.readings) {
                    for (const reading of sub.readings) {
                        if (reading.html && !reading.passages && reading.title) {
                            return {
                                introduction: sub.introduction || section.introduction || '',
                                titles: [reading.title],
                                fullTitle: reading.title
                            };
                        }
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Extract Coptic date from API response
 */
function extractCopticDate(data) {
    if (!data.copticDate) return '';
    // Format: "10/8/1742" -> 10 برمودة 1742
    const copticMonths = [
        'توت', 'بابة', 'هاتور', 'كيهك', 'طوبة', 'أمشير',
        'برمهات', 'برمودة', 'بشنس', 'بؤونة', 'أبيب', 'مسرى', 'نسيء'
    ];
    const parts = data.copticDate.split('/');
    if (parts.length >= 3) {
        const day = parts[0];
        const monthIdx = parseInt(parts[1]) - 1;
        const year = parts[2];
        const monthName = copticMonths[monthIdx] || '';
        return `${day} ${monthName} ${year} ش`;
    }
    return data.copticDate;
}

/**
 * Render daily content on the front page
 * Fetches from Katameros API (katamars.avabishoy.com)
 */
export async function renderDailyContent() {
    const verseText = document.getElementById('dailyVerseText');
    const verseRef = document.getElementById('dailyVerseRef');
    const synaxText = document.getElementById('synaxariumText');

    try {
        const data = await fetchKatamerosData();

        // === VERSE ===
        const verse = extractRandomVerse(data);
        if (verseText && verse) {
            verseText.textContent = `"${verse.text}"`;
            if (verseRef) verseRef.textContent = `— ${verse.ref}`;
        } else if (verseText) {
            verseText.textContent = 'لا توجد آية متاحة اليوم';
        }

        // === SYNAXARIUM ===
        const synax = extractSynaxarium(data);
        const copticDate = extractCopticDate(data);

        if (synaxText && synax) {
            let displayText = '';
            if (copticDate) displayText += `📅 ${copticDate}\n`;
            displayText += synax.fullTitle;
            if (synax.titles.length > 1) {
                displayText += '\n• ' + synax.titles.slice(1).join('\n• ');
            }
            synaxText.textContent = displayText;
            synaxText.style.whiteSpace = 'pre-line';
        } else if (synaxText) {
            if (copticDate) {
                synaxText.textContent = `📅 ${copticDate} — سنكسار اليوم`;
            } else {
                synaxText.textContent = 'لا يتوفر سنكسار اليوم';
            }
        }

        // Add link to katamars source
        const synaxCard = document.getElementById('synaxariumCard');
        if (synaxCard && !synaxCard.querySelector('.synax-link')) {
            const link = document.createElement('a');
            link.className = 'synax-link text-xs text-sky-500 hover:text-sky-700 mt-2 inline-block font-bold';
            link.href = 'https://katamars.avabishoy.com/';
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = '📖 المزيد على katamars.avabishoy.com';
            synaxCard.appendChild(link);
        }

    } catch (e) {
        console.error('Failed to fetch from Katameros API:', e);
        // Show fallback message
        if (verseText) verseText.textContent = 'تعذر تحميل آية اليوم — تحقق من الاتصال';
        if (synaxText) synaxText.textContent = 'تعذر تحميل سنكسار اليوم — تحقق من الاتصال';
    }
}
