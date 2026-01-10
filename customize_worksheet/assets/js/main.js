// assets/js/main.js

import { parseFile } from './modules/fileHandler.js';
import { createStudentSection, refreshMathJax } from './modules/viewRenderer.js';
import { downloadStudentTemplate, downloadQuestionTemplate } from './modules/templateManager.js';
// 新增引入
import { initColumnManager, getColumnConfig } from './modules/columnManager.js';

let state = {
    students: null,
    questions: null
};

const el = {
    fileStudents: document.getElementById('file-students'),
    fileQuestions: document.getElementById('file-questions'),
    btnGenerate: document.getElementById('btn-generate'),
    statusMsg: document.getElementById('status-msg'),
    outputArea: document.getElementById('output-area'),
    inputTitle: document.getElementById('input-title'),
    // 新增：欄位設定容器
    colContainer: document.getElementById('column-manager-container'),
    btnDlStudent: document.getElementById('btn-dl-student-template'),
    btnDlQuestion: document.getElementById('btn-dl-question-template')
};

// --- 初始化 ---
// 啟動欄位設定介面
initColumnManager(el.colContainer);

// --- 事件監聽 ---
el.fileStudents.addEventListener('change', (e) => handleUpload(e.target.files[0], 'students'));
el.fileQuestions.addEventListener('change', (e) => handleUpload(e.target.files[0], 'questions'));
el.btnGenerate.addEventListener('click', runGeneration);
el.btnDlStudent.addEventListener('click', downloadStudentTemplate);
el.btnDlQuestion.addEventListener('click', downloadQuestionTemplate);

// --- 邏輯功能 ---
async function handleUpload(file, type) {
    if (!file) return;
    try {
        const data = await parseFile(file);
        state[type] = data;
        
        if (state.students && state.questions) {
            el.btnGenerate.disabled = false;
            updateStatus("✅ 檔案已就緒，請設定欄位後點擊生成", "green");
        } else {
            const missing = state.students ? "題庫檔" : "學生檔";
            updateStatus(`🆗 ${type === 'students' ? '學生檔' : '題庫檔'} 已載入，請繼續上傳 ${missing}`, "blue");
        }
    } catch (err) {
        alert("讀取失敗：" + err.message);
        console.error(err);
    }
}

function runGeneration() {
    if (!state.students || !state.questions) return;
    const qMap = buildQuestionMap(state.questions);
    
    // 1. 取得使用者的欄位設定
    const userColumns = getColumnConfig();

    const config = {
        title: el.inputTitle.value || "作業表",
        columns: userColumns // 傳遞欄位設定
    };
    
    el.outputArea.innerHTML = '';
    let count = 0;

    state.students.forEach(student => {
        const targetIds = extractQuestionIds(student);
        const questionsToPrint = targetIds.map(id => qMap[id]).filter(q => q);

        if (questionsToPrint.length > 0) {
            // 將 config 傳給渲染器
            const sectionHtml = createStudentSection(student, questionsToPrint, config);
            el.outputArea.innerHTML += sectionHtml;
            count++;
        }
    });

    updateStatus(`🎉 已生成 ${count} 份作業`, "#1976D2");
    refreshMathJax();
}

// ... 底下的輔助函式 (buildQuestionMap, extractQuestionIds) 維持不變 ...
// ... 請複製之前的程式碼 ...
function buildQuestionMap(data) {
    const map = {};
    data.forEach(row => {
        const id = String(row['題號'] || row['id'] || '').trim();
        if (id) {
            map[id] = {
                id: id,
                text: row['題目'] || row['question'] || '',
                expl: row['解析'] || row['answer'] || row['explanation'] || ''
            };
        }
    });
    return map;
}

function extractQuestionIds(student) {
    let ids = [];
    Object.keys(student).forEach(key => {
        if ((key.toLowerCase().includes('question') || key.includes('題')) && 
            !key.includes('列表') && !key.includes('list')) {
            const val = student[key];
            if (val) ids.push(String(val).trim());
        }
    });
    const listCol = student['list'] || student['questions'] || student['errors'] || student['錯題列表'];
    if (listCol) {
        const strList = String(listCol);
        const splitIds = strList.split(/[,，、\s]+/).map(s => s.trim()).filter(s => s);
        ids = ids.concat(splitIds);
    }
    return [...new Set(ids)];
}

function updateStatus(msg, color) {
    el.statusMsg.textContent = msg;
    el.statusMsg.style.color = color || "black";
}