/**
 * assets/js/modules/onboarding.js
 * V4.4: 教學導覽修正版 (Fix ID Mismatch)
 * Fix: 修正步驟 3, 5, 6, 8, 9 的按鈕 ID，與 index.html 保持一致
 * Fix: 更新自動切換分頁的判斷邏輯以匹配新 ID
 */

let driverObj;

export function initOnboarding() {
    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
        btnHelp.addEventListener('click', startTour);
    }

    // 檢查是否為初次使用
    const hasSeenTour = localStorage.getItem('ws_tour_seen');
    if (!hasSeenTour) {
        setTimeout(() => {
            if(confirm("歡迎使用考卷數位助教！\n這是一個功能強大的工具，是否需要 2 分鐘的詳細導覽，帶您快速上手？")) {
                startTour();
            }
            localStorage.setItem('ws_tour_seen', 'true');
        }, 1500);
    }
}

export function startTour() {
    if (!window.driver) return;

    // 用來追蹤哪個元素被我們強制顯示了
    let tempShownElement = null;

    // Helper: 恢復被強制顯示的元素
    const restoreHiddenElement = () => {
        if (tempShownElement) {
            tempShownElement.style.display = 'none';
            tempShownElement.style.boxShadow = '';
            tempShownElement.classList.remove('tour-force-show');
            tempShownElement = null;
        }
    };

    // Helper: 取得分頁按鈕
    const getNavBtn = (tabName) => document.querySelector(`button[data-tab="${tabName}"]`);

    driverObj = window.driver.js.driver({
        showProgress: true,
        allowClose: true,
        animate: true,
        nextBtnText: '下一步 ❯',
        prevBtnText: '❮ 上一步',
        doneBtnText: '開始使用',
        
        steps: [
            // --- Phase 1: 設定與輸入 ---
            { 
                element: '#btn-ai-settings', 
                popover: { title: '1. 核心設定 (AI Key)', description: '一切的開始！請先點此設定 <b>Google Gemini API Key</b>。<br>有了它，系統才能幫您自動解題、生成詳解與格式化文字。' } 
            },
            { 
                element: '#pane-input', 
                popover: { title: '2. 題目輸入區', description: '您可以將 Word/PDF 的題目文字直接<b>複製貼上</b>到這裡。<br>或者使用上方的「📂 匯入」按鈕直接讀取檔案。' } 
            },
            { 
                // [修正 ID] btn-format -> btn-ai-parse
                element: '#btn-ai-parse', 
                popover: { title: '3. AI 智能格式化', description: '貼上雜亂的文字後，點擊這支<b>魔法棒</b>！<br>AI 會自動幫您辨識題號、選項與配分，將純文字轉換為可編輯的題庫卡片。' } 
            },
            
            // --- Phase 2: 編輯與增強 ---
            { 
                element: '#pane-preview', 
                popover: { title: '4. 題庫預覽與編輯', description: '整理好的題目會出現在這。<br>• <b>拖曳</b>卡片可調整順序<br>• 點擊<b>鉛筆</b>可修改內容<br>• 點擊<b>垃圾桶</b>可刪除題目' } 
            },
            { 
                // [修正 ID] btn-auto-solve -> btn-ai-solve
                element: '#btn-ai-solve', 
                popover: { title: '5. AI 自動解題', description: '沒有答案？沒問題！<br>點擊此按鈕，AI 會扮演學科專家，自動幫每一題填入<b>正確答案</b>並撰寫<b>詳細解析</b>。' } 
            },
            { 
                // [修正 ID] btn-similar -> btn-gen-similar
                element: '#btn-gen-similar', 
                popover: { title: '6. 生成類題 (舉一反三)', description: '覺得題目不夠練？<br>點擊此處，AI 會根據現有題目，生成邏輯相似的<b>雙胞胎考卷</b>，適合做為補救教學使用。' } 
            },

            // --- Phase 3: 輸出 ---
            { 
                element: 'button[data-tab="tab-export"]', 
                popover: { title: '7. 考前輸出中心', description: '題目準備好後，點擊此分頁準備列印。' } 
            },
            { 
                // [修正 ID] btn-export-word -> btn-export-word-student
                element: '#btn-export-word-student', 
                popover: { title: '8. 匯出 Word 試卷', description: '一鍵下載排版完美的 <b>docx 檔案</b>。<br>系統會同時產生「學生試卷 (無答案)」與「教師詳解卷 (含解析)」。' } 
            },
            { 
                // [修正 ID] btn-render-sheet -> btn-print-sheet-step1
                element: '#btn-print-sheet-step1', 
                popover: { title: '9. 產生電腦閱卷卡', description: '系統會根據您的題目數量 (20題/50題...)，自動生成專屬的<b>答案卡 PDF</b>，請列印給學生畫記。' } 
            },

            // --- Phase 4: 閱卷 ---
            { 
                element: 'button[data-tab="tab-grade"]', 
                popover: { title: '10. 數位閱卷中心', description: '考完試後，請切換到此分頁進行批改。' } 
            },
            { 
                element: '#btn-camera-grade', 
                popover: { title: '11. 拍照閱卷', description: '使用手機或 Webcam 拍下答案卡 (支援多張連拍)。<br>系統將使用<b>本地運算 (OpenCV)</b> 進行極速辨識，無需上傳雲端。' } 
            },
            { 
                element: '#btn-open-batch-review', 
                popover: { title: '12. 校對模式 (虛擬預覽)', description: '當您完成閱卷後，<b>這個橘色按鈕</b>就會出現。<br>點擊它即可開啟視窗，逐張檢查並修正判讀結果。<br>(目前為導覽暫時顯示，實際需先閱卷)', side: 'bottom' } 
            },
            { 
                element: '#btn-generate', 
                popover: { title: '13. 生成補救學習單', description: '這是最厲害的功能！<br>系統會根據<b>錯題數據</b>，為每位學生量身打造「專屬訂正卷」，只練習他不會的題目。' } 
            },

            // --- Phase 5: 結尾 ---
            { 
                element: '#btn-cloud-settings', 
                popover: { title: '14. 雲端備份', description: '最後，別忘了點擊右上角登入 Google。<br>將您的心血結晶備份到雲端，換電腦也能繼續工作！' } 
            }
        ],

        // [關鍵邏輯] 1. 切換分頁 -> 2. 檢查隱藏 -> 3. 強制顯示 -> 4. 刷新 Driver
        onHighlightStarted: (element) => {
            if (!element) return;

            // --- A. 清理上一步驟的強制顯示 ---
            if (tempShownElement && tempShownElement !== element) {
                restoreHiddenElement();
            }

            // --- B. 自動切換分頁 (Tab Switching) ---
            const navEdit = getNavBtn('tab-edit');
            const navExport = getNavBtn('tab-export');
            const navGrade = getNavBtn('tab-grade');

            // 1. Export 相關 (更新 ID: Step 8, 9)
            if (['btn-export-word-student', 'btn-print-sheet-step1'].includes(element.id)) {
                if (navExport && !navExport.classList.contains('active')) navExport.click();
            }
            // 2. Grade 相關 (Step 11, 12, 13)
            else if (['btn-camera-grade', 'btn-open-batch-review', 'btn-generate'].includes(element.id)) {
                if (navGrade && !navGrade.classList.contains('active')) navGrade.click();
            }
            // 3. Tab 按鈕本身
            else if (element === navExport) navExport?.click();
            else if (element === navGrade) navGrade?.click();
            // 4. Edit 相關 (更新 ID: Step 3, 5, 6)
            else if (['btn-ai-parse', 'btn-ai-solve', 'btn-gen-similar', 'pane-input', 'pane-preview'].includes(element.id) || (element.closest && element.closest('#tab-edit'))) {
                if (navEdit && !navEdit.classList.contains('active')) navEdit.click();
            }

            // --- C. 檢查並強制顯示隱藏按鈕 ---
            // 延遲一點點檢查，確保 Tab 切換完成
            const computedStyle = window.getComputedStyle(element);
            const isHidden = (computedStyle.display === 'none') || (element.offsetParent === null);

            if (isHidden) {
                element.style.display = 'inline-flex';
                element.style.boxShadow = '0 0 15px rgba(255, 152, 0, 0.8)';
                element.classList.add('tour-force-show');
                tempShownElement = element;

                if (driverObj && typeof driverObj.refresh === 'function') {
                    try { driverObj.refresh(); } catch(e) {}
                }
            }
        },

        onDestroyed: () => {
            restoreHiddenElement();
        }
    });

    driverObj.drive();
}