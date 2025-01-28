import { PerformanceMonitor } from './PerformanceMonitor';

export function MonitorPerformance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    // Check if the original method is asynchronous
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsync) {
        descriptor.value = async function (...args: any[]) {
            const methodName = `${target.constructor.name}.${propertyKey}`;
            const start = performance.now();
            try {
                const result = await originalMethod.apply(this, args);
                return result;
            }
            finally {
                const duration = performance.now() - start;
                PerformanceMonitor.log(methodName, duration);
            }
        };
    } else {
        // For synchronous methods, log before and after execution
        descriptor.value = function (...args: any[]) {
            const methodName = `${target.constructor.name}.${propertyKey}`;
            const start = performance.now();
            try {
                const result = originalMethod.apply(this, args);
                return result;
            }
            finally {
                const duration = performance.now() - start;
                PerformanceMonitor.log(methodName, duration);
            }
        };
    }

    return descriptor;
}
