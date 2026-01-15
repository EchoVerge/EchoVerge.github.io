/**
 * assets/js/modules/answerSheetRenderer.js
 * V3.7: 
 * 1. 實作自動分頁機制 (Pagination)
 * 2. 設定標準滿版頁面容量為 75 題 (25題 x 3欄)
 * 3. 超過 75 題自動產生下一頁，不限頁數，解決爆框問題
 */

export function createAnswerSheet(title, qCount) {
    // 判斷省紙模式 (閾值 45 題)
    const isCompact = qCount <= 45;

    // --- 1. 省紙模式 (<= 45 題) ---
    // 維持上下各一張 (每欄 15 題)
    if (isCompact) {
        const contentHtml = generateContentHtml(title, 1, qCount, 15, true);
        return `
            <div class="sheet-page compact" style="height: 100vh; display: flex; flex-direction: column;">
                <div class="sheet-half" style="flex: 1; display: flex; justify-content: center; align-items: center; padding: 15px; border-bottom: 1px dashed #ccc;">
                    ${createFramedContent(contentHtml)}
                </div>
                <div class="sheet-half" style="flex: 1; display: flex; justify-content: center; align-items: center; padding: 15px;">
                    ${createFramedContent(contentHtml)}
                </div>
            </div>
        `;
    }

    // --- 2. 多頁模式 (> 45 題) ---
    // 設定每頁標準題數為 75 (25 row * 3 col)
    const QUESTIONS_PER_PAGE = 75; 
    const totalPages = Math.ceil(qCount / QUESTIONS_PER_PAGE);

    // 如果頁數大於 1，顯示詳細的分頁資訊提示
    if (totalPages > 1) {
        // 動態生成分頁資訊字串
        let pageInfoStr = '';
        for (let p = 1; p <= totalPages; p++) {
            const pStart = (p - 1) * QUESTIONS_PER_PAGE + 1;
            const pEnd = Math.min(p * QUESTIONS_PER_PAGE, qCount);
            pageInfoStr += `• 第 ${p} 頁：題號 ${pStart} ~ ${pEnd}\n`;
        }

        const msg = `⚠️ 題目共 ${qCount} 題，系統將自動分為 ${totalPages} 頁：\n\n` +
                    `${pageInfoStr}\n` +
                    `確定要繼續產生嗎？`;
        
        if (!confirm(msg)) return '';
    }

    let fullHtml = '';

    // 迴圈產生每一頁
    for (let page = 1; page <= totalPages; page++) {
        // 計算該頁的起始與結束題號
        const startNo = (page - 1) * QUESTIONS_PER_PAGE + 1;
        const endNo = Math.min(page * QUESTIONS_PER_PAGE, qCount);
        
        // 第一頁才顯示座號區
        const isFirstPage = (page === 1);
        
        // 標題處理：第二頁開始加上頁碼
        const pageTitle = isFirstPage ? title : `${title} - p.${page}`;

        // 產生該頁內容 (固定每欄 25 題)
        const contentHtml = generateContentHtml(pageTitle, startNo, endNo, 25, isFirstPage);

        // 包裝成完整頁面
        fullHtml += `
            <div class="sheet-page" style="padding: 20px; height: 100vh; box-sizing: border-box; display: flex; justify-content: center;">
                <div style="width: 100%; height: 100%;">
                    ${createFramedContent(contentHtml)}
                </div>
            </div>
        `;
    }

    return fullHtml;
}

/**
 * 通用外框產生器 (黑框 + 90% 縮放)
 */
function createFramedContent(innerHtml) {
    return `
        <div style="
            width: 100%; 
            height: 100%; 
            border: 3px solid #000; 
            box-sizing: border-box; 
            padding: 15px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center; 
            border-radius: 6px;
        ">
            <div style="
                transform: scale(0.9); 
                width: 111.11%; 
                transform-origin: center center;
            ">
                ${innerHtml}
            </div>
        </div>
    `;
}

/**
 * 核心內容生成器
 * @param {string} title 標題
 * @param {number} startNo 開始題號
 * @param {number} endNo 結束題號
 * @param {number} rowsPerCol 每欄幾題
 * @param {boolean} includeSeat 是否包含座號區
 */
function generateContentHtml(title, startNo, endNo, rowsPerCol, includeSeat) {
    const qCount = endNo - startNo + 1;

    // --- 1. 建構座號區 ---
    let seatTableHtml = '';
    
    if (includeSeat) {
        let seatRows = '';
        for (let i = 0; i < 10; i++) {
            seatRows += `
                <tr>
                    <td style="font-weight:bold; width:20px; text-align:right; padding-right:4px;">${i}</td>
                    <td style="padding:1px 2px;"><div class="bubble seat-bubble" style="width:20px; height:20px; line-height:18px; font-size:12px;">${i}</div></td>
                    <td style="padding:1px 2px;"><div class="bubble seat-bubble" style="width:20px; height:20px; line-height:18px; font-size:12px;">${i}</div></td>
                </tr>
            `;
        }
        
        // 畫記示範區 (含強制列印背景色樣式)
        seatTableHtml = `
            <div style="
                justify-self: start; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                border: 1px solid #666; 
                padding: 5px; 
                border-radius: 4px; 
                background: #fff;
                width: fit-content;
            ">
                <div style="font-weight:bold; margin-bottom:5px; border-bottom:1px solid #000; width:100%; text-align:center;">座號</div>
                <table class="ans-table seat-table" style="width: auto;">
                    <thead>
                        <tr>
                            <th></th>
                            <th style="font-size:12px; text-align:center;">十</th>
                            <th style="font-size:12px; text-align:center;">個</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${seatRows}
                    </tbody>
                </table>
                <div style="margin-top: 8px; border-top: 1px dashed #666; padding-top: 6px; width: 100%; font-size: 11px; line-height: 1.3; color: #333;">
                    <div style="font-weight: bold; text-align: center; margin-bottom: 3px; font-size: 12px;">畫記說明</div>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 5px; margin-bottom: 5px;">
                        <span>正確:</span>
                        <div class="bubble" style="width:16px; height:16px; background:#000; border-color:#000;-webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
                    </div>
                    <ul style="padding-left: 14px; margin: 0; list-style-type: disc;">
                        <li>塗黑塗滿</li>
                        <li>不可塗出格子</li>
                        <li>修正務必清除</li>
                        <li>不可書寫文字</li>
                    </ul>
                    <small>若違反劃記規定導致<br>讀卡錯誤，後果由考<br>生自行承擔</small>
                </div>
            </div>
        `;
    }

    // --- 2. 建構題目區 ---
    const questionColCount = Math.ceil(qCount / rowsPerCol);
    
    let gridItems = [];
    if (includeSeat) {
        gridItems.push(seatTableHtml);
    }

    for (let c = 0; c < questionColCount; c++) {
        let tableRows = '';
        for (let r = 0; r < rowsPerCol; r++) {
            const currentQNum = startNo + (c * rowsPerCol) + r;
            if (currentQNum > endNo) break;
            
            tableRows += `
                <tr>
                    <td style="font-weight:bold; width:30px;">${currentQNum}</td>
                    <td><div class="bubble">A</div></td>
                    <td><div class="bubble">B</div></td>
                    <td><div class="bubble">C</div></td>
                    <td><div class="bubble">D</div></td>
                    <td><div class="bubble">E</div></td>
                </tr>
            `;
        }
        
        gridItems.push(`
            <table class="ans-table" style="width: auto; justify-self: start;">
                ${tableRows}
            </table>
        `);
    }

    // --- 3. Grid 容器設定 ---
    let gridTemplate = ``;
    gridItems.forEach((item, index) => {
        // 第一個項目如果是座號區，給予適當寬度
        if (includeSeat && index === 0) {
            gridTemplate += ` max-content`;
        } else {
            gridTemplate += ` 1fr`;
        }
    });

    const gridHtml = `
        <div style="
            display: grid; 
            grid-template-columns: ${gridTemplate}; 
            width: 100%; 
            gap: 15px; 
            align-items: start; 
            justify-items: start;
        ">
            ${gridItems.join('')}
        </div>
    `;

    // --- 4. 回傳完整內容 ---
    return `
        <div class="ans-header">
            <div class="ans-header-title">${title} 答案卡</div>
            <div class="ans-header-info">
                班級：<div class="info-box"></div> 
                座號：<div class="info-box" style="width:50px;"></div> 
                姓名：<div class="info-box"></div>
            </div>
        </div>
        <div style="margin-top: 10px; width: 100%;">
            ${gridHtml}
        </div>
    `;
}