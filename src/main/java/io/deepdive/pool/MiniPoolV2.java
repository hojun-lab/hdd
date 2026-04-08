package io.deepdive.pool;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
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
    AtomicInteger active =  new AtomicInteger(0);
    AtomicInteger idle =  new AtomicInteger(0);
    AtomicInteger pending =  new AtomicInteger(0);
    AtomicInteger total =  new AtomicInteger(0);
    Semaphore semaphore;

    public MiniPoolV2(ConnectionInfo connectionInfo, PoolConfig poolConfig) {
        this.connectionInfo = connectionInfo;
        this.poolConfig = poolConfig;
        semaphore = new Semaphore(poolConfig.maximumPoolSize());
        ScheduledExecutorService scheduledExecutorService = Executors.newScheduledThreadPool(1);
        scheduledExecutorService.scheduleAtFixedRate(() -> {
            System.out.printf("[Pool] active=%d idle=%d pending=%d total=%d%n",
                    active.get(), idle.get(), pending.get(), total.get());
        }, 1, 1, TimeUnit.SECONDS);
        scheduledExecutorService.scheduleAtFixedRate(() -> map.forEach((poolEntity, leakInfo) -> {
                if (System.currentTimeMillis() - leakInfo.borrowTime() > poolConfig.leakDetectionThresholdMs()) {
                    log.warn("에러 발생");
                    leakInfo.borrowTrace().printStackTrace();
                }}), 1, 1, TimeUnit.SECONDS);

        for (int i = 0; i < poolConfig.maximumPoolSize(); i++) {
            try {
                Connection connection = DriverManager.getConnection(connectionInfo.jdbcUrl(), connectionInfo.user(), connectionInfo.password());
                long jitter = ThreadLocalRandom.current().nextLong(poolConfig.maxLifetimeMs() * 25 / 1000);
                sharedList.add(new PoolEntity(connection, new AtomicInteger(0), System.currentTimeMillis(), poolConfig.maxLifetimeMs() + jitter));
                total.incrementAndGet();
                idle.incrementAndGet();
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }

    public PoolEntity getConnection(long timeoutMs) {
        pending.incrementAndGet();
        Throwable throwable = new Throwable();
        try {
            if (!semaphore.tryAcquire(timeoutMs, TimeUnit.MILLISECONDS)) throw new RuntimeException();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
        PoolEntity poolEntity = lastUsed.get();
        if (poolEntity != null && poolEntity.state().compareAndSet(0, 1)) {
            poolEntity = replaceConnection(poolEntity);
            map.put(poolEntity, new LeakInfo(throwable, System.currentTimeMillis()));
            pending.decrementAndGet();
            active.incrementAndGet();
            idle.decrementAndGet();
            return poolEntity;
        }

        for (PoolEntity loopPoolEntity : sharedList) {
            if (loopPoolEntity.state().compareAndSet(0, 1)) {
                loopPoolEntity = replaceConnection(loopPoolEntity);
                map.put(loopPoolEntity, new LeakInfo(throwable, System.currentTimeMillis()));
                lastUsed.set(loopPoolEntity);
                pending.decrementAndGet();
                active.incrementAndGet();
                idle.decrementAndGet();
                return loopPoolEntity;
            }
        }

        throw new RuntimeException("No available connection");
    }

    public void release(PoolEntity poolEntity) {
        map.remove(poolEntity);
        poolEntity.state().set(0);
        active.decrementAndGet();
        idle.incrementAndGet();
        semaphore.release();
    }

    private PoolEntity replaceConnection(PoolEntity old) {
        if (old.createdMillis() + poolConfig.maxLifetimeMs() < System.currentTimeMillis()) {
            Connection connection = null;
            try {
                old.connection().close();
                connection = DriverManager.getConnection(connectionInfo.jdbcUrl(), connectionInfo.user(), connectionInfo.password());
                long jitter = ThreadLocalRandom.current().nextLong(poolConfig.maxLifetimeMs() * 25 / 1000);
                PoolEntity fresh = new PoolEntity(connection, new AtomicInteger(0), System.currentTimeMillis(), poolConfig.maxLifetimeMs() + jitter);
                sharedList.remove(old);
                sharedList.add(fresh);
                System.out.println("[INFO] renew connection");
                return fresh;
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
        return old;
    }
}
