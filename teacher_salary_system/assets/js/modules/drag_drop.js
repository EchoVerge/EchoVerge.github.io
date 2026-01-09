import { db } from './db.js';
import { state } from './state.js';
import { renderCalendar } from './calendar.js';

let draggedData = null;

export function initDragAndDrop() {
    const grid = document.getElementById('calendar');
    if (!grid) return;

    // 1. 開始拖曳
    grid.addEventListener('dragstart', (e) => {
        const cell = e.target.closest('.period-cell');
        if (!cell) return;

        const clickAttr = cell.getAttribute('onclick');
        if (!clickAttr) return;

        const params = parseOnclickParams(clickAttr);
        // 空格子或預覽的空格禁止拖曳，必須要有類型 (type)
        if (!params || !params.type) {
            e.preventDefault();
            return;
        }

        draggedData = params;
        e.dataTransfer.effectAllowed = 'move';
        // 設定資料以相容 Firefox
        e.dataTransfer.setData('text/plain', JSON.stringify(params));
        cell.classList.add('dragging');
    });

    // 2. 拖曳結束
    grid.addEventListener('dragend', (e) => {
        const cell = e.target.closest('.period-cell');
        if (cell) cell.classList.remove('dragging');
        draggedData = null; // 這裡會清空變數，導致非同步函式讀取失敗
        document.querySelectorAll('.period-cell').forEach(c => c.classList.remove('drag-over'));
    });

    // 3. 拖曳經過
    grid.addEventListener('dragover', (e) => {
        e.preventDefault(); // 必須 preventDefault 才能 drop
        const cell = e.target.closest('.period-cell');
        if (cell) {
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drag-over');
        }
    });

    // 4. 拖曳離開
    grid.addEventListener('dragleave', (e) => {
        const cell = e.target.closest('.period-cell');
        if (cell) cell.classList.remove('drag-over');
    });

    // 5. 放下
    grid.addEventListener('drop', async (e) => {
        e.preventDefault();
        const targetCell = e.target.closest('.period-cell');
        
        // [關鍵修正] 在這裡先把資料存下來，避免被 dragend 清空
        const dataToMove = draggedData; 

        if (!targetCell || !dataToMove) return;

        targetCell.classList.remove('drag-over');

        const targetAttr = targetCell.getAttribute('onclick');
        const targetParams = parseOnclickParams(targetAttr);
        
        if (!targetParams) return;

        const sourceDate = dataToMove.date;
        const sourcePeriod = dataToMove.period;
        const targetDate = targetParams.date;
        const targetPeriod = targetParams.period;

        // 位置沒變
        if (sourceDate === targetDate && sourcePeriod === targetPeriod) return;

        // 呼叫移動函式，並傳入我們剛才備份的 dataToMove
        await moveRecord(dataToMove, targetDate, targetPeriod);
    });
}

// 解析 onclick 參數
function parseOnclickParams(attrStr) {
    if (!attrStr) return null;
    const content = attrStr.substring(attrStr.indexOf('(') + 1, attrStr.lastIndexOf(')'));
    // 簡易 CSV 解析，處理單引號
    const parts = content.split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    
    return {
        date: parts[0],
        period: parseInt(parts[1]),
        type: parts[2],
        className: parts[3],
        note: parts[4],
        hasRecord: parts[5] === 'true',
        baseType: parts[6]
    };
}

// 移動紀錄邏輯 (接收 data 物件作為參數)
async function moveRecord(data, targetDate, targetPeriod) {
    const sourceDate = data.date;
    const sourcePeriod = data.period;

    try {
        // A. 檢查目標是否有「紀錄」
        const existingTarget = await db.records.where('[date+period]').equals([targetDate, targetPeriod]).first();
        if (existingTarget) {
            if (!confirm(`目標時段 (${targetDate} 第 ${targetPeriod} 節) 已有課程紀錄，確定要覆蓋嗎？`)) return;
        } 
        // B. 檢查目標是否有「基本課表」 (若無紀錄才檢查)
        else if (state.currentSemester && state.currentSemester.baseSchedule) {
            const d = new Date(targetDate);
            const day = d.getDay(); // 0-6
            const key = `${day}-${targetPeriod}`;
            const baseClass = state.currentSemester.baseSchedule[key];
            
            if (baseClass && baseClass.type) {
                if (!confirm(`目標時段 (${targetDate} 第 ${targetPeriod} 節) 原本是「${baseClass.type}」，確定要覆蓋嗎？`)) return;
            }
        }

        // C. 執行移動 (使用傳入的 data 變數)
        let recordToMove = null;

        if (data.hasRecord) {
            // 移動真實紀錄
            recordToMove = await db.records.where('[date+period]').equals([sourceDate, sourcePeriod]).first();
            if (recordToMove) {
                recordToMove.date = targetDate;
                recordToMove.period = targetPeriod;
                await db.records.put(recordToMove);
                // 刪除舊位置
                await db.records.where('[date+period]').equals([sourceDate, sourcePeriod]).delete();
            }
        } else {
            // 移動基本課表 (實體化為紀錄)
            if (!confirm(`您正在移動一堂「基本課表」。\n這將在目標位置 (${targetDate}) 新增一筆異動紀錄。確定嗎？`)) return;

            recordToMove = {
                date: targetDate,
                period: targetPeriod,
                type: data.type,
                className: data.className,
                note: data.note,
                semesterId: state.currentSemester ? state.currentSemester.id : null
            };
            await db.records.put(recordToMove);
        }

        renderCalendar();

    } catch (e) {
        console.error(e);
        alert('移動失敗: ' + e.message);
    }
}