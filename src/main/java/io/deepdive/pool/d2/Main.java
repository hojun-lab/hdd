package io.deepdive.pool.d2;

import io.deepdive.pool.ConnectionInfo;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    public static void main(String[] args) {
        long startTime = System.nanoTime();
        ConnectionInfo ci = ConnectionInfo.mysql();
        loadTestNoPool(ci, 250, 200);
        long endTime = System.nanoTime();

        System.out.println("Total call: 250 * 100 --> " + (250 * 200));
        System.out.println("Total execution time: " + TimeUnit.NANOSECONDS.toMillis(endTime - startTime));
        System.out.println("Throughput per Second: " + (250.0 * 200.0) / ((endTime - startTime) / 1_000_000_000.0));
    }

    private static void loadTestNoPool(ConnectionInfo info, int threadCount, int iterationsPerThread) {
        AtomicInteger failCount = new AtomicInteger(0);
        ExecutorService es = Executors.newFixedThreadPool(threadCount);

        for (int i = 0; i < threadCount; i++) {
            es.submit(() -> {
                for (int j = 0; j < iterationsPerThread; j++) {
                    try {
                        Connection connection = DriverManager.getConnection(info.jdbcUrl(), info.user(), info.password());
                        Statement statement = connection.createStatement();
                        statement.execute("SELECT 1");
                        statement.close();
                        connection.close();
                    } catch (SQLException e) {
                        failCount.incrementAndGet();
                        System.out.println(e.getMessage());
                    }
                }
            });
        }
        es.shutdown();
        try {
            es.awaitTermination(5, TimeUnit.MINUTES);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
        System.out.println("Fail Count: " +  failCount.get());
    }
}
