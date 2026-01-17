/**
 * assets/js/modules/wordExporter.js
 * V2.1: 支援顯示配分
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
        
        // 建構題號與配分文字
        let idText = `${q.id}.`;
        if (q.score && parseFloat(q.score) > 0) {
            idText += ` (${q.score}分)`;
        }
        
        // 詳解卷顯示答案
        if (!isStudent) {
            idText += ` [答案: ${q.ans || '無'}]`;
        } else {
            // 學生卷加一個空格美觀
            idText += " ";
        }

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
                const response = await fetch(q.img);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();

                docChildren.push(
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data: buffer,
                                transformation: {
                                    width: 300, 
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

        // --- 詳解卷內容 ---
        if (!isStudent) {
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
                        indent: { left: 400 }, 
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
            // 學生卷：題目間留白
            docChildren.push(new Paragraph({ text: "" }));
        }
        
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