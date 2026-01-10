/**
 * assets/js/main.js
 * V13 入口：初始化所有控制器
 */
import { initColumnManager } from './modules/columnManager.js';
import { StepManager } from './modules/stepManager.js';
import { state } from './modules/state.js';

import { initSettingsController } from './modules/settingsController.js';
import { initEditorController } from './modules/editorController.js';
import { initGradingController } from './modules/gradingController.js';
import { initOutputController } from './modules/outputController.js';
import { initUsageMonitor } from './modules/usageMonitor.js';

// 初始化
initColumnManager();
initSettingsController();
initEditorController();
initGradingController();
initOutputController();
initUsageMonitor();

// 步驟管理器驗證邏輯
new StepManager(3, {
    validate: (step) => {
        if (step === 1) {
            if (!state.questions || state.questions.length === 0) {
                alert("請先輸入或匯入題目！");
                return false;
            }
        }
        if (step === 2 && state.mode === 'error') {
            if (!state.students || state.students.length === 0) {
                alert("錯題模式需輸入學生資料或進行閱卷！");
                return false;
            }
        }
        return true;
    }
});

window.checkState = () => {
    console.log("Current Mode:", state.mode);
    console.log("Questions:", state.questions);
    console.log("Students:", state.students);
    
    if (state.questions.length === 0) console.warn("⚠️ 警告：題庫是空的！");
    if (state.mode === 'error' && state.students.length === 0) console.warn("⚠️ 警告：錯題模式下沒有學生資料！");
};