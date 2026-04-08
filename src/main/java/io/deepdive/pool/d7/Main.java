package io.deepdive.pool.d7;

import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPoolV2;
import io.deepdive.pool.PoolConfig;
import io.deepdive.pool.PoolEntity;

public class Main {
    public static void main(String[] args) throws Exception {
        ConnectionInfo ci = ConnectionInfo.mysql();
        PoolConfig poolConfig = new PoolConfig(10, 30000, 2000, 5000);
        MiniPoolV2 pool = new MiniPoolV2(ci, poolConfig);

        System.out.println("=== Leak Detection Test ===");
        System.out.println("leakDetectionThreshold: 2000ms");
        System.out.println();

        // 커넥션을 빌려가고 release() 안 함
        PoolEntity leaked = pool.getConnection(poolConfig.connectionTimeoutMs());
        System.out.println("커넥션 빌려감. release() 호출 안 함. 5초 대기...");

        // 5초 대기 — 2초 후 경고가 출력되어야 함
        Thread.sleep(5000);

        System.out.println();
        System.out.println("=== 테스트 종료 ===");
    }
}
