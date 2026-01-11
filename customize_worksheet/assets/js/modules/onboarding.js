/**
 * assets/js/modules/onboarding.js
 * V3.0: 配合功能分組重構的教學導覽
 */

let driverObj;

export function initOnboarding() {
    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
        btnHelp.addEventListener('click', startTour);
    }

    const hasSeenTour = localStorage.getItem('ws_tour_seen');
    if (!hasSeenTour) {
        setTimeout(() => {
            if(confirm("歡迎使用考卷數位助教！\n是否需要進行 1 分鐘的快速導覽？")) {
                startTour();
            }
            localStorage.setItem('ws_tour_seen', 'true');
        }, 1500);
    }
}

export function startTour() {
    if (!window.driver) return;

    // Helper to get tab buttons
    const getNavBtn = (tabName) => document.querySelector(`button[data-tab="${tabName}"]`);

    driverObj = window.driver.js.driver({
        showProgress: true,
        allowClose: true,
        steps: [
            { 
                element: '#btn-ai-settings', 
                popover: { title: '1. 設定 AI Key', description: '第一步請先設定 Google AI Key，這是使用所有 AI 功能的前提。' } 
            },
            { 
                // Group 1: 來源 (包含 匯入、Vision、格式化)
                element: '#group-source', 
                popover: { 
                    title: '2. 建立題庫 (輸入)', 
                    description: '這裡整合了所有「輸入」方式：<br>📂 <b>匯入檔案</b> (Excel/Word)<br>📷 <b>圖片/PDF 辨識</b> (Vision)<br>✨ <b>AI 格式化</b> (整理貼上的雜亂文字)' 
                } 
            },
            { 
                element: '#pane-input', 
                popover: { title: '3. 文字輸入區', description: '若您選擇手動貼上題目文字，請貼在此處，再點擊上方的「✨ AI 格式化」按鈕進行整理。' } 
            },
            { 
                // Group 2: 處理 (包含 解題、類題)
                element: '#group-process', 
                popover: { 
                    title: '4. AI 賦能 (深加工)', 
                    description: '當題目進入系統後，可使用這裡的功能來增強內容：<br>🧠 <b>AI 自動解題</b>：自動補全答案與詳細解析。<br>🔮 <b>生成類題</b>：為現有題目生成相似的練習題。' 
                } 
            },
            { 
                element: '#pane-preview', 
                popover: { title: '5. 預覽與排序', description: '整理好的題目會顯示在這裡。您可以拖曳卡片調整順序，或點擊鉛筆圖示進行單題編輯。' } 
            },
            { 
                element: '#group-manage', 
                popover: { title: '6. 存檔管理', description: '編輯過程中請隨時儲存。「紀錄」按鈕可以幫您找回之前編輯過的試卷。' } 
            },
            { 
                element: 'button[data-tab="tab-export"]', 
                popover: { title: '7. 考前輸出', description: '切換到此頁籤，可匯出 <b>Word 試卷</b> (分為學生卷/詳解卷) 或產生答案卡。' } 
            },
            { 
                element: 'button[data-tab="tab-grade"]', 
                popover: { title: '8. 閱卷與補救', description: '考完試後，可用相機批改答案卡，並自動生成學生的補救學習單。' } 
            },
            { 
                element: '#btn-cloud-settings', 
                popover: { title: '9. 雲端備份', description: '強烈建議登入 Google 帳號，將您的題庫與設定安全備份到雲端，避免資料遺失。' } 
            }
        ],
        onHighlightStarted: (element) => {
            if (!element) return;
            
            const navEdit = getNavBtn('tab-edit');
            const navExport = getNavBtn('tab-export');
            const navGrade = getNavBtn('tab-grade');

            // 1. 如果目標是「考前輸出」按鈕 -> 點擊切換
            if (element === navExport) {
                navExport?.click();
            }
            // 2. 如果目標是「閱卷」按鈕 -> 點擊切換
            else if (element === navGrade) {
                navGrade?.click();
            }
            // 3. 如果目標位於「建立題庫 (#tab-edit)」區塊內 -> 切換回題庫分頁
            // 使用 closest 檢查是否在編輯分頁內 (包含 Toolbar, Input, Preview 等)
            else if (element.closest && element.closest('#tab-edit')) {
                // 只有當按鈕存在且目前不是 active 狀態時才點擊
                if (navEdit && !navEdit.classList.contains('active')) {
                    navEdit.click();
                }
            }
        }
    });

    driverObj.drive();
}