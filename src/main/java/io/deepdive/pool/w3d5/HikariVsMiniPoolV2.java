package io.deepdive.pool.w3d5;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPoolV2;
import io.deepdive.pool.PoolConfig;
import io.deepdive.pool.PoolEntity;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class HikariVsMiniPoolV2 {
    public static void main(String[] args) {
        ConnectionInfo connectionInfo = ConnectionInfo.mysql();

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(connectionInfo.jdbcUrl());
        config.setUsername(connectionInfo.user());
        config.setPassword(connectionInfo.password());
        config.setMaximumPoolSize(10);
        config.setConnectionTimeout(30000);
        HikariDataSource ds = new HikariDataSource(config);

        PoolConfig poolConfig = new PoolConfig(10, 30000, 0, 1_800_000);
        MiniPoolV2 pool = new MiniPoolV2(connectionInfo, poolConfig);

        System.out.println(">>>>>>>>>>>>>>>> MiniPoolV2 started");
        ExecutorService executorService1 = Executors.newFixedThreadPool(50);
        long start1 = System.nanoTime();
        for (int i = 0; i < 50; i++) {
            executorService1.submit(() -> {
                for (int j = 0; j < 1000; j++) {
                    PoolEntity connection = pool.getConnection(poolConfig.connectionTimeoutMs());
                    try {
                        Statement statement = connection.connection().createStatement();
                        statement.execute("SELECT 1");
                        statement.close();
                        pool.release(connection);
                    } catch (SQLException e) {
                        throw new RuntimeException(e);
                    }
                }
            });
        }
        try {
            executorService1.shutdown();
            executorService1.awaitTermination(60, TimeUnit.SECONDS);
            long end1 = System.nanoTime();
            System.out.println("Result1 : " + 50 * 1000 / ((end1 - start1) / 1_000_000_000.0));
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }

        System.out.println(">>>>>>>>>>>>>>>> Hikari started");
        ExecutorService executorService2 = Executors.newFixedThreadPool(50);
        long start2 = System.nanoTime();
        for (int i = 0; i < 50; i++) {
            executorService2.submit(() -> {
                for (int j = 0; j < 1000; j++) {
                    try {
                        Connection connection = ds.getConnection();
                        Statement statement = connection.createStatement();
                        statement.execute("SELECT 1");
                        statement.close();
                        connection.close();
                    } catch (SQLException e) {
                        throw new RuntimeException(e);
                    }
                }
            });
        }
        try {
            executorService2.shutdown();
            executorService2.awaitTermination(60, TimeUnit.SECONDS);
            long end2 = System.nanoTime();
            System.out.println("Result2 : " + 50 * 1000 / ((end2 - start2) / 1_000_000_000.0));
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }
}
