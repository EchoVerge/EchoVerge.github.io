/**
 * assets/js/modules/stepManager.js
 * 步驟管理器：負責控制 Wizard 流程、進度條與頁面切換
 */

export class StepManager {
    constructor(totalSteps, callbacks) {
        this.currentStep = 1;
        this.totalSteps = totalSteps;
        // callbacks 包含: onStepChange(step), validate(step)
        this.callbacks = callbacks || {};
        
        this.init();
    }

    init() {
        this.updateUI();
        this.bindEvents();
    }

    bindEvents() {
        // 綁定所有的 "下一步" 按鈕
        document.querySelectorAll('[data-action="next"]').forEach(btn => {
            btn.addEventListener('click', () => this.next());
        });

        // 綁定所有的 "上一步" 按鈕
        document.querySelectorAll('[data-action="prev"]').forEach(btn => {
            btn.addEventListener('click', () => this.prev());
        });
        
        // 綁定步驟指示器點擊 (選用：允許使用者點擊上面的圈圈跳轉?)
        // 這裡暫時鎖定，強制依序進行，若要開放可取消註解
        /*
        document.querySelectorAll('.step-indicator').forEach(indicator => {
            indicator.addEventListener('click', (e) => {
                const targetStep = parseInt(e.currentTarget.dataset.step);
                if (targetStep < this.currentStep) this.goTo(targetStep);
            });
        });
        */
    }

    next() {
        // 1. 執行驗證回呼 (如果有的話)
        if (this.callbacks.validate) {
            const isValid = this.callbacks.validate(this.currentStep);
            if (!isValid) return; // 驗證失敗，停在原地
        }

        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateUI();
        }
    }

    prev() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    }

    goTo(step) {
        if (step >= 1 && step <= this.totalSteps) {
            this.currentStep = step;
            this.updateUI();
        }
    }

    updateUI() {
        // 1. 切換顯示區塊
        document.querySelectorAll('.step-section').forEach(section => {
            const step = parseInt(section.dataset.step);
            if (step === this.currentStep) {
                section.classList.add('active');
                section.style.display = 'block';
                // 簡單的淡入效果
                setTimeout(() => section.style.opacity = 1, 10);
            } else {
                section.classList.remove('active');
                section.style.display = 'none';
                section.style.opacity = 0;
            }
        });

        // 2. 更新進度條 (Stepper)
        document.querySelectorAll('.step-indicator').forEach(indicator => {
            const step = parseInt(indicator.dataset.step);
            indicator.classList.remove('active', 'completed');
            
            if (step === this.currentStep) {
                indicator.classList.add('active');
            } else if (step < this.currentStep) {
                indicator.classList.add('completed');
            }
        });

        // 3. 觸發外部事件 (例如：進入 Step 3 時可能要預先渲染某些東西)
        if (this.callbacks.onStepChange) {
            this.callbacks.onStepChange(this.currentStep);
        }
        
        // 4. 捲動到頂部
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}