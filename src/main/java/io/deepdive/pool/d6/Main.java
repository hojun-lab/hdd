package io.deepdive.pool.d6;

import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPoolV2;
import io.deepdive.pool.PoolEntity;

import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    public static void main(String[] args) {
        long startTime = System.nanoTime();
        ConnectionInfo ci = ConnectionInfo.mysql();
        int threadCount = 50;
        int iterCount = 1000;
        loadTestNoPool(ci, threadCount, iterCount);
        long endTime = System.nanoTime();

        System.out.printf("Total call: %s * %s --> %s", threadCount ,iterCount, (threadCount * iterCount));
        System.out.println("Total execution time: " + TimeUnit.NANOSECONDS.toMillis(endTime - startTime));
        System.out.println("Throughput per Second: " + (threadCount * iterCount) / ((endTime - startTime) / 1_000_000_000.0));
    }

    private static void loadTestNoPool(ConnectionInfo info, int threadCount, int iterationsPerThread) {
        AtomicInteger failCount = new AtomicInteger(0);
        ExecutorService es = Executors.newFixedThreadPool(threadCount);
        MiniPoolV2 miniPoolV2 = new MiniPoolV2(info, 10);

        for (int i = 0; i < threadCount; i++) {
            es.submit(() -> {
                for (int j = 0; j < iterationsPerThread; j++) {
                    try {
                        PoolEntity connection = miniPoolV2.getConnection(100);
                        Statement statement = connection.connection().createStatement();
                        statement.execute("SELECT 1");
                        statement.close();
                        miniPoolV2.release(connection);
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
