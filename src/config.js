// ==================================================================
// config.js - Application Configuration
// ==================================================================

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDqnWPGTAvIWakd0Wl14uuznrCy2oo8Iws",
    authDomain: "church-service-app-4f180.firebaseapp.com",
    projectId: "church-service-app-4f180",
    storageBucket: "church-service-app-4f180.appspot.com",
    messagingSenderId: "431475695196",
    appId: "1:431475695196:web:4bd4389448eb94804e1099"
};

export const SERVICES = [
    { name: "خدمة B.C",                      icon: "fa-book-bible",          color: "teal",    password: "457852" },
    { name: "خدمة KG",                        icon: "fa-child-reaching",      color: "lime",    password: "425687" },
    { name: "خدمة أولى ابتدائي",              icon: "fa-shapes",              color: "green",   password: "654852" },
    { name: "خدمة ثانية ابتدائي",             icon: "fa-pencil-ruler",        color: "yellow",  password: "741852" },
    { name: "خدمة ثالثة ورابعة بنات",         icon: "fa-female",              color: "pink",    password: "963852" },
    { name: "خدمة ثالثة ورابعة أولاد",        icon: "fa-male",                color: "indigo",  password: "852963" },
    { name: "خدمة خامسة وسادسة بنات",         icon: "fa-palette",             color: "red",     password: "654321" },
    { name: "خدمة خامسة وسادسة أولاد",        icon: "fa-futbol",              color: "purple",  password: "220319" },
    { name: "خدمة الكورال والأنشطة",           icon: "fa-music",               color: "cyan",    password: "000000" },
    { name: "خدمة وسائل الإيضاح",             icon: "fa-desktop",             color: "orange",  password: "666666" },
    {
        name: "الامين العام",
        icon: "fa-user-shield",
        color: "blue",
        password: "999999",
        isGroup: true,
        children: [
            { name: "الامين العام",   icon: "fa-user-shield", color: "blue",   isGeneralSecretary: true, description: "الدخول للوحة المعلومات الشاملة" },
            { name: "خدمة ابتدائي",  icon: "fa-church",      color: "orange", isUnderConstruction: false, description: "نظام إدارة خدمة ابتدائي الشامل" }
        ]
    }
];

export const ACTIVITIES = [
    { key: 'visiting',    name: 'الافتقاد',  icon: 'fa-hand-holding-heart',   color: 'rgba(249,115,22,0.8)',  border: 'rgb(249,115,22)' },
    { key: 'preparation', name: 'التحضير',  icon: 'fa-book-open',             color: 'rgba(234,179,8,0.8)',   border: 'rgb(234,179,8)' },
    { key: 'mass',        name: 'القداس',   icon: 'fa-cross',                  color: 'rgba(239,68,68,0.8)',   border: 'rgb(239,68,68)' },
    { key: 'service',     name: 'الخدمة',   icon: 'fa-church',                 color: 'rgba(59,130,246,0.8)',  border: 'rgb(59,130,246)' },
    { key: 'explanation', name: 'الشرح',    icon: 'fa-chalkboard-teacher',     color: 'rgba(34,197,94,0.8)',   border: 'rgb(34,197,94)' },
    { key: 'apology',     name: 'معتذر',    icon: 'fa-hand-paper',             color: 'rgba(107,114,128,0.8)', border: 'rgb(107,114,128)' },
];

export const ACTIVITY_MAP = new Map(ACTIVITIES.map(a => [a.key, a]));

export const MONTHS_AR = [
    "يناير","فبراير","مارس","أبريل","مايو","يونيو",
    "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"
];

export const EVENT_TYPES = {
    "رحلة دينية":    "bg-blue-500",
    "رحلة ترفيهية":  "bg-green-500",
    "يوم رياضي":     "bg-orange-500",
    "يوم روحي":      "bg-purple-500",
    "اجتماع خدام":   "bg-yellow-500",
    "حفلة":          "bg-pink-500",
    "ندوة":          "bg-indigo-500",
    "أخرى":          "bg-gray-500",
};

export const APP_NAME = "نظام إدارة خدمة ابتدائي";
export const CHURCH_NAME = "كنيسة مار بولس بالعبور";
export const ANNOUNCEMENTS_PER_PAGE = 3;
export const FOLLOW_UP_ABSENCE_THRESHOLD = 2; // Number of consecutive absences to flag
