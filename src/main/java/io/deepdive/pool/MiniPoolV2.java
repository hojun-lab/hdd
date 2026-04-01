package io.deepdive.pool;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class MiniPoolV2 {
    private static final Logger log = LoggerFactory.getLogger(MiniPoolV2.class);
    private final ConnectionInfo connectionInfo;
    private final PoolConfig poolConfig;

    List<PoolEntity> sharedList = new ArrayList<>();
    ThreadLocal<PoolEntity> lastUsed = new ThreadLocal<>();
    ConcurrentHashMap<PoolEntity, LeakInfo> map = new ConcurrentHashMap<>();
    Semaphore semaphore;

    public MiniPoolV2(ConnectionInfo connectionInfo, PoolConfig poolConfig) {
        this.connectionInfo = connectionInfo;
        this.poolConfig = poolConfig;
        semaphore = new Semaphore(poolConfig.maximumPoolSize());
        ScheduledExecutorService scheduledExecutorService = Executors.newScheduledThreadPool(1);
        scheduledExecutorService.scheduleAtFixedRate(() -> {map.forEach((poolEntity, leakInfo) -> {
                if (System.currentTimeMillis() - leakInfo.borrowTime() > poolConfig.leakDetectionThresholdMs()) {
                    log.warn("에러 발생");
                    leakInfo.borrowTrace().printStackTrace();
                }});
            }, 1, 1, TimeUnit.SECONDS);

        for (int i = 0; i < poolConfig.maximumPoolSize(); i++) {
            try {
                Connection connection = DriverManager.getConnection(connectionInfo.jdbcUrl(), connectionInfo.user(), connectionInfo.password());
                sharedList.add(new PoolEntity(connection, new AtomicInteger(0)));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }

    public PoolEntity getConnection(long timeoutMs) {
        Throwable throwable = new Throwable();
        try {
            if (!semaphore.tryAcquire(timeoutMs, TimeUnit.MILLISECONDS)) throw new RuntimeException();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
        PoolEntity poolEntity = lastUsed.get();
        if (poolEntity != null && poolEntity.state().compareAndSet(0, 1)) {
            map.put(poolEntity, new LeakInfo(throwable, System.currentTimeMillis()));
            return poolEntity;
        }

        for (PoolEntity loopPoolEntity : sharedList) {
            if (loopPoolEntity.state().compareAndSet(0, 1)) {
                map.put(loopPoolEntity, new LeakInfo(throwable, System.currentTimeMillis()));
                lastUsed.set(loopPoolEntity);
                return loopPoolEntity;
            }
        }

        throw new RuntimeException("No available connection");
    }

    public void release(PoolEntity poolEntity) {
        map.remove(poolEntity);
        poolEntity.state().set(0);
        semaphore.release();
    }
}
