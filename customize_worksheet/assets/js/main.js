/**
 * assets/js/main.js
 * V5.0: Cloud Sync Integration
 */
import { initColumnManager } from './modules/columnManager.js';
import { state } from './modules/state.js';

import { initSettingsController } from './modules/settingsController.js';
import { initEditorController } from './modules/editorController.js';
import { initGradingController } from './modules/gradingController.js';
import { initOutputController } from './modules/outputController.js';
import { initUsageMonitor } from './modules/usageMonitor.js';
// 引入雲端模組
import { initCloudManager } from './modules/cloudManager.js';
import { initOnboarding } from './modules/onboarding.js';
import { initJsonBackupManager } from './modules/jsonBackupManager.js'; // 本地匯入匯出

// 初始化控制器
initColumnManager();
initSettingsController();
initEditorController();
initGradingController();
initOutputController();
initUsageMonitor();
// 初始化雲端與本地備份功能
initCloudManager();
initOnboarding();
initJsonBackupManager();

// 分頁切換邏輯
const tabs = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        document.getElementById(targetId).classList.add('active');
    });
});

const btnPrintAction = document.getElementById('btn-print-action');
if (btnPrintAction) {
    btnPrintAction.addEventListener('click', () => window.print());
}

state.mode = 'tab-layout';
console.log("🎓 考卷數位助教 V20 Cloud Ready!");