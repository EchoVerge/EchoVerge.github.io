/**
 * assets/js/modules/jsonBackupManager.js
 */
import { getAllHistoryForBackup, restoreHistoryFromBackup } from './historyManager.js';
import { showToast } from './toast.js';

export function initJsonBackupManager() {
    const btnExport = document.getElementById('btn-local-export');
    const btnImport = document.getElementById('btn-local-import');
    const fileImport = document.getElementById('file-local-import');

    // 匯出監聽
    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            try {
                const data = await createBackupData();
                downloadJson(data);
                showToast("備份檔案已下載", "success");
            } catch (e) {
                console.error(e);
                showToast("匯出失敗：" + e.message, "error");
            }
        });
    }

    // 匯入按鈕 -> 觸發檔案選擇
    if (btnImport && fileImport) {
        btnImport.addEventListener('click', () => fileImport.click());
        
        fileImport.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!confirm("⚠️ 警告：匯入備份將會「合併」或「覆蓋」現有的設定。\n確定要繼續嗎？")) {
                e.target.value = '';
                return;
            }

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                await restoreBackupData(data);
                showToast("資料還原成功！", "success");
                setTimeout(() => window.location.reload(), 1000);
            } catch (e) {
                console.error(e);
                showToast("還原失敗：格式錯誤或檔案損毀", "error");
            } finally {
                e.target.value = '';
            }
        });
    }
}

async function createBackupData() {
    const history = await getAllHistoryForBackup();
    const settings = {
        gemini_key: localStorage.getItem('gemini_key'),
        gemini_model: localStorage.getItem('gemini_model'),
    };
    return {
        version: 1,
        timestamp: new Date().toISOString(),
        settings: settings,
        history: history
    };
}

function downloadJson(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `worksheet_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function restoreBackupData(data) {
    if (data.settings) {
        if (data.settings.gemini_key) localStorage.setItem('gemini_key', data.settings.gemini_key);
        if (data.settings.gemini_model) localStorage.setItem('gemini_model', data.settings.gemini_model);
    }
    if (data.history && Array.isArray(data.history)) {
        await restoreHistoryFromBackup(data.history);
    }
}