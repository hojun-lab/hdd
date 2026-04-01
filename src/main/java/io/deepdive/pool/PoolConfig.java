package io.deepdive.pool;

public record PoolConfig(
        int maximumPoolSize,
        long connectionTimeoutMs,
        long leakDetectionThresholdMs
) {
}
