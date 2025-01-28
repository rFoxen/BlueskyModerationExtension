import Logger from '@src/utils/logger/Logger';
import { config } from '@src/config';

interface MethodMetrics {
    count: number;
    totalDuration: number;
    minDuration: number;
    maxDuration: number;
}

export class PerformanceMonitor {
    private static enabled: boolean = config.performanceMonitoring.enabled;
    private static metrics: Map<string, MethodMetrics> = new Map();

    public static setEnabled(status: boolean) {
        this.enabled = status;
    }

    public static log(methodName: string, duration: number) {
        if (!this.enabled) return;

        if (!this.metrics.has(methodName)) {
            this.metrics.set(methodName, {
                count: 0,
                totalDuration: 0,
                minDuration: Number.MAX_SAFE_INTEGER,
                maxDuration: 0,
            });
        }

        const metric = this.metrics.get(methodName)!;
        metric.count += 1;
        metric.totalDuration += duration;
        metric.minDuration = Math.min(metric.minDuration, duration);
        metric.maxDuration = Math.max(metric.maxDuration, duration);

        Logger.debug(
            `[PERF] ${methodName} executed in ${duration.toFixed(2)}ms (Count: ${metric.count}, Avg: ${(metric.totalDuration / metric.count).toFixed(2)}ms, Min: ${metric.minDuration.toFixed(2)}ms, Max: ${metric.maxDuration.toFixed(2)}ms)`
        );
    }
}
