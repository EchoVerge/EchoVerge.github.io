export class StepManager {
    constructor(total, opts) {
        this.step = 1;
        this.total = total;
        this.opts = opts;
        this.init();
    }
    init() {
        this.update();
        document.querySelectorAll('[data-action="next"]').forEach(b => b.addEventListener('click', () => this.next()));
        document.querySelectorAll('[data-action="prev"]').forEach(b => b.addEventListener('click', () => this.prev()));
    }
    next() {
        if(this.opts.validate && !this.opts.validate(this.step)) return;
        if(this.step < this.total) { this.step++; this.update(); }
    }
    prev() {
        if(this.step > 1) { this.step--; this.update(); }
    }
    update() {
        document.querySelectorAll('.step-section').forEach(s => {
            s.style.display = parseInt(s.dataset.step) === this.step ? 'block' : 'none';
        });
        document.querySelectorAll('.step-indicator').forEach(i => {
            const s = parseInt(i.dataset.step);
            i.classList.toggle('active', s === this.step);
            i.classList.toggle('completed', s < this.step);
        });
        if(this.opts.onStepChange) this.opts.onStepChange(this.step);
        window.scrollTo(0,0);
    }
}