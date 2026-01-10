/**
 * assets/js/modules/fileExtractor.js
 * 負責從 Word (.docx) 與 PDF (.pdf) 中提取純文字
 */

// 設定 PDF.js Worker 路徑 (使用 CDN)
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export async function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'docx') {
        if (!window.mammoth) throw new Error("Mammoth library load failed");
        const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return result.value;
    } 
    else if (ext === 'pdf') {
        if (!window.pdfjsLib) throw new Error("PDF.js library load failed");
        
        // 設定 Worker
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // 簡單合併字串
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }
        return fullText;
    }
    
    throw new Error("不支援的格式 (僅支援 .docx, .pdf)");
}

/**
 * 解析 Word (.docx)
 * 使用 Mammoth.js
 */
async function extractDocx(file) {
    if (!window.mammoth) throw new Error("Mammoth library not loaded");
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const arrayBuffer = event.target.result;
            window.mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                .then(function(result) {
                    resolve(result.value); // 提取的純文字
                })
                .catch(function(err) {
                    reject("Word 解析失敗: " + err.message);
                });
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 解析 PDF (.pdf)
 * 使用 PDF.js
 */
async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js library not loaded");

    // 設定 Worker
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";

    // 遍歷每一頁
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // 將該頁的文字片段組合成字串
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    if (!fullText.trim()) {
        throw new Error("PDF 解析後為空，該檔案可能是圖片掃描檔 (OCR 尚未支援)。");
    }

    return fullText;
}