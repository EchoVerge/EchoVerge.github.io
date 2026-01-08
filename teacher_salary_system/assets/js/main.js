import { state } from './modules/state.js';
import { loadSettings } from './modules/db.js';
import { 
    renderCalendar, jumpToToday, changeWeek, jumpToSpecificDate, renderSidebar 
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
    // 1. 載入設定
    state.courseTypes = await loadSettings();
    
    // 2. 初始化所有 Bootstrap Modals
    initRecordModal();
    initSemesterModal();
    initSettingsModal();
    initStatsModal();
    initBackupModal();

    // 3. 渲染畫面
    jumpToToday();
};

// --- 將函式掛載到 window，讓 HTML onclick 可以呼叫 ---
window.jumpToToday = jumpToToday;
window.changeWeek = changeWeek;
window.jumpToSpecificDate = jumpToSpecificDate;

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