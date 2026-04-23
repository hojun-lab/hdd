package io.deepdive.pool.w3d1;

import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPoolV2;
import io.deepdive.pool.PoolConfig;
import io.deepdive.pool.PoolEntity;

import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class ExhaustionTest {

    public static void main(String[] args) throws Exception {
        ConnectionInfo ci = ConnectionInfo.mysql();

        System.out.println("=== Scenario 1: Slow Query ===");
        PoolConfig poolConfig1 = new PoolConfig(10, 30000, 20000, 20000);
        MiniPoolV2 miniPoolV2 = new MiniPoolV2(ci, poolConfig1);

        ExecutorService executorService = Executors.newFixedThreadPool(50);

        for (int i = 0; i < 50; i++) {
            executorService.submit(() -> {
                PoolEntity connection = miniPoolV2.getConnection(poolConfig1.connectionTimeoutMs());
                Statement statement = null;
                try {
                    statement = connection.connection().createStatement();
                    statement.execute("SELECT 1");
                    statement.close();
                    Thread.sleep(5000);
                } catch (InterruptedException | SQLException e) {
                    throw new RuntimeException(e);
                }
                miniPoolV2.release(connection);
            });
        }
        executorService.shutdown();
        executorService.awaitTermination(60, TimeUnit.SECONDS);

//        System.out.println("\n=== Scenario 2: Traffic Spike ===");
//        PoolConfig poolConfig2 = new PoolConfig(10, 3000, 20000);
//        MiniPoolV2 miniPool2 = new MiniPoolV2(ci, poolConfig2);
//
//        ExecutorService executorService2 = Executors.newFixedThreadPool(500);
//
//        for (int i = 0; i < 500; i++) {
//            executorService2.submit(() -> {
//                PoolEntity connection = miniPool2.getConnection(poolConfig2.connectionTimeoutMs());
//                Statement statement;
//                try {
//                    statement = connection.connection().createStatement();
//                    statement.execute("SELECT 1");
//                    statement.close();
//                } catch (SQLException e) {
//                    throw new RuntimeException(e);
//                }
//                try {
//                    Thread.sleep(100);
//                    miniPool2.release(connection);
//                } catch (InterruptedException e) {
//                    throw new RuntimeException(e);
//                }
//            });
//        }
//        executorService2.shutdown();
//        executorService2.awaitTermination(60, TimeUnit.SECONDS);

//        System.out.println("\n=== Scenario 3: Connection Leak ===");
//        PoolConfig poolConfig2 = new PoolConfig(10, 5000, 2000, 5000);
//        MiniPoolV2 miniPool2 = new MiniPoolV2(ci, poolConfig2);
//
//        ExecutorService executorService2 = Executors.newFixedThreadPool(20);
//
//        for (int i = 0; i < 20; i++) {
//            executorService2.submit(() -> {
//                PoolEntity connection = miniPool2.getConnection(poolConfig2.connectionTimeoutMs());
//                Statement statement;
//                try {
//                    statement = connection.connection().createStatement();
//                    statement.execute("SELECT 1");
//                    statement.close();
//                } catch (SQLException e) {
//                    throw new RuntimeException(e);
//                }
//                try {
//                    Thread.sleep(3000);
//                } catch (InterruptedException e) {
//                    throw new RuntimeException(e);
//                }
//            });
//        }
//        executorService2.shutdown();
//        executorService2.awaitTermination(60, TimeUnit.SECONDS);
    }
}
