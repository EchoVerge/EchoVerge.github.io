const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// ... (fetchAvailableModels 保持不變) ...
export async function fetchAvailableModels(apiKey) {
    try {
        const res = await fetch(`${BASE_URL}/models?key=${apiKey}`);
        if(!res.ok) throw new Error("Key 無效");
        const data = await res.json();
        return data.models
            .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', ''))
            .sort((a,b) => a.includes('flash') ? -1 : 1);
    } catch(e) { throw e; }
}

// 通用呼叫函式 (含錯誤處理與 Markdown 清理)
async function callGemini(key, model, contents) {
    const url = `${BASE_URL}/models/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: contents,
            generationConfig: { responseMimeType: "application/json" } // 強制 JSON 模式
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "AI 連線錯誤");
    }

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    
    // 清理 Markdown 標記
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("AI 回傳了非 JSON 格式:", text);
        throw new Error("AI 解析失敗，回傳格式錯誤");
    }
}

// 1. 題目解析
export async function parseWithGemini(apiKey, model, text) {
    const prompt = `
    請將以下試題轉為 JSON 陣列。
    格式範例：[{"id":"1","text":"題目內文(含選項)","expl":"解析與答案"}]。
    規則：忽略頁首頁尾，自動合併斷行。
    
    內容：
    ${text}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

// 2. 答案卡閱卷
export async function analyzeAnswerSheet(base64Image, model, apiKey, qCount) {
    const prompt = `
    這是一張答案卡。
    任務：
    1. 辨識 "座號" (Seat)。
    2. 辨識第 1 至 ${qCount} 題的作答 (A,B,C,D,E)。未作答回傳 null。
    
    回傳 JSON：
    {
        "seat": "05",
        "answers": { "1": "A", "2": "C", ... }
    }`;
    
    return await callGemini(apiKey, model, [{
        parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
    }]);
}

// 3. 生成類題
export async function generateSimilarQuestions(qText, model, apiKey) {
    const prompt = `請根據此題生成 1 題類題。JSON格式：{"id":"類題","text":"...","expl":"..."}。\n原題：${qText}`;
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}

// 4. 改寫解析 (注意：這裡回傳純文字，不是 JSON，所以不用 callGemini)
export async function rewriteExplanation(expl, qText, style, model, apiKey) {
    const prompt = `題目：${qText}\n解析：${expl}\n任務：${style==='simple'?'用白話文解釋給小學生聽':'用蘇格拉底反問法引導'}。直接回傳文字。`;
    
    const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

// 5. [新增] 批次生成類題 (一次處理多題以節省 API 呼叫)
export async function generateSimilarQuestionsBatch(questions, model, apiKey) {
    // 精簡資料以減少 Token 消耗 (只傳 ID 和 題目)
    const simpleList = questions.map(q => ({ id: q.id, text: q.text }));
    
    const prompt = `
    你是一位專業教師。請為以下題目列表，產生「對應的複習類題」。
    
    規則：
    1. 每一題都要產生一題類題 (Similar Question)。
    2. 類題要模仿原題的觀念與難度，但數字或情境需改變。
    3. 回傳一個 JSON 陣列，順序需對應。
    
    格式範例 (JSON Array)：
    [
        {"id":"1", "similarText":"(類題內容...)", "similarExpl":"(類題簡解...)"},
        {"id":"2", "similarText":"...", "similarExpl":"..."}
    ]

    題目列表：
    ${JSON.stringify(simpleList)}
    `;

    // 呼叫原本的 callGemini 函式
    // 注意：這裡假設你原本的 callGemini 已經定義在 aiParser.js 內部
    // 如果 callGemini 沒有 export，請確保這個函式放在同一個檔案內
    return await callGemini(apiKey, model, [{ parts: [{ text: prompt }] }]);
}