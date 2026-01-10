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
                case 'id': content = q.id; break;
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
    // 將題目按題號排序 (若是數字則按數值排，否則按字串排)
    const sorted = [...questions].sort((a,b) => {
        return parseInt(a.id) - parseInt(b.id) || a.id.localeCompare(b.id);
    });

    let rows = '';
    sorted.forEach(q => {
        // [新增] 顯示標準答案
        const ansBadge = q.ans ? `<span style="color:red; font-weight:bold;">[${q.ans}]</span>` : '';
        
        rows += `
            <tr>
                <td style="width:10%; text-align:center;">${q.id}</td>
                <td style="width:50%;">
                    ${q.text} <br>
                    ${ansBadge} </td>
                <td style="width:40%;">${q.expl}</td>
            </tr>
        `;
    });

    return `
        <div class="student-section page-break-active">
            <div class="worksheet-header">
                <h2 style="color: darkred;">教師解答總表</h2>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>題號</th>
                        <th>題目</th>
                        <th>解析/答案</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
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