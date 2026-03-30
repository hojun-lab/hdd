package io.deepdive.pool;

import java.sql.Connection;
import java.util.concurrent.atomic.AtomicInteger;

public record PoolEntity(
   Connection connection,
   AtomicInteger state // 0 = NOT_IN_USE, 1 = IN_USE
) {}
