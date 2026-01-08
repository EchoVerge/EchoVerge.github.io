import { state } from './modules/state.js';
import { loadSettings } from './modules/db.js';
// 引入核心功能
import { 
    renderCalendar, jumpToToday as originalJumpToToday, changeWeek, jumpToSpecificDate as originalJumpToSpecificDate 
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

// 引入雲端功能
import { initCloudAuth, loginGoogle, logoutGoogle, syncData } from './modules/cloud.js';

// 引入新的 UI 模組
import { toggleSidebar, closeSidebar, isMobileView } from './modules/ui.js';

// --- 初始化 ---
window.onload = async function() {
    // 1. 載入設定
    state.courseTypes = await loadSettings();
    
    // 2. 初始化所有 Bootstrap Modals
    initRecordModal();
    initSemesterModal();
    initSettingsModal();
    initStatsModal();
    initBackupModal();

    // 3. 初始化雲端功能
    initCloudAuth();

    // 4. 渲染畫面
    jumpToToday();
};

// --- 邏輯包裝與掛載 (Wrapper Functions) ---

// 包裝：跳轉到指定日期 (手機版自動收合側邊欄)
const jumpToSpecificDate = function(dateStr) {
    originalJumpToSpecificDate(dateStr);
    if (isMobileView()) {
        closeSidebar();
    }
};

// 包裝：回到本週 (手機版自動收合側邊欄)
const jumpToToday = function() {
    originalJumpToToday();
    if (isMobileView()) {
        closeSidebar();
    }
};

// 將函式掛載到 window，讓 HTML onclick 可以呼叫
// 1. UI 相關
window.toggleSidebar = toggleSidebar;

// 2. 行事曆導覽 (使用包裝後的版本)
window.jumpToSpecificDate = jumpToSpecificDate;
window.jumpToToday = jumpToToday;
window.changeWeek = changeWeek;

// 3. 課程紀錄相關
window.openEditModal = openEditModal;
window.saveRecord = saveRecord;
window.deleteRecord = deleteRecord;

// 4. 學期設定相關
window.openSemesterModal = openSemesterModal;
window.saveSemester = saveSemester;
window.editBaseSchedule = editBaseSchedule;
window.openBaseSlotModal = openBaseSlotModal;
window.saveBaseSlot = saveBaseSlot;
window.deleteBaseSlot = deleteBaseSlot;

// 5. 類別設定相關
window.openSettingsModal = openSettingsModal;
window.addCourseType = addCourseType;
window.updateType = updateType;
window.removeType = removeType;

// 6. 統計報表相關
window.openStatsModal = openStatsModal;
window.calculateStats = calculateStats;
window.exportStatsExcel = exportStatsExcel;

// 7. 備份與雲端相關
window.openBackupModal = openBackupModal;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.loginGoogle = loginGoogle;
window.logoutGoogle = logoutGoogle;
window.syncData = syncData;