package io.deepdive.pool.d3;

import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPool;

import java.sql.Connection;
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
        int threadCount = 100;
        int iterCount = 100;
        loadTestNoPool(ci, threadCount, iterCount);
        long endTime = System.nanoTime();

        System.out.printf("Total call: %s * %s --> %s", threadCount ,iterCount, (threadCount * iterCount));
        System.out.println("Total execution time: " + TimeUnit.NANOSECONDS.toMillis(endTime - startTime));
        System.out.println("Throughput per Second: " + (threadCount * iterCount) / ((endTime - startTime) / 1_000_000_000.0));
    }

    private static void loadTestNoPool(ConnectionInfo info, int threadCount, int iterationsPerThread) {
        AtomicInteger failCount = new AtomicInteger(0);
        ExecutorService es = Executors.newFixedThreadPool(threadCount);
        MiniPool miniPool = new MiniPool(info, 50);

        for (int i = 0; i < threadCount; i++) {
            es.submit(() -> {
                for (int j = 0; j < iterationsPerThread; j++) {
                    try {
                        Connection connection = miniPool.getConnection();
                        Statement statement = connection.createStatement();
                        statement.execute("SELECT 1");
                        statement.close();
                        miniPool.release(connection);
                    } catch (Exception e) {
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
