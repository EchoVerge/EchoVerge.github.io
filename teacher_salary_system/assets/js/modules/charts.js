let chartInstance = null;

export function renderStatsChart(mainConfig, overlayConfig) {
    const ctx = document.getElementById('statsChart');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: mainConfig.labels, // 共用標籤 (給內圈與圖例用)
            datasets: [
                // 1. 外圈 (Overlay)：顯示溢出標示
                {
                    data: overlayConfig.data,
                    backgroundColor: overlayConfig.colors,
                    borderWidth: 0,
                    weight: 0.2, // 較細
                    // 將自訂資訊掛載到 dataset 上方便 callback 讀取
                    customMeta: overlayConfig.meta 
                },
                // 2. 內圈 (Main)：顯示主要數據
                {
                    data: mainConfig.data,
                    backgroundColor: mainConfig.colors,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    weight: 0.8 // 較粗
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { 
                        boxWidth: 12, 
                        font: { size: 11 },
                        // 過濾圖例：只顯示內圈 (datasetIndex 1)
                        filter: function(item, chart) {
                            return item.datasetIndex === 1;
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let value = context.raw || 0;
                            
                            // A. 處理外圈 (Overlay)
                            if (context.datasetIndex === 0) {
                                // 讀取我們傳入的 customMeta
                                const metaLabel = context.dataset.customMeta[context.dataIndex];
                                // 只有當有 metaLabel 且數值大於 0 時才顯示
                                if (metaLabel && value > 0) {
                                    return `${metaLabel}: ${value} 節`;
                                }
                                return null; // 隱藏透明區塊的 tooltip
                            }
                            
                            // B. 處理內圈 (Main)
                            let label = context.label || '';
                            if (value > 0) {
                                return `${label}: ${value} 節`;
                            }
                            return null;
                        }
                    },
                    // 過濾器：確保不顯示回傳 null 的項目
                    filter: function(tooltipItem) {
                        const datasetIndex = tooltipItem.datasetIndex;
                        if (datasetIndex === 0) {
                            return !!tooltipItem.dataset.customMeta[tooltipItem.dataIndex];
                        }
                        return true;
                    }
                }
            }
        }
    });
}