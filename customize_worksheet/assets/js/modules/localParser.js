/**
 * assets/js/modules/localParser.js
 * V30.0: 視覺化除錯增強版 (Visual Debug Enhanced)
 * * 修正: 擴大 ROI 搜尋範圍，改善偏移問題
 * * 新增: 強制繪製 Debug 框線 (藍色=搜尋區, 紅色=定位點, 綠色=答案)
 * * 架構: 延續 V29.0 Fusion 邏輯，保持雙模式掃描
 */

export async function analyzeAnswerSheetLocal(base64Images, qCount) {
    console.log("🚀 啟動本地閱卷 (V30.0 Debug)...");
    
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
                xStart: Math.floor(warped.cols * 0.10), // 0.11 -> 0.10
                xEnd: Math.floor(warped.cols * 0.22),   // 0.20 -> 0.22
                yStart: Math.floor(warped.rows * 0.06), // 0.065 -> 0.06
                yEnd: Math.floor(warped.rows * 0.11)    // 0.10 -> 0.11
            };
            
            const seatROIY = {
                xStart: Math.floor(warped.cols * 0.04), // 0.045 -> 0.04
                xEnd: Math.floor(warped.cols * 0.10),   // 0.095 -> 0.10
                yStart: Math.floor(warped.rows * 0.08), // 0.085 -> 0.08
                yEnd: Math.floor(warped.rows * 0.26)    // 0.25 -> 0.26
            };

            let seatAnchorsX = scanTrack(warpedBinary, "horizontal", seatROIX, debugWarped, "small");
            let seatAnchorsY = scanTrack(warpedBinary, "vertical", seatROIY, debugWarped, "small");

            const seatResult = gradeSeatGrid(warpedGray, seatAnchorsX, seatAnchorsY, debugWarped);

            // ==========================================
            //  Phase B: 題目區 (13px 標準框)
            // ==========================================
            // 放寬搜尋範圍
            const qTopROI = {
                yStart: Math.floor(warped.rows * 0.22), // 0.24 -> 0.22
                yEnd: Math.floor(warped.rows * 0.30)    // 0.28 -> 0.30
            };
            
            const qLeftROI = {
                xStart: Math.floor(warped.cols * 0.01), // 0.02 -> 0.01
                xEnd: Math.floor(warped.cols * 0.08)    // 0.07 -> 0.08
            };

            let xAnchors = scanTrack(warpedBinary, "horizontal", qTopROI, debugWarped, "normal");
            let yAnchors = scanTrack(warpedBinary, "vertical", qLeftROI, debugWarped, "normal");

            // [補償機制] 若定位點不足，使用理論值
            if (xAnchors.length < 5) {
                console.warn("X軸定位點不足，啟用理論推算");
                // 畫出警告文字
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
                uuid: Date.now() + "_" + i, // 唯一 ID，供批次校對使用
                index: i,
                seat: finalSeat,
                answers: flatAnswers,
                debugImage: debugImgData, // 關鍵：回傳有畫框的圖
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

    // [Visual Debug] 畫出藍色搜尋範圍框 (保留此框讓您確認搜尋位置)
    if(debugMat) {
        let pt1 = new cv.Point(roiRect.x, roiRect.y);
        let pt2 = new cv.Point(roiRect.x + roiRect.width, roiRect.y + roiRect.height);
        cv.rectangle(debugMat, pt1, pt2, [0, 0, 255, 255], 1); 
    }

    let roi = binaryImage.roi(roiRect);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    
    // 尋找輪廓
    cv.findContours(roi, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 設定過濾條件 (根據目標大小)
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

        // 寬高比與面積過濾
        if (area > filter.minA && area < filter.maxA && 
            rect.width >= filter.minW && rect.width <= filter.maxW && 
            rect.height >= filter.minW && rect.height <= filter.maxW &&
            ar >= filter.arMin && ar <= filter.arMax) {
            
            let globalCenterX = roiRect.x + rect.x + rect.width / 2;
            let globalCenterY = roiRect.y + rect.y + rect.height / 2;
            
            // 收集候選點
            candidates.push({ 
                pos: direction === "horizontal" ? globalCenterX : globalCenterY, 
                alignVal: direction === "horizontal" ? globalCenterY : globalCenterX 
            });
        }
    }
    
    contours.delete(); hierarchy.delete(); roi.delete();

    if (candidates.length > 0) {
        // 2. 過濾偏離太遠的雜訊 (使用中位數過濾)
        const alignValues = candidates.map(c => c.alignVal).sort((a, b) => a - b);
        const median = alignValues[Math.floor(alignValues.length / 2)];
        const TOLERANCE = 20; // 容許誤差

        let rawAnchors = candidates.filter(c => Math.abs(c.alignVal - median) <= TOLERANCE)
                                   .map(c => c.pos)
                                   .sort((a, b) => a - b);
        
        // 3. [關鍵修正] 合併過於接近的線條 (Clustering)
        // 如果兩條線距離小於 15px，視為同一條並取平均值
        const MERGE_DIST = 15;
        const mergedAnchors = [];
        
        if (rawAnchors.length > 0) {
            let currentGroup = [rawAnchors[0]];
            
            for (let i = 1; i < rawAnchors.length; i++) {
                if (rawAnchors[i] - rawAnchors[i-1] < MERGE_DIST) {
                    currentGroup.push(rawAnchors[i]);
                } else {
                    // 結算上一組
                    const avg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
                    mergedAnchors.push(avg);
                    currentGroup = [rawAnchors[i]]; // 開啟新的一組
                }
            }
            // 結算最後一組
            const avg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
            mergedAnchors.push(avg);
        }

        // [Visual Debug] 只畫出合併後、乾淨的綠色線條
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
            
            // 掃描 6x6 區域
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
                // 填答: 紅色實心
                cv.rectangle(debugMat, pt1, pt2, [255, 0, 0, 255], -1); 
            } else {
                // 未填: 灰色空心
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
                    // 填答: 綠色實心 (題目區)
                    cv.rectangle(debugMat, pt1, pt2, [0, 255, 0, 255], -1); 
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