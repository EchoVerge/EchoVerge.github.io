/**
 * assets/js/modules/fileExtractor.js
 * V2.0: 整合版 - 同時支援「文字提取(匯入題庫)」與「影像轉換(閱卷)」
 */

// ==========================================
//  Part 1: 影像轉換 (給 GradingController 用)
// ==========================================

/**
 * 將 PDF 檔案轉換為圖片陣列 (Base64 Strings)
 * 用於閱卷系統將 PDF 考卷轉為圖片進行辨識
 */
export async function convertPdfToImages(file) {
    return new Promise(async (resolve, reject) => {
        try {
            if (typeof pdfjsLib === 'undefined') {
                return reject(new Error("PDF.js library not loaded. 請確認 index.html"));
            }

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            const totalPages = pdf.numPages;
            const images = [];
            const scale = 2.0; // 解析度設定

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };

                await page.render(renderContext).promise;
                
                // Export as JPEG (Base64 without prefix)
                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                const rawBase64 = base64.split(',')[1];
                images.push(rawBase64);
            }

            resolve(images);
        } catch (err) {
            console.error("PDF 轉圖片失敗:", err);
            reject(err);
        }
    });
}

/**
 * Word 轉圖片 (目前僅為佔位符)
 */
export async function convertWordToImages(file) {
    console.warn("目前尚未支援 Word 直接轉圖片閱卷，請先轉存為 PDF。");
    return [];
}


// ==========================================
//  Part 2: 文字提取 (給 EditorController 用)
// ==========================================

/**
 * 從檔案中提取純文字 (支援 .docx, .pdf, .txt, .csv)
 * 這是 editorController.js 第 12 行所需的函式
 */
export async function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    try {
        if (ext === 'docx') {
            return await extractDocx(file);
        } else if (ext === 'pdf') {
            return await extractPdfText(file);
        } else if (['txt', 'csv', 'md'].includes(ext)) {
            return await readTextFile(file);
        } else {
            throw new Error(`不支援的檔案格式: .${ext}`);
        }
    } catch (err) {
        console.error("文字提取失敗:", err);
        throw err;
    }
}

// --- 內部輔助函式 (Internal Helpers) ---

async function extractDocx(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error("Mammoth library not loaded (docx support missing)");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value; // 純文字內容
}

async function extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error("PDF.js library not loaded");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    // 遍歷所有頁面提取文字
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // 將該頁的文字片段組合成字串
        const strings = content.items.map(item => item.str);
        fullText += strings.join(" ") + "\n\n";
    }
    return fullText;
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error("讀取文字檔失敗"));
        reader.readAsText(file); // 預設使用 UTF-8
    });
}