/**
 * assets/js/modules/wordExporter.js
 * V2.0: 支援學生卷/詳解卷切換
 */

export async function exportToWord(questions, title, type = 'teacher') {
    if (!questions || questions.length === 0) return alert("無題目資料");

    const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = window.docx;

    const docChildren = [];
    const isStudent = (type === 'student');
    const docTitle = isStudent ? title : title + " - 詳解卷";

    // 1. 標題
    docChildren.push(
        new Paragraph({
            text: docTitle,
            heading: "Heading1",
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        })
    );

    // 2. 題目迴圈
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        
        // 題號 (學生卷不顯示答案)
        const idText = isStudent ? `${q.id}. ` : `${q.id}. [答案: ${q.ans || '無'}]`;

        docChildren.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: idText,
                        bold: true,
                        size: 24
                    })
                ],
                spacing: { before: 200, after: 100 }
            })
        );

        // 題目圖片 (如果有)
        if (q.img) {
            try {
                // 將 Base64 轉為 Blob/Buffer
                const response = await fetch(q.img);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();

                docChildren.push(
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data: buffer,
                                transformation: {
                                    width: 300, // 限制寬度
                                    height: 300 * (blob.height / blob.width || 0.75)
                                }
                            })
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 100 }
                    })
                );
            } catch (e) {
                console.error("圖片轉換失敗", e);
            }
        }

        // 題目文字
        docChildren.push(
            new Paragraph({
                children: [ new TextRun(q.text) ],
                spacing: { after: 100 }
            })
        );

        // --- 以下內容僅在「詳解卷 (Teacher)」顯示 ---
        if (!isStudent) {
            // 解析
            if (q.expl) {
                docChildren.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: "解析：", bold: true, color: "555555" }),
                            new TextRun({ text: q.expl, color: "555555" })
                        ],
                        spacing: { after: 200 }
                    })
                );
            }

            // 類題
            if (q.similar) {
                docChildren.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: "★ 類題演練", bold: true, color: "7B1FA2" })
                        ],
                        spacing: { before: 100 }
                    })
                );
                
                docChildren.push(
                    new Paragraph({
                        text: q.similar.text,
                        indent: { left: 400 }, // 縮排
                        spacing: { after: 50 }
                    })
                );

                docChildren.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: `答案：${q.similar.ans} `, size: 20, color: "666666" }),
                            new TextRun({ text: ` 解析：${q.similar.expl || '無'}`, size: 20, color: "666666" })
                        ],
                        indent: { left: 400 },
                        spacing: { after: 200 }
                    })
                );
            }
        } else {
            // 學生卷：題目間留白 (可選)
            docChildren.push(new Paragraph({ text: "" }));
        }
        
        // 分隔線 (用空行代替)
        docChildren.push(new Paragraph({ text: "" }));
    }

    // 產生檔案
    const doc = new Document({
        sections: [{
            properties: {},
            children: docChildren
        }]
    });

    const fileName = isStudent ? `${title}_學生卷.docx` : `${title}_詳解卷.docx`;

    Packer.toBlob(doc).then(blob => {
        saveAs(blob, fileName);
    });
}