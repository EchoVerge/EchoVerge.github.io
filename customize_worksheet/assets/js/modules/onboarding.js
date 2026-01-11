/**
 * assets/js/modules/onboarding.js
 * 使用 Driver.js 提供新手導覽
 */

let driverObj;

export function initOnboarding() {
    // 綁定教學按鈕
    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
        btnHelp.addEventListener('click', startTour);
    }

    // 檢查是否是第一次使用
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

    driverObj = window.driver.js.driver({
        showProgress: true,
        steps: [
            { 
                element: '#btn-ai-settings', 
                popover: { title: '1. 設定 AI Key', description: '第一步請先設定 Google AI Key，才能使用 AI 分析與 Vision 辨識功能。' } 
            },
            { 
                element: '#btn-upload-file', 
                popover: { title: '2. 匯入題庫', description: '支援 Excel、Word 檔匯入，或直接將題目貼到下方輸入框。' } 
            },
            { 
                element: '#btn-vision-parse', 
                popover: { title: '3. 圖片/PDF 辨識 (New!)', description: '直接上傳試卷圖片或 PDF，AI 會自動辨識文字與數學公式。' } 
            },
            { 
                element: '#pane-preview', 
                popover: { title: '4. 預覽與排序', description: '辨識後的題目會出現在這裡。您可以拖曳卡片來調整題號順序。' } 
            },
            { 
                element: '#nav-export', 
                popover: { title: '5. 考前輸出', description: '編輯完成後，到這裡匯出 Word 試卷或 PDF。' } 
            },
            { 
                element: '#btn-cloud-settings', 
                popover: { title: '6. 雲端備份', description: '登入 Google 帳號，將您的題庫與設定安全地備份到雲端。' } 
            }
        ]
    });

    driverObj.drive();
}