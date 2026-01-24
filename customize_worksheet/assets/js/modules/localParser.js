/**
 * assets/js/modules/localParser.js
 * V33.0: Anti-Glare & Stroke Enhancement (抗反光強化版)
 * * 新增: Gamma 校正 (壓暗反光筆跡)
 * * 新增: 侵蝕運算 (修補因反光而斷裂的筆劃)
 * * 調整: 放寬黑色像素門檻至 140 (配合 Ghost Bubble 的高容錯)
 */

export async function analyzeAnswerSheetLocal(base64Images, qCount) {
    console.log("🚀 啟動本地閱卷 (V33.0 Anti-Glare)...");
    
    if (typeof cv === 'undefined' || !cv.Mat) {
        await new Promise(r => setTimeout(r, 1000));
        if (typeof cv === 'undefined') {
            return base64Images.map((_, i) => ({ index: i, error: "OpenCV 未載入" }));
        }
    }

    const results = [];

    for (let i = 0; i < base64Images.length; i++) {
        const base64 = base64Images[i];
        let src = null, resized = null, gray = null, binary = null;
        let debugMat = null;
        let warped = null;

        try {
            const imgElement = await loadImage(base64);
            src = cv.imread(imgElement);

            const STANDARD_WIDTH = 1000;
            const scaleFactor = STANDARD_WIDTH / src.cols;
            const newHeight = Math.round(src.rows * scaleFactor);
            
            resized = new cv.Mat();
            cv.resize(src, resized, new cv.Size(STANDARD_WIDTH, newHeight), 0, 0, cv.INTER_AREA);
            debugMat = resized.clone();

            gray = new cv.Mat();
            cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY, 0);
            
            // 定位用的二值化 (保持原樣，定位點通常印刷良好不需抗反光)
            binary = new cv.Mat();
            cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 21, 5);

            let markers = findFiducialMarkers(binary, debugMat);
            if (!markers) {
                console.warn(`[#${i}] 未偵測到定位點，使用原圖`);
                warped = resized.clone();
            } else {
                warped = fourPointTransform(resized, markers);
            }
            
            // === [V33 核心修改] 影像增強處理 ===
            // 用於判讀的灰階圖，需進行抗反光處理
            let warpedGray = new cv.Mat();
            cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY, 0);

            // 1. Gamma Correction: 壓暗中間調 (修復反光變淡)
            enhanceContrast(warpedGray, 1.5);

            // 2. Erosion: 擴張黑色 (修復反光斷裂)
            // 使用 2x2 核，微幅修補即可，太大會導致選項沾黏
            let kernel = cv.Mat.ones(2, 2, cv.CV_8U);
            cv.erode(warpedGray, warpedGray, kernel);
            kernel.delete();

            // 產生定位用的二值化圖 (給 scanTrack 找格子用)
            let warpedBinary = new cv.Mat();
            cv.adaptiveThreshold(warpedGray, warpedBinary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);
            
            let debugWarped = warped.clone();

            // --- Phase A: 座號區 ---
            const seatROIX = { 
                xStart: Math.floor(warped.cols * 0.10),
                xEnd: Math.floor(warped.cols * 0.22),
                yStart: Math.floor(warped.rows * 0.06),
                yEnd: Math.floor(warped.rows * 0.11)
            };
            const seatROIY = {
                xStart: Math.floor(warped.cols * 0.04),
                xEnd: Math.floor(warped.cols * 0.10),
                yStart: Math.floor(warped.rows * 0.08),
                yEnd: Math.floor(warped.rows * 0.26)
            };

            let seatAnchorsX = scanTrack(warpedBinary, "horizontal", seatROIX, debugWarped, "small");
            let seatAnchorsY = scanTrack(warpedBinary, "vertical", seatROIY, debugWarped, "small");

            const seatResult = gradeSeatGrid(warpedGray, seatAnchorsX, seatAnchorsY, debugWarped);

            // --- Phase B: 題目區 ---
            const qTopROI = {
                yStart: Math.floor(warped.rows * 0.22),
                yEnd: Math.floor(warped.rows * 0.30)
            };
            const qLeftROI = {
                xStart: Math.floor(warped.cols * 0.01),
                xEnd: Math.floor(warped.cols * 0.08)
            };

            let xAnchors = scanTrack(warpedBinary, "horizontal", qTopROI, debugWarped, "normal");
            let yAnchors = scanTrack(warpedBinary, "vertical", qLeftROI, debugWarped, "normal");

            if (xAnchors.length < 5) xAnchors = generateTheoreticalAnchorsX(warped.cols);
            if (yAnchors.length < 5) yAnchors = generateTheoreticalAnchorsY(warped.rows);

            const { detectedAnswers } = gradeByGrid(warpedGray, xAnchors, yAnchors, debugWarped, qCount);

            const flatAnswers = new Array(qCount).fill("");
            detectedAnswers.forEach(item => {
                if (item.qIndex >= 1 && item.qIndex <= qCount) {
                    flatAnswers[item.qIndex - 1] = item.ans;
                }
            });

            let canvas = document.createElement('canvas');
            cv.imshow(canvas, debugWarped);
            const debugImgData = canvas.toDataURL('image/jpeg', 0.8);

            results.push({
                uuid: Date.now() + "_" + i,
                index: i,
                seat: seatResult || `Local_${i + 1}`,
                answers: flatAnswers,
                debugImage: debugImgData,
                error: (seatResult === null) ? "座號異常" : null
            });

            warpedGray.delete(); warpedBinary.delete();
            if(warped) warped.delete();
            debugWarped.delete();

        } catch (err) {
            console.error(err);
            results.push({ uuid: Date.now() + "_" + i, index: i, seat: `Err`, answers: [], error: err.message });
        } finally {
            if (src) src.delete();
            if (resized) resized.delete();
            if (gray) gray.delete();
            if (binary) binary.delete();
            if (debugMat) debugMat.delete();
        }
    }
    return results;
}

// --- 輔助函式: Gamma 校正 ---
function enhanceContrast(mat, gamma) {
    // 建立 Look Up Table (LUT) 加速運算
    let lut = new cv.Mat(1, 256, cv.CV_8UC1);
    for (let i = 0; i < 256; i++) {
        // Gamma 公式: ((i / 255) ^ gamma) * 255
        // Gamma > 1 會讓中間色調變暗
        let val = Math.pow(i / 255.0, gamma) * 255.0;
        val = Math.max(0, Math.min(255, val));
        lut.ucharPtr(0, i)[0] = val;
    }
    cv.LUT(mat, lut, mat);
    lut.delete();
}

function scanTrack(binaryImage, direction, range, debugMat, targetSize = "normal") {
    const candidates = [];
    let roiRect;
    if (direction === "horizontal") {
        roiRect = new cv.Rect(0, range.yStart, binaryImage.cols, range.yEnd - range.yStart);
    } else {
        roiRect = new cv.Rect(range.xStart, 0, range.xEnd - range.xStart, binaryImage.rows);
    }

    if(debugMat) {
        let pt1 = new cv.Point(roiRect.x, roiRect.y);
        let pt2 = new cv.Point(roiRect.x + roiRect.width, roiRect.y + roiRect.height);
        cv.rectangle(debugMat, pt1, pt2, [0, 0, 255, 255], 1); 
    }

    let roi = binaryImage.roi(roiRect);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(roi, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let filter = targetSize === "small" 
        ? { minA: 20, maxA: 450, minW: 4, maxW: 35, arMin: 0.4, arMax: 2.2 }
        : { minA: 50, maxA: 600, minW: 6, maxW: 35, arMin: 0.5, arMax: 2.0 };

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let rect = cv.boundingRect(cnt);
        let area = cv.contourArea(cnt);
        let ar = rect.width / rect.height;

        if (area > filter.minA && area < filter.maxA && 
            rect.width >= filter.minW && rect.width <= filter.maxW && 
            rect.height >= filter.minW && rect.height <= filter.maxW &&
            ar >= filter.arMin && ar <= filter.arMax) {
            
            let pos = (direction === "horizontal") ? (roiRect.x + rect.x + rect.width/2) : (roiRect.y + rect.y + rect.height/2);
            let align = (direction === "horizontal") ? (roiRect.y + rect.y + rect.height/2) : (roiRect.x + rect.x + rect.width/2);
            candidates.push({ pos: pos, alignVal: align });
        }
    }
    contours.delete(); hierarchy.delete(); roi.delete();

    if (candidates.length > 0) {
        const alignValues = candidates.map(c => c.alignVal).sort((a, b) => a - b);
        const median = alignValues[Math.floor(alignValues.length / 2)];
        const TOLERANCE = 20;
        let rawAnchors = candidates.filter(c => Math.abs(c.alignVal - median) <= TOLERANCE).map(c => c.pos).sort((a, b) => a - b);
        
        const MERGE_DIST = 15;
        const merged = [];
        if (rawAnchors.length > 0) {
            let group = [rawAnchors[0]];
            for (let i = 1; i < rawAnchors.length; i++) {
                if (rawAnchors[i] - rawAnchors[i-1] < MERGE_DIST) group.push(rawAnchors[i]);
                else { merged.push(group.reduce((a,b)=>a+b,0)/group.length); group = [rawAnchors[i]]; }
            }
            merged.push(group.reduce((a,b)=>a+b,0)/group.length);
        }
        
        if(debugMat) {
            merged.forEach(pos => {
                let p1 = (direction === "horizontal") ? new cv.Point(pos, roiRect.y) : new cv.Point(roiRect.x, pos);
                let p2 = (direction === "horizontal") ? new cv.Point(pos, roiRect.y+roiRect.height) : new cv.Point(roiRect.x+roiRect.width, pos);
                cv.line(debugMat, p1, p2, [0, 255, 0, 255], 2);
            });
        }
        return merged;
    }
    return [];
}

function gradeSeatGrid(grayImage, xAnchors, yAnchors, debugMat) {
    if (xAnchors.length < 2 || yAnchors.length < 10) return null;
    const validX = xAnchors.slice(0, 2);
    const validY = yAnchors.slice(0, 10);
    let seatDigits = [];

    for (let i = 0; i < 2; i++) {
        let x = validX[i];
        let candidates = [];
        for (let j = 0; j < 10; j++) {
            let y = validY[j];
            // [V32/33] Ghost Bubble 模式: 檢查 16px, 內縮 3px
            let ratio = getDarkRatio(grayImage, x, y, 16, 3);
            candidates.push({ digit: j, ratio: ratio, pt: {x,y} });
        }
        candidates.sort((a, b) => b.ratio - a.ratio);
        const best = candidates[0];
        const second = candidates[1];
        
        // 座號判定邏輯
        if (best.ratio > 0.35 && ((best.ratio - second.ratio > 0.15) || best.ratio > 0.60)) {
            seatDigits.push(best.digit);
            cv.rectangle(debugMat, new cv.Point(best.pt.x-8, best.pt.y-8), new cv.Point(best.pt.x+8, best.pt.y+8), [255,0,0,255], -1);
        } else {
            return null;
        }
    }
    return seatDigits.join(""); 
}

function gradeByGrid(grayImage, xAnchors, yAnchors, debugMat, qCount) {
    const finalDetected = [];
    const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
    if (xAnchors.length < 5 || yAnchors.length < 5) return { detectedAnswers: [] };

    let colGroups = [];
    let currentGroup = [];
    for(let i=0; i<xAnchors.length; i++) {
        if(i > 0 && (xAnchors[i] - xAnchors[i-1] > 50)) { colGroups.push(currentGroup); currentGroup = []; }
        currentGroup.push(xAnchors[i]);
    }
    if(currentGroup.length > 0) colGroups.push(currentGroup);

    colGroups.forEach((colX, colIndex) => {
        if (colX.length < 5) return;
        const validX = colX.slice(0, 5);
        const startQ = (colIndex * 20) + 1;

        for (let j = 0; j < yAnchors.length; j++) {
            const qNum = startQ + j;
            if (qNum > qCount) continue;
            const y = yAnchors[j];

            let rowOptions = [];
            validX.forEach((x, optIdx) => {
                // [V33] 門檻放寬至 140，配合 Gamma 與 Erosion，能有效捕捉反光筆跡
                let ratio = getDarkRatio(grayImage, x, y, 16, 3);
                rowOptions.push({ opt: OPTIONS[optIdx], ratio: ratio, pt: {x,y} });
            });

            // 相對判定邏輯
            let sortedRatios = [...rowOptions].sort((a, b) => a.ratio - b.ratio);
            let noiseFloor = sortedRatios[2].ratio; 
            const DYNAMIC_THRESHOLD = Math.max(0.40, noiseFloor + 0.15);

            let selected = [];
            rowOptions.forEach(item => {
                let pt1 = new cv.Point(item.pt.x-8, item.pt.y-8);
                let pt2 = new cv.Point(item.pt.x+8, item.pt.y+8);
                if (item.ratio > DYNAMIC_THRESHOLD) {
                    selected.push(item.opt);
                    cv.rectangle(debugMat, pt1, pt2, [0, 255, 0, 255], -1);
                }
            });

            finalDetected.push({ qIndex: qNum, ans: selected.join("") });
        }
    });
    return { detectedAnswers: finalDetected };
}

function getDarkRatio(grayImg, cx, cy, size, padding) {
    let x = Math.floor(cx - size / 2);
    let y = Math.floor(cy - size / 2);
    if (x < 0 || y < 0 || x + size > grayImg.cols || y + size > grayImg.rows) return 0;

    let rect = new cv.Rect(x, y, size, size);
    let roi = grayImg.roi(rect);
    let innerRect = new cv.Rect(padding, padding, size - 2 * padding, size - 2 * padding);
    
    if (innerRect.width <= 0 || innerRect.height <= 0) innerRect = new cv.Rect(0, 0, size, size);
    
    let innerRoi = roi.roi(innerRect);
    let darkCount = 0;
    const totalPixels = innerRoi.rows * innerRoi.cols;
    
    for (let r = 0; r < innerRoi.rows; r++) {
        for (let c = 0; c < innerRoi.cols; c++) {
            // [V33調整] 將黑色門檻從 128 放寬到 140
            // 因為我們用了 Ghost Bubble (#d0d0d0 ≈ 208)，這裡放寬到 140 非常安全
            // 這讓那些因為反光而變亮 (例如值為 135) 的筆跡能被正確抓到
            if (innerRoi.ucharPtr(r, c)[0] < 140) darkCount++;
        }
    }
    innerRoi.delete(); roi.delete();
    return darkCount / totalPixels;
}

// 保留輔助函式 (理論值生成、定位點等)
function generateTheoreticalAnchorsX(width) {
    const anchors = [];
    const colWidth = width / 4;
    const startOffset = 75; 
    for(let c=0; c<4; c++) {
        let baseX = c * colWidth + startOffset;
        for(let k=0; k<5; k++) anchors.push(baseX + k * 35);
    }
    return anchors;
}
function generateTheoreticalAnchorsY(height) {
    const anchors = [];
    const startY = height * 0.271; 
    const endY = height * 0.95;
    const gap = (endY - startY) / 20;
    for(let i=0; i<20; i++) anchors.push(startY + i * gap + gap/2);
    return anchors;
}
function findFiducialMarkers(binaryImage, debugMat) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binaryImage, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = [];
    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area >= 150 && area <= 3000) {
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.04 * cv.arcLength(cnt, true), true);
            if (approx.rows === 4 && cv.isContourConvex(approx)) {
                let rect = cv.boundingRect(approx);
                let ar = rect.width / parseFloat(rect.height);
                if (ar >= 0.7 && ar <= 1.3) candidates.push({ x: rect.x+rect.width/2, y: rect.y+rect.height/2, contour: approx });
                else approx.delete();
            } else approx.delete();
        }
        cnt.delete();
    }
    contours.delete(); hierarchy.delete();
    if (candidates.length < 4) return null;
    const w = binaryImage.cols;
    const h = binaryImage.rows;
    const corners = [{x:0,y:0}, {x:w,y:0}, {x:w,y:h}, {x:0,y:h}];
    let best = [null,null,null,null];
    let minDists = [Infinity,Infinity,Infinity,Infinity];
    candidates.forEach(cand => {
        for(let i=0; i<4; i++) {
            let d = Math.pow(cand.x - corners[i].x, 2) + Math.pow(cand.y - corners[i].y, 2);
            if (d < minDists[i]) { minDists[i] = d; best[i] = cand; }
        }
    });
    if (best.some(m => m === null)) return null;
    candidates.forEach(c => { if(c.contour) c.contour.delete(); });
    return best;
}
function fourPointTransform(image, markers) {
    const pts = markers.map(m => ({x: m.x, y: m.y}));
    pts.sort((a,b) => a.x - b.x);
    let lefts = pts.slice(0,2).sort((a,b)=>a.y-b.y);
    let rights = pts.slice(2,4).sort((a,b)=>a.y-b.y);
    const sorted = [lefts[0], rights[0], rights[1], lefts[1]]; 
    const maxWidth = 1000; const maxHeight = 1414;
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [sorted[0].x, sorted[0].y, sorted[1].x, sorted[1].y, sorted[2].x, sorted[2].y, sorted[3].x, sorted[3].y]);
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight]);
    let M = cv.getPerspectiveTransform(srcTri, dstTri);
    let warped = new cv.Mat();
    cv.warpPerspective(image, warped, M, new cv.Size(maxWidth, maxHeight));
    srcTri.delete(); dstTri.delete(); M.delete();
    return warped;
}
function loadImage(base64) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(`圖片載入失敗`);
        img.src = base64.startsWith('data:') ? base64 : "data:image/jpeg;base64," + base64;
    });
}