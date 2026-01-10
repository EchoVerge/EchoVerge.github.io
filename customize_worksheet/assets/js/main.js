/**
 * assets/js/main.js
 * V4.0: Tab Layout (分頁式架構) 入口
 */
import { initColumnManager } from './modules/columnManager.js';
import { state } from './modules/state.js';

import { initSettingsController } from './modules/settingsController.js';
import { initEditorController } from './modules/editorController.js';
import { initGradingController } from './modules/gradingController.js';
import { initOutputController } from './modules/outputController.js';
import { initUsageMonitor } from './modules/usageMonitor.js';

// 初始化控制器
initColumnManager();
initSettingsController();
initEditorController(); // 控制 Tab 1 & Tab 2 (因為輸出按鈕在 EditorController 處理)
initGradingController(); // 控制 Tab 3 上半部
initOutputController();  // 控制 Tab 3 下半部 (生成按鈕)
initUsageMonitor();

// 1. 分頁切換邏輯
const tabs = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // 移除所有 active
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        
        // 啟用當前
        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        document.getElementById(targetId).classList.add('active');
    });
});

// 2. 列印確認監聽
const btnPrintAction = document.getElementById('btn-print-action');
if (btnPrintAction) {
    btnPrintAction.addEventListener('click', () => window.print());
}

state.mode = 'tab-layout';
console.log("🎓 考卷數位助教 V17 Tab Layout Ready!");