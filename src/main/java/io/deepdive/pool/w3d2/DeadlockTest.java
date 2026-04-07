package io.deepdive.pool.w3d2;

import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPoolV2;
import io.deepdive.pool.PoolConfig;
import io.deepdive.pool.PoolEntity;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class DeadlockTest {
    public static void main(String[] args) throws Exception {
        ConnectionInfo connectionInfo = ConnectionInfo.mysql();
        PoolConfig poolConfig = new PoolConfig(2, 5000, 2000);
        MiniPoolV2 miniPoolV2 = new MiniPoolV2(connectionInfo, poolConfig);
        ExecutorService executorService = Executors.newFixedThreadPool(2);

        for (int i = 0; i < 2; i++) {
            executorService.submit(() -> {
                PoolEntity poolEntity1 = miniPoolV2.getConnection(poolConfig.connectionTimeoutMs());
                PoolEntity poolEntity2 = miniPoolV2.getConnection(poolConfig.connectionTimeoutMs());
            });
        }
    }
}
