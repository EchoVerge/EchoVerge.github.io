// assets/js/main.js
import { parseFile } from './modules/fileHandler.js';
import { createStudentSection, createTeacherKeySection, refreshMathJax } from './modules/viewRenderer.js';
import { downloadStudentTemplate, downloadQuestionTemplate } from './modules/templateManager.js';
import { initColumnManager, getColumnConfig } from './modules/columnManager.js';

let state = { students: null, questions: null };

const el = {
    fileStudents: document.getElementById('file-students'),
    fileQuestions: document.getElementById('file-questions'),
    btnGenerate: document.getElementById('btn-generate'),
    btnPrint: document.getElementById('btn-print'),
    statusMsg: document.getElementById('status-msg'),
    outputArea: document.getElementById('output-area'),
    inputTitle: document.getElementById('input-title'),
    // 進階選項
    chkPageBreak: document.getElementById('chk-page-break'),
    chkRandomize: document.getElementById('chk-randomize'),
    chkTeacherKey: document.getElementById('chk-teacher-key'),
    // 拖放區
    zoneStudent: document.getElementById('drop-zone-student'),
    zoneQuestion: document.getElementById('drop-zone-question'),
    // 儀表板
    dashboard: document.getElementById('analysis-dashboard'),
    analysisContent: document.getElementById('analysis-content')
};

// 初始化
initColumnManager();
setupDragAndDrop();

// 事件監聽
el.fileStudents.addEventListener('change', (e) => handleUpload(e.target.files[0], 'students'));
el.fileQuestions.addEventListener('change', (e) => handleUpload(e.target.files[0], 'questions'));
document.getElementById('btn-dl-student-template').addEventListener('click', downloadStudentTemplate);
document.getElementById('btn-dl-question-template').addEventListener('click', downloadQuestionTemplate);

el.btnGenerate.addEventListener('click', runGeneration);
el.btnPrint.addEventListener('click', () => window.print());

// --- 邏輯功能 ---

// 1. 拖放邏輯
function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    setupZone(el.zoneStudent, 'students');
    setupZone(el.zoneQuestion, 'questions');
}

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

function setupZone(zone, type) {
    zone.addEventListener('dragover', () => zone.classList.add('dragover'));
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        handleUpload(file, type);
    });
}

// 2. 檔案處理
async function handleUpload(file, type) {
    if (!file) return;
    try {
        const data = await parseFile(file);
        state[type] = data;
        
        if (state.students && state.questions) {
            el.btnGenerate.disabled = false;
            updateStatus("✅ 檔案就緒，請點擊生成", "green");
        } else {
            const missing = state.students ? "題庫檔" : "學生檔";
            updateStatus(`🆗 ${type==='students'?'學生檔':'題庫檔'} 已載入，請上傳 ${missing}`, "blue");
        }
    } catch (err) {
        alert("讀取失敗：" + err.message);
    }
}

// 3. 生成核心
function runGeneration() {
    if (!state.students || !state.questions) return;
    const qMap = buildQuestionMap(state.questions);
    const userColumns = getColumnConfig();

    const config = {
        title: el.inputTitle.value || "作業表",
        columns: userColumns,
        pageBreak: el.chkPageBreak.checked // 傳入分頁設定
    };
    
    const isRandom = el.chkRandomize.checked;
    
    el.outputArea.innerHTML = '';
    let count = 0;
    
    // 用於統計錯題頻率
    const errorStats = {};
    const usedQuestions = new Set(); // 紀錄所有出現過的題目(給解答本用)

    state.students.forEach(student => {
        let targetIds = extractQuestionIds(student);
        
        // 統計錯題
        targetIds.forEach(id => {
            errorStats[id] = (errorStats[id] || 0) + 1;
        });

        // 隨機排序
        if (isRandom) {
            targetIds.sort(() => Math.random() - 0.5);
        }

        const questionsToPrint = targetIds.map(id => qMap[id]).filter(q => {
            if(q) usedQuestions.add(q);
            return q;
        });

        if (questionsToPrint.length > 0) {
            const sectionHtml = createStudentSection(student, questionsToPrint, config);
            el.outputArea.innerHTML += sectionHtml;
            count++;
        }
    });

    // 4. 生成教師解答本
    if (el.chkTeacherKey.checked && usedQuestions.size > 0) {
        const keyHtml = createTeacherKeySection(Array.from(usedQuestions));
        el.outputArea.innerHTML += keyHtml;
    }

    // 5. 渲染分析儀表板
    renderDashboard(errorStats, qMap);

    // 完成
    updateStatus(`🎉 生成 ${count} 份作業`, "#1976D2");
    el.btnPrint.style.display = 'inline-block'; // 顯示列印按鈕
    refreshMathJax();
}

// 渲染錯題排行榜
function renderDashboard(stats, qMap) {
    el.dashboard.style.display = 'block';
    
    // 轉為陣列並排序 (錯越多越前面)
    const sorted = Object.entries(stats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // 取前五名

    const maxCount = sorted[0] ? sorted[0][1] : 1;

    let html = '';
    if (sorted.length === 0) {
        html = '<p>無錯題數據</p>';
    } else {
        sorted.forEach(([id, count]) => {
            const qText = qMap[id] ? qMap[id].text.substring(0, 20) + '...' : '(未知題目)';
            const percent = (count / maxCount) * 100;
            html += `
                <div class="analysis-bar-row">
                    <div class="analysis-label">題號 ${id}</div>
                    <div class="analysis-bar-container">
                        <div class="analysis-bar" style="width: ${percent}%;">${count}人錯 - ${qText}</div>
                    </div>
                </div>
            `;
        });
    }
    el.analysisContent.innerHTML = html;
}

// 輔助函式 (不變)
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