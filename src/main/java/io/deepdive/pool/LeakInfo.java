package io.deepdive.pool;

public record LeakInfo(
        Throwable borrowTrace,
        long borrowTime
) {
}
