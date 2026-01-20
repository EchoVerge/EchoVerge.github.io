/**
 * assets/js/modules/localParser.js
 * V31.0: 視覺化除錯增強版 + 動態相對閾值 (Dynamic Threshold)
 * * 修正: 解決陰影導致的誤判問題 (Unmarked items identified as marked)
 * * 邏輯: 從「絕對黑度判定」改為「相對環境黑度判定」
 */

export async function analyzeAnswerSheetLocal(base64Images, qCount) {
    console.log("🚀 啟動本地閱卷 (V31.0 Dynamic Threshold)...");
    
    // 檢查 OpenCV 狀態
    if (typeof cv === 'undefined' || !cv.Mat) {
        // 嘗試等待
        await new Promise(r => setTimeout(r, 1000));
        if (typeof cv === 'undefined') {
            return base64Images.map((_, i) => ({ 
                index: i, 
                error: "OpenCV 尚未載入，請重新整理頁面" 
            }));
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

            // 1. 標準化 (1000px)
            const STANDARD_WIDTH = 1000;
            const scaleFactor = STANDARD_WIDTH / src.cols;
            const newHeight = Math.round(src.rows * scaleFactor);
            
            resized = new cv.Mat();
            cv.resize(src, resized, new cv.Size(STANDARD_WIDTH, newHeight), 0, 0, cv.INTER_AREA);
            debugMat = resized.clone();

            // 2. 影像前處理
            gray = new cv.Mat();
            cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY, 0);
            binary = new cv.Mat();
            // 參數微調: block size 15->21 減少雜訊
            cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 21, 5);

            // 3. 四角透視校正
            let markers = findFiducialMarkers(binary, debugMat);
            if (!markers) {
                console.warn(`[#${i}] 未偵測到四角定位點，使用原圖掃描`);
                warped = resized.clone();
            } else {
                warped = fourPointTransform(resized, markers);
            }
            
            let warpedGray = new cv.Mat();
            cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY, 0);
            let warpedBinary = new cv.Mat();
            cv.adaptiveThreshold(warpedGray, warpedBinary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);
            
            // 建立除錯圖 (用來畫框框)
            let debugWarped = warped.clone();

            // ==========================================
            //  Phase A: 座號區 (10px 小框)
            // ==========================================
            // 放寬搜尋範圍 (ROI) 以容許偏移
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

            // ==========================================
            //  Phase B: 題目區 (13px 標準框)
            // ==========================================
            // 放寬搜尋範圍
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

            // [補償機制] 若定位點不足，使用理論值
            if (xAnchors.length < 5) {
                console.warn("X軸定位點不足，啟用理論推算");
                cv.putText(debugWarped, "Warning: Use Theoretical X", new cv.Point(50, 50), cv.FONT_HERSHEY_SIMPLEX, 1, [255, 0, 0, 255], 2);
                xAnchors = generateTheoreticalAnchorsX(warped.cols);
            }
            if (yAnchors.length < 5) {
                console.warn("Y軸定位點不足，啟用理論推算");
                cv.putText(debugWarped, "Warning: Use Theoretical Y", new cv.Point(50, 80), cv.FONT_HERSHEY_SIMPLEX, 1, [255, 0, 0, 255], 2);
                yAnchors = generateTheoreticalAnchorsY(warped.rows);
            }

            // 題目判讀
            const { detectedAnswers } = gradeByGrid(
                warpedGray, 
                xAnchors, 
                yAnchors, 
                debugWarped, 
                qCount
            );

            // ==========================================
            //  Phase C: 結果整合
            // ==========================================

            const flatAnswers = new Array(qCount).fill("");
            detectedAnswers.forEach(item => {
                if (item.qIndex >= 1 && item.qIndex <= qCount) {
                    flatAnswers[item.qIndex - 1] = item.ans;
                }
            });

            // 產生 Debug 圖片 (包含紅框藍框)
            let canvas = document.createElement('canvas');
            cv.imshow(canvas, debugWarped);
            const debugImgData = canvas.toDataURL('image/jpeg', 0.8);

            const finalSeat = seatResult || `Local_${i + 1}`; 

            results.push({
                uuid: Date.now() + "_" + i,
                index: i,
                seat: finalSeat,
                answers: flatAnswers,
                debugImage: debugImgData,
                error: (seatResult === null) ? "座號異常" : null
            });

            // 清理
            warpedGray.delete(); warpedBinary.delete();
            if(warped) warped.delete();
            debugWarped.delete();

        } catch (err) {
            console.error(err);
            results.push({ 
                uuid: Date.now() + "_" + i,
                index: i,
                seat: `Err_${i+1}`, 
                answers: [], 
                error: err.message,
                debugImage: null 
            });
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

// ==========================================
//  核心演算法
// ==========================================

function scanTrack(binaryImage, direction, range, debugMat, targetSize = "normal") {
    const candidates = [];
    let roiRect;

    // 1. 定義搜尋區域 (ROI)
    if (direction === "horizontal") {
        roiRect = new cv.Rect(0, range.yStart, binaryImage.cols, range.yEnd - range.yStart);
    } else {
        roiRect = new cv.Rect(range.xStart, 0, range.xEnd - range.xStart, binaryImage.rows);
    }

    // [Visual Debug]
    if(debugMat) {
        let pt1 = new cv.Point(roiRect.x, roiRect.y);
        let pt2 = new cv.Point(roiRect.x + roiRect.width, roiRect.y + roiRect.height);
        cv.rectangle(debugMat, pt1, pt2, [0, 0, 255, 255], 1); 
    }

    let roi = binaryImage.roi(roiRect);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    
    cv.findContours(roi, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let filter;
    if (targetSize === "small") {
        filter = { minA: 20, maxA: 450, minW: 4, maxW: 35, arMin: 0.4, arMax: 2.2 };
    } else {
        filter = { minA: 50, maxA: 600, minW: 6, maxW: 35, arMin: 0.5, arMax: 2.0 };
    }

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let rect = cv.boundingRect(cnt);
        let area = cv.contourArea(cnt);
        let ar = rect.width / rect.height;

        if (area > filter.minA && area < filter.maxA && 
            rect.width >= filter.minW && rect.width <= filter.maxW && 
            rect.height >= filter.minW && rect.height <= filter.maxW &&
            ar >= filter.arMin && ar <= filter.arMax) {
            
            let globalCenterX = roiRect.x + rect.x + rect.width / 2;
            let globalCenterY = roiRect.y + rect.y + rect.height / 2;
            
            candidates.push({ 
                pos: direction === "horizontal" ? globalCenterX : globalCenterY, 
                alignVal: direction === "horizontal" ? globalCenterY : globalCenterX 
            });
        }
    }
    
    contours.delete(); hierarchy.delete(); roi.delete();

    if (candidates.length > 0) {
        // 2. 過濾偏離太遠的雜訊
        const alignValues = candidates.map(c => c.alignVal).sort((a, b) => a - b);
        const median = alignValues[Math.floor(alignValues.length / 2)];
        const TOLERANCE = 20;

        let rawAnchors = candidates.filter(c => Math.abs(c.alignVal - median) <= TOLERANCE)
                                   .map(c => c.pos)
                                   .sort((a, b) => a - b);
        
        // 3. 合併過於接近的線條
        const MERGE_DIST = 15;
        const mergedAnchors = [];
        
        if (rawAnchors.length > 0) {
            let currentGroup = [rawAnchors[0]];
            
            for (let i = 1; i < rawAnchors.length; i++) {
                if (rawAnchors[i] - rawAnchors[i-1] < MERGE_DIST) {
                    currentGroup.push(rawAnchors[i]);
                } else {
                    const avg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
                    mergedAnchors.push(avg);
                    currentGroup = [rawAnchors[i]]; 
                }
            }
            const avg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
            mergedAnchors.push(avg);
        }

        if(debugMat) {
            mergedAnchors.forEach(pos => {
                let p1, p2;
                if (direction === "horizontal") {
                    p1 = new cv.Point(pos, roiRect.y);
                    p2 = new cv.Point(pos, roiRect.y + roiRect.height);
                } else {
                    p1 = new cv.Point(roiRect.x, pos);
                    p2 = new cv.Point(roiRect.x + roiRect.width, pos);
                }
                cv.line(debugMat, p1, p2, [0, 255, 0, 255], 2);
            });
        }

        return mergedAnchors;
    }
    return [];
}

/**
 * [修改] 座號識別：改用「最大值競爭」邏輯
 * 強制找出每欄中最黑的那個，且必須顯著黑於第二名，避免陰影誤判
 */
function gradeSeatGrid(grayImage, xAnchors, yAnchors, debugMat) {
    if (xAnchors.length < 2 || yAnchors.length < 10) return null;

    const validX = xAnchors.slice(0, 2);
    const validY = yAnchors.slice(0, 10);
    let seatDigits = [];

    // 針對兩個座號欄位
    for (let i = 0; i < 2; i++) {
        let x = validX[i];
        let candidates = [];

        // 掃描 0-9
        for (let j = 0; j < 10; j++) {
            let y = validY[j];
            let size = 18;
            let ratio = getDarkRatio(grayImage, x, y, size, 5);
            candidates.push({ digit: j, ratio: ratio, pt: {x, y} });
        }

        // 排序：黑度由大到小
        candidates.sort((a, b) => b.ratio - a.ratio);
        
        const best = candidates[0];
        const second = candidates[1];

        // 判定門檻：
        // 1. 基礎門檻 0.35 (比絕對的 0.45 寬鬆一點，因為我們依賴相對差距)
        // 2. 差距門檻 0.15 (第一名必須比第二名黑 15% 以上)
        // 3. 強制通過門檻 0.60 (如果超級黑，就算第二名也黑，還是算它)
        const MIN_THRESHOLD = 0.35;
        const RELATIVE_GAP = 0.15;
        const FORCE_PASS = 0.60;

        // 繪製結果到 Debug 圖
        candidates.forEach(c => {
             let pt1 = new cv.Point(c.pt.x - 9, c.pt.y - 9);
             let pt2 = new cv.Point(c.pt.x + 9, c.pt.y + 9);
             if (c === best && (c.ratio > MIN_THRESHOLD)) {
                 // 這是候選人，根據最終結果決定畫什麼色
                 // (這裡先不畫，下面決定後再畫)
             } else {
                 // 其他落選者 -> 灰色淡框
                 cv.rectangle(debugMat, pt1, pt2, [200, 200, 200, 100], 1);
             }
        });

        // 決策
        let isValid = false;
        if (best.ratio > MIN_THRESHOLD) {
            if ((best.ratio - second.ratio > RELATIVE_GAP) || (best.ratio > FORCE_PASS)) {
                seatDigits.push(best.digit);
                isValid = true;
                // 畫出選取的紅色實心
                let pt1 = new cv.Point(best.pt.x - 9, best.pt.y - 9);
                let pt2 = new cv.Point(best.pt.x + 9, best.pt.y + 9);
                cv.rectangle(debugMat, pt1, pt2, [255, 0, 0, 255], -1); 
            }
        }

        if (!isValid) return null; // 該欄位無法辨識
    }

    return seatDigits.join(""); 
}

/**
 * [修改] 題目識別：改用「動態相對門檻」邏輯
 * 計算每一題的「背景噪音值」，只有顯著黑於背景的才算答案
 */
function gradeByGrid(grayImage, xAnchors, yAnchors, debugMat, qCount) {
    const finalDetected = [];
    const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
    
    if (xAnchors.length < 5 || yAnchors.length < 5) return { detectedAnswers: [] };

    let colGroups = [];
    let currentGroup = [];
    
    // 將 X 軸座標分組 (每 5 個一組)
    for(let i=0; i<xAnchors.length; i++) {
        if(i > 0 && (xAnchors[i] - xAnchors[i-1] > 50)) {
            colGroups.push(currentGroup);
            currentGroup = [];
        }
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
            
            // 1. 收集該題所有選項的黑度
            let rowOptions = [];
            validX.forEach((x, optIdx) => {
                let size = 18;
                let ratio = getDarkRatio(grayImage, x, y, size, 5);
                rowOptions.push({
                    opt: OPTIONS[optIdx],
                    ratio: ratio,
                    pt: {x, y}
                });
            });

            // 2. 計算該題的「環境噪音基線」
            // 取中位數 (Median) 作為基準。
            // 如果整題都在陰影下，中位數會很高(例如0.5)，那我們就需要 >0.65 才算有劃記
            // 如果整題很乾淨，中位數很低(例如0.05)，我們用基礎門檻(0.40)來把關
            let sortedRatios = [...rowOptions].sort((a, b) => a.ratio - b.ratio);
            let medianRatio = sortedRatios[2].ratio; // 取中間值

            // 設定動態門檻
            const BASE_THRESHOLD = 0.40; // 絕對最低要求
            const GAP_THRESHOLD = 0.15;  // 相對差距要求
            
            // 最終門檻 = Max(絕對門檻, 環境噪音 + 差距)
            const DYNAMIC_THRESHOLD = Math.max(BASE_THRESHOLD, medianRatio + GAP_THRESHOLD);

            let selectedOptions = [];

            rowOptions.forEach(item => {
                let pt1 = new cv.Point(item.pt.x - 9, item.pt.y - 9);
                let pt2 = new cv.Point(item.pt.x + 9, item.pt.y + 9);

                if (item.ratio > DYNAMIC_THRESHOLD) {
                    selectedOptions.push(item.opt);
                    // 填答: 綠色實心
                    cv.rectangle(debugMat, pt1, pt2, [0, 255, 0, 255], -1); 
                } else {
                    // 未填 (或被視為陰影): 不做標記或畫淡色框
                    // cv.rectangle(debugMat, pt1, pt2, [200, 200, 200, 50], 1); 
                }
            });

            finalDetected.push({
                qIndex: qNum,
                ans: selectedOptions.join("")
            });
        }
    });

    return { detectedAnswers: finalDetected };
}

/**
 * 計算指定區域內的「黑色像素比例」 (抗噪核心)
 * @returns {number} 0.0 ~ 1.0 的黑色佔比
 */
function getDarkRatio(grayImg, cx, cy, size, padding) {
    let x = Math.floor(cx - size / 2);
    let y = Math.floor(cy - size / 2);
    if (x < 0 || y < 0 || x + size > grayImg.cols || y + size > grayImg.rows) {
        return 0;
    }

    let rect = new cv.Rect(x, y, size, size);
    let roi = grayImg.roi(rect);
    let innerRect = new cv.Rect(padding, padding, size - 2 * padding, size - 2 * padding);
    
    if (innerRect.width <= 0 || innerRect.height <= 0) {
        innerRect = new cv.Rect(0, 0, size, size);
    }
    
    let innerRoi = roi.roi(innerRect);
    let darkCount = 0;
    const totalPixels = innerRoi.rows * innerRoi.cols;
    
    for (let r = 0; r < innerRoi.rows; r++) {
        for (let c = 0; c < innerRoi.cols; c++) {
            let pixelValue = innerRoi.ucharPtr(r, c)[0];
            // 掃描檔的墨水通常在 0~100 之間，紙張在 200~255
            if (pixelValue < 128) {
                darkCount++;
            }
        }
    }

    innerRoi.delete();
    roi.delete();
    return darkCount / totalPixels;
}

function generateTheoreticalAnchorsX(width) {
    const anchors = [];
    const colWidth = width / 4;
    const startOffset = 75; 
    for(let c=0; c<4; c++) {
        let baseX = c * colWidth + startOffset;
        for(let k=0; k<5; k++) {
            anchors.push(baseX + k * 35); 
        }
    }
    return anchors;
}

function generateTheoreticalAnchorsY(height) {
    const anchors = [];
    const startY = height * 0.271; 
    const endY = height * 0.95;
    const totalRows = 20;
    const gap = (endY - startY) / totalRows;
    for(let i=0; i<totalRows; i++) {
        anchors.push(startY + i * gap + gap/2);
    }
    return anchors;
}

function findFiducialMarkers(binaryImage, debugMat) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binaryImage, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates = [];
    const minArea = 150;
    const maxArea = 3000; 

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area >= minArea && area <= maxArea) {
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.04 * cv.arcLength(cnt, true), true);
            if (approx.rows === 4 && cv.isContourConvex(approx)) {
                let rect = cv.boundingRect(approx);
                let ar = rect.width / parseFloat(rect.height);
                if (ar >= 0.7 && ar <= 1.3) {
                    candidates.push({ x: rect.x + rect.width/2, y: rect.y + rect.height/2, contour: approx });
                } else { approx.delete(); }
            } else { approx.delete(); }
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

    const maxWidth = 1000;
    const maxHeight = 1414;

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