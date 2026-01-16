/**
 * assets/js/modules/localParser.js
 * V29.0: 完美融合版 (Perfect Fusion)
 * * 核心架構: 基於 V21.0 (答案解析最穩定的版本)
 * * 新增功能: 移植 V27.0 的座號解析邏輯 (Phase A)
 * * 關鍵技術: scanTrack 支援 "normal" (V21參數) 與 "small" (V27參數) 雙模式，互不干擾
 */

export async function analyzeAnswerSheetLocal(base64Images, qCount) {
    console.log("🚀 啟動本地閱卷 (V29.0 Fusion)...");
    
    if (typeof cv === 'undefined' || !cv.Mat) {
        await new Promise(r => setTimeout(r, 1000));
        if (typeof cv === 'undefined') throw new Error("OpenCV 載入失敗");
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
            cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);

            // 3. 四角透視校正
            let markers = findFiducialMarkers(binary, debugMat);
            if (!markers) {
                console.warn("未偵測到四角定位點，嘗試使用原圖");
                warped = resized.clone();
            } else {
                warped = fourPointTransform(resized, markers);
            }
            
            let warpedGray = new cv.Mat();
            cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY, 0);
            let warpedBinary = new cv.Mat();
            cv.adaptiveThreshold(warpedGray, warpedBinary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 13, 2);
            
            let debugWarped = warped.clone();

            // ==========================================
            //  Phase A: 座號區解析 (移植自 V27.0)
            // ==========================================
            // 使用 "small" 模式，專門針對 10px 定位點
            
            const seatROIX = { 
                xStart: Math.floor(warped.cols * 0.11), 
                xEnd: Math.floor(warped.cols * 0.20),
                yStart: Math.floor(warped.rows * 0.065), 
                yEnd: Math.floor(warped.rows * 0.10) 
            };
            
            const seatROIY = {
                xStart: Math.floor(warped.cols * 0.045),
                xEnd: Math.floor(warped.cols * 0.095),
                yStart: Math.floor(warped.rows * 0.085), // 確保包含 '0'
                yEnd: Math.floor(warped.rows * 0.25)
            };

            let seatAnchorsX = scanTrack(warpedBinary, "horizontal", seatROIX, debugWarped, "small");
            let seatAnchorsY = scanTrack(warpedBinary, "vertical", seatROIY, debugWarped, "small");

            const seatResult = gradeSeatGrid(warpedGray, seatAnchorsX, seatAnchorsY, debugWarped);


            // ==========================================
            //  Phase B: 題目區解析 (保留 V21.0 設定)
            // ==========================================
            // 使用 "normal" 模式，參數與 V21.0 完全一致
            
            const qTopROI = {
                yStart: Math.floor(warped.rows * 0.24), 
                yEnd: Math.floor(warped.rows * 0.28)
            };
            
            const qLeftROI = {
                xStart: Math.floor(warped.cols * 0.02),
                xEnd: Math.floor(warped.cols * 0.07)
            };

            let xAnchors = scanTrack(warpedBinary, "horizontal", qTopROI, debugWarped, "normal");
            let yAnchors = scanTrack(warpedBinary, "vertical", qLeftROI, debugWarped, "normal");

            // [補償機制] (V21.0)
            if (xAnchors.length < 5) {
                console.warn("X軸定位點不足，啟用理論推算");
                xAnchors = generateTheoreticalAnchorsX(warped.cols);
            }
            if (yAnchors.length < 5) {
                console.warn("Y軸定位點不足，啟用理論推算");
                yAnchors = generateTheoreticalAnchorsY(warped.rows);
            }

            // 題目判讀 (V21.0)
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

            let canvas = document.createElement('canvas');
            cv.imshow(canvas, debugWarped);

            // 如果座號解析成功，使用解析出的座號；否則標記 Unknown
            // 為了不因為座號失敗而卡住答案，這裡允許 seatResult 為 null
            const finalSeat = seatResult || `Local_${i + 1}`; 

            results.push({
                seat: finalSeat,
                answers: flatAnswers,
                debugImage: canvas.toDataURL('image/jpeg', 0.8),
                error: (seatResult === null) ? "座號異常" : null
            });

            warpedGray.delete(); warpedBinary.delete();
            if(warped) warped.delete();

        } catch (err) {
            console.error(err);
            results.push({ seat: `Err`, answers: [], error: err.message });
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
//  核心演算法 (融合版)
// ==========================================

/**
 * 軌道掃描 (支援 V21 與 V27 雙重標準)
 * @param {string} targetSize - "normal" (V21標準) 或 "small" (V27座號)
 */
function scanTrack(binaryImage, direction, range, debugMat, targetSize = "normal") {
    const candidates = [];
    let roiRect;

    if (direction === "horizontal") {
        roiRect = new cv.Rect(0, range.yStart, binaryImage.cols, range.yEnd - range.yStart);
    } else {
        roiRect = new cv.Rect(range.xStart, 0, range.xEnd - range.xStart, binaryImage.rows);
    }

    // [除錯] 畫出藍色掃描區
    let pt1 = new cv.Point(roiRect.x, roiRect.y);
    let pt2 = new cv.Point(roiRect.x + roiRect.width, roiRect.y + roiRect.height);
    cv.rectangle(debugMat, pt1, pt2, [255, 0, 0, 255], 1);

    let roi = binaryImage.roi(roiRect);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    
    cv.findContours(roi, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // [關鍵分流] 設定過濾條件
    let filter;
    if (targetSize === "small") {
        // 座號區 (10px) - V27.0 參數
        filter = { minA: 30, maxA: 350, minW: 4, maxW: 25, arMin: 0.6, arMax: 1.5 };
    } else {
        // 題目區 (13px) - V21.0 原始參數 (絕對不變)
        filter = { minA: 80, maxA: 400, minW: 8, maxW: 25, arMin: 0.7, arMax: 1.4 };
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

    // 中位數濾波 (維持 V21 的邏輯)
    if (candidates.length > 0) {
        const alignValues = candidates.map(c => c.alignVal).sort((a, b) => a - b);
        const median = alignValues[Math.floor(alignValues.length / 2)];
        const TOLERANCE = 10; 

        const validAnchors = candidates.filter(c => Math.abs(c.alignVal - median) <= TOLERANCE)
                                       .map(c => c.pos)
                                       .sort((a, b) => a - b);
        
        // [除錯] 畫線
        validAnchors.forEach(pos => {
            if (direction === "horizontal") {
                cv.line(debugMat, new cv.Point(pos, range.yStart), new cv.Point(pos, binaryImage.rows), [0, 255, 0, 255], 1);
            } else {
                cv.line(debugMat, new cv.Point(0, pos), new cv.Point(binaryImage.cols, pos), [0, 165, 255, 255], 1);
            }
        });

        return validAnchors;
    }
    return [];
}

// 座號區解碼 (V27.0)
function gradeSeatGrid(grayImage, xAnchors, yAnchors, debugMat) {
    const DARKNESS_THRESHOLD = 50; 
    
    if (xAnchors.length < 2 || yAnchors.length < 10) return null;

    const validX = xAnchors.slice(0, 2);
    const validY = yAnchors.slice(0, 10);
    let seatDigits = [];

    for (let i = 0; i < 2; i++) {
        let x = validX[i];
        let foundDigit = -1;
        let markCount = 0;

        for (let j = 0; j < 10; j++) {
            let y = validY[j];
            
            // 精細對焦 (6x6)
            let bestX = x, bestY = y, maxDark = -1;
            for(let dx=-2; dx<=2; dx+=2) {
                for(let dy=-2; dy<=2; dy+=2) {
                    let tx = x+dx, ty = y+dy;
                    if(tx<0||ty<0) continue;
                    let rect = new cv.Rect(tx-3, ty-3, 6, 6);
                    let roi = grayImage.roi(rect);
                    let dark = 255 - cv.mean(roi)[0];
                    roi.delete();
                    if(dark > maxDark) { maxDark = dark; bestX = tx; bestY = ty; }
                }
            }

            let pt1 = new cv.Point(bestX - 4, bestY - 4);
            let pt2 = new cv.Point(bestX + 4, bestY + 4);

            if (maxDark > DARKNESS_THRESHOLD) {
                foundDigit = j;
                markCount++;
                cv.rectangle(debugMat, pt1, pt2, [255, 0, 0, 255], -1); 
            } else {
                cv.rectangle(debugMat, pt1, pt2, [200, 200, 200, 100], 1); 
            }
        }

        if (markCount === 1 && foundDigit !== -1) {
            seatDigits.push(foundDigit);
        } else {
            return null; 
        }
    }

    return seatDigits.join(""); 
}

// 題目區解碼 (V21.0 - 保持不變)
function gradeByGrid(grayImage, xAnchors, yAnchors, debugMat, qCount) {
    const detected = [];
    const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
    const DARKNESS_THRESHOLD = 60; 

    const finalDetected = [];
    
    if (xAnchors.length < 5 || yAnchors.length < 5) return { detectedAnswers: [] };

    let colGroups = [];
    let currentGroup = [];
    
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
            let selectedOptions = [];

            validX.forEach((x, optIdx) => {
                let bestX = x, bestY = y, maxDark = -1;
                
                for(let dx=-3; dx<=3; dx+=3) {
                    for(let dy=-3; dy<=3; dy+=3) {
                        let tx = x + dx, ty = y + dy;
                        if(tx<0 || ty<0 || tx+10 > grayImage.cols || ty+10 > grayImage.rows) continue;
                        
                        let rect = new cv.Rect(tx-5, ty-5, 10, 10);
                        let roi = grayImage.roi(rect);
                        let dark = 255 - cv.mean(roi)[0];
                        roi.delete();
                        
                        if(dark > maxDark) {
                            maxDark = dark;
                            bestX = tx; bestY = ty;
                        }
                    }
                }

                let pt1 = new cv.Point(bestX - 5, bestY - 5);
                let pt2 = new cv.Point(bestX + 5, bestY + 5);

                if (maxDark > DARKNESS_THRESHOLD) {
                    selectedOptions.push(OPTIONS[optIdx]);
                    cv.rectangle(debugMat, pt1, pt2, [0, 255, 0, 255], -1); 
                } else {
                    // cv.rectangle(debugMat, pt1, pt2, [200, 200, 200, 100], 1); 
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

// 理論補償 (V21.0)
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