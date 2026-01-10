// assets/js/modules/viewRenderer.js

export function createStudentSection(studentData, questions, config) {
    const seat = studentData['座號'] || studentData['seat'] || studentData['name'] || '未命名';
    const dateStr = new Date().toLocaleDateString();
    
    // 決定分頁樣式
    const sectionClass = config.pageBreak ? 'student-section page-break-active' : 'student-section page-break-none';

    let theadHtml = '<tr>';
    config.columns.forEach(col => {
        theadHtml += `<th style="width: ${col.width}%;">${col.header}</th>`;
    });
    theadHtml += '</tr>';

    let tbodyHtml = '';
    questions.forEach(q => {
        tbodyHtml += '<tr>';
        config.columns.forEach(col => {
            let content = '';
            switch (col.type) {
                case 'id': content = q.id; break;
                case 'text': content = q.text; break;
                case 'expl': content = q.expl; break;
                default: content = ''; break;
            }
            tbodyHtml += `<td style="width: ${col.width}%;">${content}</td>`;
        });
        tbodyHtml += '</tr>';
    });

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

// 新增：生成教師解答本
export function createTeacherKeySection(questions) {
    // 將題目按題號排序 (若是數字則按數值排)
    const sorted = [...questions].sort((a,b) => {
        return parseInt(a.id) - parseInt(b.id) || a.id.localeCompare(b.id);
    });

    let rows = '';
    sorted.forEach(q => {
        rows += `
            <tr>
                <td style="width:10%; text-align:center;">${q.id}</td>
                <td style="width:50%;">${q.text}</td>
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

export function refreshMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(err => console.error(err));
    }
}