/**
 * assets/js/modules/onboarding.js
 * V2.0: 智慧切換分頁的引導系統
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

    // 定義驅動器
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
                element: '#nav-export', // 這一步會觸發切換分頁
                popover: { title: '7. 考前輸出', description: '切換到此頁籤，可匯出 Word 試卷 (含圖片) 或產生答案卡。' } 
            },
            { 
                element: '#nav-grade', // 這一步會觸發切換分頁
                popover: { title: '8. 閱卷與補救', description: '考完試後，可用相機閱卷並生成學生的補救學習單。' } 
            },
            { 
                element: '#btn-cloud-settings', 
                popover: { title: '9. 雲端備份', description: '強烈建議登入 Google 帳號，將資料安全備份到雲端，避免遺失。' } 
            }
        ],
        // [關鍵] 當引導步驟開始時，檢查是否需要切換分頁
        onHighlightStarted: (element) => {
            if (!element) return;
            
            // 如果目標在「考前輸出」分頁，且當前不在該分頁
            if (element === document.getElementById('nav-export')) {
                document.getElementById('nav-export').click();
            }
            // 如果目標在「閱卷」分頁
            else if (element === document.getElementById('nav-grade')) {
                document.getElementById('nav-grade').click();
            }
            // 如果目標是編輯區的元件，切回「建立題庫」
            else if (['#group-source', '#pane-input', '#group-manage'].some(sel => document.querySelector(sel) === element)) {
                document.getElementById('nav-edit').click();
            }
        }
    });

    driverObj.drive();
}