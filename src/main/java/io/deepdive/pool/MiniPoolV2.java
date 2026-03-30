package io.deepdive.pool;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public class MiniPoolV2 {
    private final ConnectionInfo connectionInfo;
    private final int poolSize;

    List<PoolEntity> sharedList = new ArrayList<>();
    ThreadLocal<PoolEntity> lastUsed = new ThreadLocal<>();

    public MiniPoolV2(ConnectionInfo connectionInfo, int poolSize) {
        this.connectionInfo = connectionInfo;
        this.poolSize = poolSize;

        for (int i = 0; i < poolSize; i++) {
            try {
                Connection connection = DriverManager.getConnection(connectionInfo.jdbcUrl(), connectionInfo.user(), connectionInfo.password());
                sharedList.add(new PoolEntity(connection, new AtomicInteger(0)));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }

    public PoolEntity getConnection() {
        PoolEntity poolEntity = lastUsed.get();
        if (poolEntity != null && poolEntity.state().compareAndSet(0, 1)) {
            return poolEntity;
        }

        for (PoolEntity loopPoolEntity : sharedList) {
            if (loopPoolEntity.state().compareAndSet(0, 1)) {
                lastUsed.set(loopPoolEntity);
                return loopPoolEntity;
            }
        }

        throw new RuntimeException("No available connection");
    }

    public void release(PoolEntity poolEntity) {
        poolEntity.state().set(0);
    }
}
