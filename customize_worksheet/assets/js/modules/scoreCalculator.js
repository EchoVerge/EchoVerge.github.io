/**
 * assets/js/modules/scoreCalculator.js
 * 負責處理單題的計分邏輯 與 成績匯出
 * V2.4: 支援單題獨立配分 (Mixed Scoring)
 */

export const ScoringModes = {
    STRICT: 'strict',      // 全對才給分
    DEDUCT_20: 'deduct_20', // 錯一個選項扣 20%
    DEDUCT_40: 'deduct_40', // 錯一個選項扣 40%
    HALF: 'half'            // 錯一個選項扣 50%
};

/**
 * 計算單題得分比例 (保留供其他模組參考，Excel 內將改用公式計算)
 */
export function calculateScoreRatio(studentAns, keyAns, questionMeta, mode = ScoringModes.STRICT) {
    if (questionMeta && questionMeta.isBonus) return 1;

    const s = normalize(studentAns);
    const k = normalize(keyAns);

    if (!s) return 0;
    if (s === k) return 1;
    if (k.length <= 1) return 0;

    if (mode === ScoringModes.STRICT) {
        return 0;
    } else {
        const mistakes = calculateMistakes(s, k);
        let penaltyPerMistake = 0;
        switch (mode) {
            case ScoringModes.DEDUCT_20: penaltyPerMistake = 0.2; break;
            case ScoringModes.DEDUCT_40: penaltyPerMistake = 0.4; break;
            case ScoringModes.HALF: penaltyPerMistake = 0.5; break;
            default: return 0;
        }
        const score = 1 - (mistakes * penaltyPerMistake);
        return Math.max(0, score); 
    }
}

function normalize(str) {
    if (!str) return "";
    return (str.match(/[a-zA-Z]/g) || []).map(c => c.toUpperCase()).sort().join('');
}

function calculateMistakes(studentStr, keyStr) {
    const sSet = new Set(studentStr.split(''));
    const kSet = new Set(keyStr.split(''));
    let mistakes = 0;
    sSet.forEach(char => { if (!kSet.has(char)) mistakes++; });
    kSet.forEach(char => { if (!sSet.has(char)) mistakes++; });
    return mistakes;
}

/**
 * 匯出成績至 Excel
 * Sheet 1: 學生作答明細 (含自動寫入的 LAMBDA 算分公式)
 * Sheet 2: 題目參數設定 (支援個別配分)
 * Sheet 3: 測驗資訊 (含倒扣參數驗證)
 */
export function exportGradesToExcel(answerMap, questions, fullScore = 100, examTitle = "測驗") {
    if (!window.XLSX) return alert("Excel 模組尚未載入，請稍候再試");
    
    // --- Sheet 1: 學生作答明細 ---
    
    // 1. 表頭
    const headers = ['座號', '總分 (自動運算)']; 
    const questionCount = questions.length;
    for (let i = 1; i <= questionCount; i++) {
        headers.push(String(i));
    }

    // 2. 標準答案列
    // C2:CCC2 是標準答案區
    const keyRow = ['標準答案', '-'];
    questions.forEach(q => {
        let ans = q.ans || "?";
        ans = normalize(ans);
        keyRow.push(ans);
    });

    // 3. 學生資料列 (建構公式)
    const sortedSeats = Object.keys(answerMap).sort((a, b) => {
        return parseInt(a) - parseInt(b) || a.localeCompare(b);
    });

    const studentRows = [];
    sortedSeats.forEach((seat, index) => {
        const answers = answerMap[seat];
        
        // 計算當前 Excel 列號 (Header是1, Key是2, 學生從3開始)
        const r = index + 3;

        // ★ 建構 Excel 公式字串 (LAMBDA)
        const formula = `
            =SUM(
            LET(
                mask, C${r}:CCC${r}<>"",
                idx, FILTER(SEQUENCE(1, COLUMNS(C${r}:CCC${r})), mask),
                ans, FILTER(C${r}:CCC${r}, mask),
                key, FILTER(C$2:CCC$2, mask),
                types, XLOOKUP(idx, 題目參數設定!$A:$A, 題目參數設定!$C:$C),
                limits, NUMBERVALUE(XLOOKUP(idx, 題目參數設定!$A:$A, 題目參數設定!$D:$D)),
                MAP(ans, key, types, limits, LAMBDA(a,b,t,max_val,
                    IF(t="單選",
                        (a=b) * max_val,
                        LET(
                            cA, SUBSTITUTE(a, " ", ""),
                            cB, SUBSTITUTE(b, " ", ""),
                            diff_len, IF(OR(cA="", cB=""), 0,
                                LEN(LET(
                                    txtA, MID(cA, SEQUENCE(LEN(cA)), 1),
                                    txtB, MID(cB, SEQUENCE(LEN(cB)), 1),
                                    resA, FILTER(txtA, ISNA(XMATCH(txtA, txtB)), ""),
                                    resB, FILTER(txtB, ISNA(XMATCH(txtB, txtA)), ""),
                                    TEXTJOIN("", TRUE, resA, resB)
                                ))
                            ),
                            penalty, diff_len * (測驗資訊!$B$6),
                            final_score, max_val - penalty,
                            IF(final_score < 0, 0, final_score)
                        )
                    )
                ))
            )
            )
        `.replace(/\s+/g, ' ');

        const row = [seat, formula]; 
        
        for (let i = 0; i < questionCount; i++) {
            let ans = answers[i] || "";
            if (Array.isArray(ans)) ans = ans.join('');
            row.push(normalize(ans)); 
        }
        studentRows.push(row);
    });

    const wsData1 = [headers, keyRow, ...studentRows];
    const ws1 = XLSX.utils.aoa_to_sheet(wsData1);

    // --- Sheet 2: 題目參數設定 (Type & Score) ---
    
    // [改進] 智慧配分邏輯
    // 1. 先計算已設定分數的總和
    const assignedTotal = questions.reduce((sum, q) => sum + (parseFloat(q.score) || 0), 0);
    // 2. 計算未設定分數的題數
    const unassignedCount = questions.filter(q => !q.score || parseFloat(q.score) === 0).length;
    
    let defaultScore = 0;
    if (unassignedCount > 0) {
        // 3. 將剩餘分數平均分配給未設定的題目
        const remaining = Math.max(0, fullScore - assignedTotal);
        defaultScore = Math.round((remaining / unassignedCount) * 10) / 10;
    }

    const configHeaders = ['題號', '標準答案', '題型 (自動判斷)', '配分'];
    const configRows = questions.map((q, idx) => {
        const ans = normalize(q.ans || "?");
        const type = ans.length > 1 ? '多選' : '單選';
        
        // 使用個別配分，若無則使用平均配分
        const finalScore = (q.score && parseFloat(q.score) > 0) ? parseFloat(q.score) : defaultScore;
        
        return [idx + 1, ans, type, finalScore];
    });

    const wsData2 = [configHeaders, ...configRows];
    const ws2 = XLSX.utils.aoa_to_sheet(wsData2);

    // --- Sheet 3: 測驗資訊 (Meta Info) ---
    
    const metaHeaders = ['項目', '內容'];
    const metaRows = [
        ['測驗名稱', examTitle],
        ['測驗日期', new Date().toLocaleDateString()],
        ['滿分設定', fullScore],
        ['總題數', questions.length],
        ['多選題倒扣設定 (扣N個選項分)', 1] // B6 預設值
    ];

    const wsData3 = [metaHeaders, ...metaRows];
    const ws3 = XLSX.utils.aoa_to_sheet(wsData3);

    // 設定 B6 資料驗證
    if (!ws3['!datavalidation']) ws3['!datavalidation'] = [];
    ws3['!datavalidation'].push({
        sqref: 'B6',
        type: 'whole',
        operator: 'between', 
        formula1: '1',
        formula2: '5',
        showErrorMessage: true,
        errorTitle: '輸入錯誤',
        error: '請輸入 1 到 5 之間的整數作為倒扣係數'
    });

    // --- 建立 Workbook 並匯出 ---
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "成績與作答明細");
    XLSX.utils.book_append_sheet(wb, ws2, "題目參數設定");
    XLSX.utils.book_append_sheet(wb, ws3, "測驗資訊");

    const filename = `${examTitle}_成績計算_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
}