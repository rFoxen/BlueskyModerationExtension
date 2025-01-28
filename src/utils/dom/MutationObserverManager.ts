export type MutationCallback = (mutations: MutationRecord[]) => void;

export class MutationObserverManager {
    private observer: MutationObserver | null = null;
    private callback: MutationCallback;
    private target: Node | null = null;
    private options: MutationObserverInit;

    constructor(callback: MutationCallback, options: MutationObserverInit) {
        this.callback = callback;
        this.options = options;
    }

    public start(target: Node): void {
        if (this.observer) {
            this.stop(); // Stop any existing observer before starting
        }
        this.target = target;
        this.observer = new MutationObserver((mutations) => this.callback(mutations));
        this.observer.observe(this.target, this.options);
    }

    public stop(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    public isRunning(): boolean {
        return this.observer !== null;
    }

    public destroy(): void {
        this.stop();
        this.target = null;
    }
}
