/**
 * assets/js/modules/onboarding.js
 * V2.3: 配合按鈕分組調整教學文案
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

    const getNavBtn = (tabName) => document.querySelector(`button[data-tab="${tabName}"]`);

    driverObj = window.driver.js.driver({
        showProgress: true,
        allowClose: true,
        steps: [
            { 
                element: '#btn-ai-settings', 
                popover: { title: '1. 設定 AI Key', description: '第一步請先設定 Google AI Key，才能使用 AI 功能。' } 
            },
            { 
                // Group 1: 來源
                element: '#group-source', 
                popover: { title: '2. 匯入題目', description: '您有三種方式建立題庫：<br>1. <b>匯入檔案</b> (Excel/Word)<br>2. <b>圖片/PDF 辨識</b> (Vision)<br>3. <b>AI 格式化</b> (整理貼上的文字)' } 
            },
            { 
                element: '#pane-input', 
                popover: { title: '3. 文字輸入區', description: '若選擇手動貼上題目，請貼在此處，再點擊上方的「✨ AI 格式化」按鈕進行整理。' } 
            },
            { 
                // Group 2: 處理
                element: '#group-process', 
                popover: { title: '4. AI 賦能', description: '題目整理好後，可使用「🧠 自動解題」補全解析，或「🔮 生成類題」來擴充題庫。' } 
            },
            { 
                element: '#pane-preview', 
                popover: { title: '5. 預覽與排序', description: '這裡顯示最終的題庫內容。您可以拖曳卡片調整順序，或點擊鉛筆圖示進行編輯。' } 
            },
            { 
                element: '#group-manage', 
                popover: { title: '6. 存檔管理', description: '記得隨時儲存！「紀錄」按鈕可找回之前的試卷。' } 
            },
            { 
                element: 'button[data-tab="tab-export"]', 
                popover: { title: '7. 考前輸出', description: '切換到此頁籤，可匯出 Word 試卷 (含圖片) 或產生答案卡。' } 
            },
            { 
                element: 'button[data-tab="tab-grade"]', 
                popover: { title: '8. 閱卷與補救', description: '考完試後，可用相機閱卷並生成學生的補救學習單。' } 
            },
            { 
                element: '#btn-cloud-settings', 
                popover: { title: '9. 雲端備份', description: '強烈建議登入 Google 帳號，將資料安全備份到雲端。' } 
            }
        ],
        onHighlightStarted: (element) => {
            if (!element) return;
            
            const navEdit = getNavBtn('tab-edit');
            const navExport = getNavBtn('tab-export');
            const navGrade = getNavBtn('tab-grade');

            if (element === navExport) {
                navExport?.click();
            }
            else if (element === navGrade) {
                navGrade?.click();
            }
            else if (element.closest && element.closest('#tab-edit')) {
                if (navEdit && !navEdit.classList.contains('active')) {
                    navEdit.click();
                }
            }
        }
    });

    driverObj.drive();
}