export function createAnswerSheet(title, count) {
    return `<div class="answer-sheet-page">${renderSheet(title,count)}<div class="cut-line">✂️ 裁切線 ✂️</div>${renderSheet(title,count)}</div>`;
}
function renderSheet(title, count) {
    let qHtml = '';
    for(let i=1; i<=count; i++) {
        qHtml += `<div class="q-row"><span class="q-num">${i}.</span><div class="q-options">${['A','B','C','D','E'].map(o=>`<div class="bubble-opt">${o}</div>`).join('')}</div></div>`;
    }
    return `<div class="answer-sheet-card"><div class="as-header"><div class="as-title">${title}</div><div class="as-info">班級:___ 座號:___</div></div><div class="as-body"><div class="seat-section"><div class="section-label">座號</div><div class="seat-grid"><div class="seat-col">十位${renderBubbles()}</div><div class="seat-col">個位${renderBubbles()}</div></div></div><div class="question-section"><div class="section-label">作答區</div><div class="question-grid">${qHtml}</div></div></div></div>`;
}
function renderBubbles() {
    let h=''; for(let i=0;i<10;i++) h+=`<div class="bubble-row"><span class="bubble-num">${i}</span><div class="bubble-circle"></div></div>`;
    return h;
}