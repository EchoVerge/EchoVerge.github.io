/**
 * assets/js/modules/viewRenderer.js
 * 畫面渲染模組 (支援動態欄位)
 */

export function createStudentSection(studentData, questions, config) {
    const seat = studentData['座號'] || studentData['seat'] || studentData['name'] || studentData['姓名'] || '未命名';
    const dateStr = new Date().toLocaleDateString();
    
    // 1. 產生 Table Header (根據使用者設定)
    let theadHtml = '<tr>';
    config.columns.forEach(col => {
        // 將寬度設定直接寫入 style
        theadHtml += `<th style="width: ${col.width}%;">${col.header}</th>`;
    });
    theadHtml += '</tr>';

    // 2. 產生 Table Body
    let tbodyHtml = '';
    questions.forEach(q => {
        tbodyHtml += '<tr>';
        
        // 根據欄位設定，決定每一格要放什麼資料
        config.columns.forEach(col => {
            let content = '';
            
            switch (col.type) {
                case 'id':
                    content = q.id;
                    break;
                case 'text':
                    content = q.text; // 支援 HTML 圖片
                    break;
                case 'expl':
                    content = q.expl; // 支援 HTML 圖片
                    break;
                case 'blank':
                default:
                    content = ''; // 空白作答區
                    break;
            }
            
            // 為了美觀，如果是空白欄，我們可以不填內容，或是填入 &nbsp;
            tbodyHtml += `<td style="width: ${col.width}%;">${content}</td>`;
        });
        
        tbodyHtml += '</tr>';
    });

    return `
        <div class="student-section">
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

export function refreshMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(err => console.error(err));
    }
}