/**
 * assets/js/modules/viewRenderer.js
 * 負責渲染試卷 HTML (學生卷、解答卷)
 */

export function createStudentSection(studentData, questions, config) {
    // 取得學生識別資訊 (相容各種可能的欄位名)
    const seat = studentData['座號'] || studentData['seat'] || studentData['name'] || '未命名';
    const dateStr = new Date().toLocaleDateString();
    
    // 決定分頁樣式 (依據使用者設定)
    const sectionClass = config.pageBreak ? 'student-section page-break-active' : 'student-section page-break-none';

    // 1. 建立表頭 (thead)
    let theadHtml = '<tr>';
    config.columns.forEach(col => {
        theadHtml += `<th style="width: ${col.width}%;">${col.header}</th>`;
    });
    theadHtml += '</tr>';

    // 2. 建立內容 (tbody)
    let tbodyHtml = '';
    
    questions.forEach(q => {
        // --- A. 原題目列 ---
        tbodyHtml += '<tr>';
        config.columns.forEach(col => {
            let content = '';
            // 根據設定檔決定每一欄要顯示什麼
            switch (col.type) {
                case 'id': 
                    content = q.id; 
                    if (q.score && parseFloat(q.score) > 0) {
                         content += ` <span style="font-size:0.8em; color:#666;">(${q.score}分)</span>`;
                    }
                    break;
                case 'text': content = q.text; break;
                case 'expl': content = q.expl; break;
                case 'blank': content = ''; break; // 空白欄
                default: content = ''; break;
            }
            tbodyHtml += `<td style="width: ${col.width}%;">${content}</td>`;
        });
        tbodyHtml += '</tr>';

        // --- B. 類題列 (若該題有生成類題) ---
        if (q.similar) {
            // 類題會跨越所有欄位 (colspan)，形成一個獨立區塊
            tbodyHtml += `
                <tr class="similar-row">
                    <td colspan="${config.columns.length}">
                        <div class="similar-block">
                            <span class="similar-label">✨ 類題演練 (請嘗試作答)</span>
                            <div class="similar-text">${q.similar.text}</div>
                            
                            <div class="similar-expl" style="display:none;">
                                <strong>解析：</strong>${q.similar.expl}
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }
    });

    // 3. 組合最終 HTML
    return `
        <div class="${sectionClass}">
            <div class="worksheet-header">
                <h2>${config.title}</h2>
                <div class="worksheet-info">
                    <span>姓名/座號：<strong>${seat}</strong></span>
                    <span>日期：${dateStr}</span>
                </div>
            </div>
            <table>
                <thead>${theadHtml}</thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
        </div>
    `;
}

/**
 * 生成教師解答總表 (包含所有題目的解析)
 */
export function createTeacherKeySection(questions) {
    if (!questions || questions.length === 0) return '<div class="no-data">無題目資料</div>';

    let html = `
    <div class="paper-sheet">
        <div class="paper-header">
            <h2>詳解卷 (Teacher's Key)</h2>
            <p>包含完整題目、圖片、正確答案與解析。</p>
        </div>
        <div class="paper-content">
    `;

    questions.forEach((q, index) => {
        html += `
        <div class="q-item-full">
            <div class="q-header">
                <span class="q-id">${q.id}.</span>
                <span class="q-ans-badge">答案：${q.ans || '無'}</span>
                ${q.score && parseFloat(q.score) > 0 ? `<span style="font-size:0.9em; color:#666; margin-left:10px;">(${q.score}分)</span>` : ''}
            </div>
            
            ${q.img ? `<div class="q-img-container"><img src="${q.img}" class="q-img-display"></div>` : ''}
            
            <div class="q-text">${q.text}</div>
            
            ${q.expl ? `<div class="q-expl"><strong>解析：</strong>${q.expl}</div>` : ''}

            ${q.similar ? `
                <div class="q-similar-block">
                    <div class="sim-label">★ 類題演練</div>
                    <div class="sim-content">
                        ${q.similar.text}
                        <div class="sim-meta">
                            <span>答案：${q.similar.ans}</span>
                            ${q.similar.expl ? `<span>解析：${q.similar.expl}</span>` : ''}
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
        `;
    });

    html += `</div></div>`;
    
    // 加入基本 CSS 讓圖片不跑版
    html += `
    <style>
        .q-item-full { margin-bottom: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 15px; page-break-inside: avoid; }
        .q-header { margin-bottom: 5px; font-weight: bold; color: #333; }
        .q-ans-badge { background: #e8f5e9; color: #2e7d32; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; margin-left: 10px; }
        .q-text { white-space: pre-wrap; line-height: 1.6; margin: 10px 0; }
        .q-img-container { margin: 10px 0; text-align: center; }
        .q-img-display { max-width: 100%; max-height: 300px; border: 1px solid #eee; border-radius: 4px; }
        .q-expl { background: #fff8e1; padding: 10px; border-radius: 6px; font-size: 0.95em; color: #5d4037; }
        .q-similar-block { margin-top: 10px; border-left: 3px solid #9c27b0; padding-left: 10px; background: #f3e5f5; padding: 8px; border-radius: 0 4px 4px 0; }
        .sim-label { color: #7b1fa2; font-weight: bold; font-size: 0.9em; margin-bottom: 5px; }
    </style>
    `;

    return html;
}

/**
 * 重新渲染 MathJax 數學公式
 * (在 DOM 更新後必須呼叫此函式，公式才會顯示)
 */
export function refreshMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(err => console.error(err));
    }
}