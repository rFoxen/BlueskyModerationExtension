// src/utils/logger/Logger.ts
enum LogLevel {
    DEBUG = 0,
    INFO,
    WARN,
    ERROR,
    NONE,
}

class Logger {
    private static instance: Logger;
    private level: LogLevel;
    private timers: Map<string, number>;

    private constructor() {
        // Determine log level based on environment
        if (process.env.NODE_ENV === 'development') {
            this.level = LogLevel.DEBUG;
        } else {
            this.level = LogLevel.WARN;
        }
        this.timers = new Map<string, number>();
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public debug(...args: any[]): void {
        if (this.level <= LogLevel.DEBUG) {
            console.debug('%c[DEBUG]', 'color: blue;', ...args);
        }
    }

    public info(...args: any[]): void {
        if (this.level <= LogLevel.INFO) {
            console.info('%c[INFO]', 'color: green;', ...args);
        }
    }

    public warn(...args: any[]): void {
        if (this.level <= LogLevel.WARN) {
            console.warn('%c[WARN]', 'color: orange;', ...args);
        }
    }

    public error(...args: any[]): void {
        if (this.level <= LogLevel.ERROR) {
            console.error('%c[ERROR]', 'color: red;', ...args);
        }
    }

    // Timer Methods
    public time(label: string): void {
        if (this.level <= LogLevel.DEBUG) {
            this.timers.set(label, performance.now());
            this.debug(`Timer started: ${label}`);
        }
    }

    public timeEnd(label: string): void {
        if (this.level <= LogLevel.DEBUG && this.timers.has(label)) {
            const startTime = this.timers.get(label)!;
            const duration = performance.now() - startTime;
            this.debug(`Timer ended: ${label} - Duration: ${duration.toFixed(2)}ms`);
            this.timers.delete(label);
        } else if (this.level <= LogLevel.DEBUG) {
            this.warn(`Timer '${label}' does not exist.`);
        }
    }

    // Optional: Method to change log level at runtime
    public setLogLevel(level: LogLevel): void {
        this.level = level;
    }

    // Optional: Get current log level
    public getLogLevel(): LogLevel {
        return this.level;
    }
}

export default Logger.getInstance();
