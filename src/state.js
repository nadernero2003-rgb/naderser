// ==================================================================
// state.js - Global Application State (Single Source of Truth)
// ==================================================================

export const AppState = {
    // Auth & Session
    currentServiceName: '',
    isGeneralSecretaryMode: false,
    userId: null,
    isLocalMode: false,

    // Firebase references
    db: null,
    auth: null,

    // Data caches
    servantsCache: [],
    allServantsCache: [],
    attendanceYearCache: {},
    allAttendanceCache: [],
    allAnnouncementsCache: [],
    calendarEventsCache: {},
    unreadNotes: [],
    unreadNotesCount: 0,
    unreadAnnouncementsCache: [],

    // UI state
    currentActivity: '',
    selectedFriday: '',
    currentReportType: 'individual',
    displayedAnnouncementsCount: 0,
    absenceFilterSelectedMonths: new Set(),
    absenceFilterSelectedActivity: null,
    absenceFilterSelectedYear: new Date().getFullYear(),
    followUpResultsCache: [],
    followUpSearchQuery: '',
    servantsViewMode: 'grid', // 'grid' | 'table'
    followUpViewMode: 'grid', // 'grid' | 'table'
    periodCount: 0,
    pendingImport: [], // Temporary storage for Excel preview

    // Subscriptions (unsubscribe functions)
    subscriptions: {
        servants: null,
        announcements: null,
        notes: null,
        incomingNotes: null,
        serviceAnnouncements: null,
        calendarEvents: null,
    },

    // Chart instances
    charts: {
        home: null,
        admin: null,
        report1: null,
        report2: null,
        comparison: null,
        profile: null,
        activity: null,
    },

    // AI
    geminiApiKey: null, // Loaded from Firestore, lives in memory only

    // Reset all subscriptions
    clearSubscriptions() {
        Object.keys(this.subscriptions).forEach(key => {
            if (typeof this.subscriptions[key] === 'function') {
                this.subscriptions[key]();
                this.subscriptions[key] = null;
            }
        });
    },

    // Reset to initial state on logout
    reset() {
        this.clearSubscriptions();
        this.currentServiceName = '';
        this.isGeneralSecretaryMode = false;
        this.servantsCache = [];
        this.allServantsCache = [];
        this.attendanceYearCache = {};
        this.allAttendanceCache = [];
        this.allAnnouncementsCache = [];
        this.calendarEventsCache = {};
        this.unreadNotes = [];
        this.unreadNotesCount = 0;
        this.unreadAnnouncementsCache = [];
        this.currentActivity = '';
        this.selectedFriday = '';
        this.currentReportType = 'individual';
        this.displayedAnnouncementsCount = 0;
        this.absenceFilterSelectedMonths = new Set();
        this.absenceFilterSelectedActivity = null;
        this.periodCount = 0;
        this.pendingImport = [];
        this.followUpViewMode = 'grid';

        // Destroy all charts
        Object.keys(this.charts).forEach(key => {
            if (this.charts[key]) {
                this.charts[key].destroy();
                this.charts[key] = null;
            }
        });
    }
};
