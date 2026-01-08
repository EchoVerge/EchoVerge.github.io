import { state } from './modules/state.js';
import { loadSettings } from './modules/db.js';
import { 
    renderCalendar, jumpToToday as originalJumpToToday, changeWeek, jumpToSpecificDate as originalJumpToSpecificDate, renderSidebar 
} from './modules/calendar.js';

import { 
    initRecordModal, openEditModal, saveRecord, deleteRecord 
} from './modules/record.js';

import { 
    initSemesterModal, openSemesterModal, saveSemester, editBaseSchedule, loadSemesterList, 
    openBaseSlotModal, saveBaseSlot, deleteBaseSlot
} from './modules/semester.js';

import { 
    initSettingsModal, openSettingsModal, renderSettingsTable, addCourseType, updateType, removeType 
} from './modules/settings.js';

import { 
    initStatsModal, openStatsModal, calculateStats, exportStatsExcel 
} from './modules/stats.js';

import { 
    initBackupModal, openBackupModal, exportBackup, importBackup 
} from './modules/backup.js';

// --- 初始化 ---
window.onload = async function() {
    state.courseTypes = await loadSettings();
    
    initRecordModal();
    initSemesterModal();
    initSettingsModal();
    initStatsModal();
    initBackupModal();

    jumpToToday();
};

// --- UI 邏輯擴充 (RWD 支援) ---

// 1. 切換側邊欄顯示
window.toggleSidebar = function() {
    document.querySelector('.sidebar').classList.toggle('show');
    document.querySelector('.sidebar-overlay').classList.toggle('show');
};

// 2. 包裝跳轉日期功能：手機版點選後自動關閉側邊欄
window.jumpToSpecificDate = function(dateStr) {
    originalJumpToSpecificDate(dateStr);
    // 如果是在手機版 (寬度 < 768px)，跳轉後自動關閉側邊欄
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('show');
        document.querySelector('.sidebar-overlay').classList.remove('show');
    }
};

// 3. 包裝「回到本週」：手機版點選後自動關閉
window.jumpToToday = function() {
    originalJumpToToday();
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('show');
        document.querySelector('.sidebar-overlay').classList.remove('show');
    }
};

// --- 掛載其他函式 ---
window.changeWeek = changeWeek;
// jumpToSpecificDate 與 jumpToToday 已在上方覆寫

window.openEditModal = openEditModal;
window.saveRecord = saveRecord;
window.deleteRecord = deleteRecord;

window.openSemesterModal = openSemesterModal;
window.saveSemester = saveSemester;
window.editBaseSchedule = editBaseSchedule;

window.openBaseSlotModal = openBaseSlotModal;
window.saveBaseSlot = saveBaseSlot;
window.deleteBaseSlot = deleteBaseSlot;

window.openSettingsModal = openSettingsModal;
window.addCourseType = addCourseType;
window.updateType = updateType;
window.removeType = removeType;

window.openStatsModal = openStatsModal;
window.calculateStats = calculateStats;
window.exportStatsExcel = exportStatsExcel;

window.openBackupModal = openBackupModal;
window.exportBackup = exportBackup;
window.importBackup = importBackup;