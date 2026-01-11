/**
 * assets/js/modules/onboarding.js
 * V2.2: 修復按鈕選取錯誤 (使用 data-tab 取代 id)
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

    // 預先抓取導航按鈕 (使用 data-tab 屬性，比 ID 更穩定)
    const getNavBtn = (tabName) => document.querySelector(`button[data-tab="${tabName}"]`);

    driverObj = window.driver.js.driver({
        showProgress: true,
        allowClose: true,
        steps: [
            { 
                element: '#btn-ai-settings', 
                popover: { title: '1. 設定 AI Key', description: '第一步請先設定 Google AI Key，才能使用 AI 分析與 Vision 辨識功能。' } 
            },
            { 
                element: '#group-source', 
                popover: { title: '2. 匯入題庫', description: '支援從 Excel/Word 匯入，或使用全新的「圖片/PDF 辨識」直接讀取考卷影像。' } 
            },
            { 
                element: '#pane-input', 
                popover: { title: '3. 手動編輯', description: '您也可以將題目文字直接貼在這裡，讓系統進行分析。' } 
            },
            { 
                element: '#group-process', 
                popover: { title: '4. AI 處理', description: '貼上文字後點選「AI 純文字」，或點選「生成類題」來擴充題庫。' } 
            },
            { 
                element: '#pane-preview', 
                popover: { title: '5. 預覽與排序', description: '分析後的題目會出現在這。您可以拖曳卡片調整順序，或點擊鉛筆圖示進行編輯。' } 
            },
            { 
                element: '#group-manage', 
                popover: { title: '6. 存檔管理', description: '記得隨時儲存！「紀錄」按鈕可找回之前的試卷。' } 
            },
            { 
                element: 'button[data-tab="tab-export"]', // 改用屬性選擇器
                popover: { title: '7. 考前輸出', description: '切換到此頁籤，可匯出 Word 試卷 (含圖片) 或產生答案卡。' } 
            },
            { 
                element: 'button[data-tab="tab-grade"]', // 改用屬性選擇器
                popover: { title: '8. 閱卷與補救', description: '考完試後，可用相機閱卷並生成學生的補救學習單。' } 
            },
            { 
                element: '#btn-cloud-settings', 
                popover: { title: '9. 雲端備份', description: '強烈建議登入 Google 帳號，將資料安全備份到雲端，避免遺失。' } 
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