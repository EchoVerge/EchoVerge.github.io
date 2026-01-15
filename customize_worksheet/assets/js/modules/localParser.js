/**
 * assets/js/modules/localParser.js
 * V21.0: 混合定位版 (Hybrid Positioning)
 * * 核心: 結合「理論座標計算」與「實際影像掃描」
 * * 修正: 根據 A4 排版計算出精確的 ROI 範圍 (X: 4.3%, Y: 25.7%)
 * * 新增: 錨點補償機制 (Anchor Interpolation)，若掃描遺失則用數學推算補齊
 */

export async function analyzeAnswerSheetLocal(base64Images, qCount) {
    console.log("🚀 啟動本地閱卷 (V21.0 Hybrid)...");
    
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

            // 1. 標準化 (1000px) - 這是所有座標計算的基準
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
                // 若找不到四角，嘗試使用全圖 (假設已裁切好)
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

            // 4. 掃描定位軌道 (基於精確計算的座標)
            // 標準化後寬度 1000px，高度約 1414px
            
            // [X軸軌道 - 頂部定位點]
            // 理論中心 Y = 25.7% (約 363px)
            // 設定 ROI: 24% ~ 28% (縮小範圍，避開標題文字)
            const topROI = {
                yStart: Math.floor(warped.rows * 0.24), 
                yEnd: Math.floor(warped.rows * 0.28)
            };
            
            // [Y軸軌道 - 左側定位點]
            // 理論中心 X = 4.3% (約 43px)
            // 設定 ROI: 2% ~ 7% (縮小範圍，避開題號文字)
            const leftROI = {
                xStart: Math.floor(warped.cols * 0.02),
                xEnd: Math.floor(warped.cols * 0.07)
            };

            // 執行掃描
            let xAnchors = scanTrack(warpedBinary, "horizontal", topROI, debugWarped);
            let yAnchors = scanTrack(warpedBinary, "vertical", leftROI, debugWarped);

            // [補償機制] 如果掃描到的點太少，嘗試使用理論值補齊
            // X軸應有: 4欄 * 5選項 = 20點
            // 每個欄位寬度約 250px (25%)
            if (xAnchors.length < 5) {
                console.warn("X軸定位點不足，啟用理論推算");
                xAnchors = generateTheoreticalAnchorsX(warped.cols);
            }

            // Y軸應有: 20列 (每欄20題)
            if (yAnchors.length < 5) {
                console.warn("Y軸定位點不足，啟用理論推算");
                // 題目區開始 Y = 27.1% (約 383px)
                // 題目區結束 Y = 95% 左右
                yAnchors = generateTheoreticalAnchorsY(warped.rows);
            }

            // 5. 網格交叉判讀
            const { detectedAnswers } = gradeByGrid(
                warpedGray, 
                xAnchors, 
                yAnchors, 
                debugWarped, 
                qCount
            );

            // 6. 輸出
            const flatAnswers = new Array(qCount).fill("");
            detectedAnswers.forEach(item => {
                if (item.qIndex >= 1 && item.qIndex <= qCount) {
                    flatAnswers[item.qIndex - 1] = item.ans;
                }
            });

            let canvas = document.createElement('canvas');
            cv.imshow(canvas, debugWarped);

            results.push({
                seat: `Local_${i + 1}`,
                answers: flatAnswers,
                debugImage: canvas.toDataURL('image/jpeg', 0.8)
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
//  核心演算法
// ==========================================

function scanTrack(binaryImage, direction, range, debugMat) {
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

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let rect = cv.boundingRect(cnt);
        let area = cv.contourArea(cnt);
        let ar = rect.width / rect.height;

        // 定位點特徵：實心方塊，約 13x13px
        // 面積範圍 80 ~ 400 (排除雜訊與大標題)
        // 長寬比 0.7 ~ 1.4 (排除線條)
        if (area > 80 && area < 400 && 
            rect.width >= 8 && rect.width <= 25 && 
            rect.height >= 8 && rect.height <= 25 &&
            ar >= 0.7 && ar <= 1.4) {
            
            let globalCenterX, globalCenterY;
            if (direction === "horizontal") {
                globalCenterX = rect.x + rect.width / 2;
                globalCenterY = range.yStart + rect.y + rect.height / 2;
                candidates.push({ pos: globalCenterX, alignVal: globalCenterY });
            } else {
                globalCenterX = range.xStart + rect.x + rect.width / 2;
                globalCenterY = rect.y + rect.height / 2;
                candidates.push({ pos: globalCenterY, alignVal: globalCenterX });
            }
        }
    }
    
    contours.delete(); hierarchy.delete(); roi.delete();

    // 中位數濾波 (剔除偏離基準線的點)
    if (candidates.length > 0) {
        const alignValues = candidates.map(c => c.alignVal).sort((a, b) => a - b);
        const median = alignValues[Math.floor(alignValues.length / 2)];
        const TOLERANCE = 8; // 容許誤差 8px

        const validAnchors = candidates.filter(c => Math.abs(c.alignVal - median) <= TOLERANCE)
                                       .map(c => c.pos)
                                       .sort((a, b) => a - b);
        
        // [除錯] 畫出掃描到的線
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

// [補救] 產生理論 X 錨點 (若掃描失敗)
function generateTheoreticalAnchorsX(width) {
    const anchors = [];
    // 根據 V10.8 排版，題目從 6.3% 開始，每欄佔 25%
    // 第一欄選項中心約在：7.5%, 9.5%, 11.5%, 13.5%, 15.5% (假設選項間距均分)
    // 這裡簡化為：根據 Column 劃分
    const colWidth = width / 4;
    const optGap = 15; // 選項間距 px
    const startOffset = 75; // 第一個選項的偏移 px

    for(let c=0; c<4; c++) {
        let baseX = c * colWidth + startOffset;
        for(let k=0; k<5; k++) {
            anchors.push(baseX + k * 35); // 假定間距 35px
        }
    }
    return anchors;
}

// [補救] 產生理論 Y 錨點 (若掃描失敗)
function generateTheoreticalAnchorsY(height) {
    const anchors = [];
    const startY = height * 0.271; // 題目開始 27.1%
    const endY = height * 0.95;
    const totalRows = 20;
    const gap = (endY - startY) / totalRows;

    for(let i=0; i<totalRows; i++) {
        anchors.push(startY + i * gap + gap/2);
    }
    return anchors;
}

function gradeByGrid(grayImage, xAnchors, yAnchors, debugMat, qCount) {
    const detected = [];
    const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
    const DARKNESS_THRESHOLD = 60; 

    // 分欄處理 (每 5 個 X 點為一欄)
    // 容錯：若點數不為 5 的倍數，儘量配對
    const finalDetected = [];
    
    // 如果掃描到的點太少，直接回傳空
    if (xAnchors.length < 5 || yAnchors.length < 5) return { detectedAnswers: [] };

    // 嘗試將 X 軸分組
    let colGroups = [];
    let currentGroup = [];
    
    // 簡單分群：距離跳變大於 50px 視為換欄
    for(let i=0; i<xAnchors.length; i++) {
        if(i > 0 && (xAnchors[i] - xAnchors[i-1] > 50)) {
            colGroups.push(currentGroup);
            currentGroup = [];
        }
        currentGroup.push(xAnchors[i]);
    }
    if(currentGroup.length > 0) colGroups.push(currentGroup);

    // 遍歷每一欄
    colGroups.forEach((colX, colIndex) => {
        // 確保這欄有 5 個選項點 (若不足可能要插值，這裡先跳過)
        if (colX.length < 5) return; 
        
        // 取前 5 個作為 A-E
        const validX = colX.slice(0, 5);
        const startQ = (colIndex * 20) + 1;

        // 遍歷每一列
        for (let j = 0; j < yAnchors.length; j++) {
            const qNum = startQ + j;
            if (qNum > qCount) continue;

            const y = yAnchors[j];
            let selectedOptions = [];

            validX.forEach((x, optIdx) => {
                // 自動對焦 (Micro-Autofocus)
                // 在 (x, y) 附近 +/- 3px 找最黑的點修正中心
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

                // 畫框與判讀
                let pt1 = new cv.Point(bestX - 5, bestY - 5);
                let pt2 = new cv.Point(bestX + 5, bestY + 5);

                if (maxDark > DARKNESS_THRESHOLD) {
                    selectedOptions.push(OPTIONS[optIdx]);
                    cv.rectangle(debugMat, pt1, pt2, [0, 255, 0, 255], -1); // 綠色實心
                } else {
                    // cv.rectangle(debugMat, pt1, pt2, [200, 200, 200, 100], 1); // 灰色空心
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