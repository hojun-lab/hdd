package io.deepdive.pool.d1;

import io.deepdive.pool.ConnectionInfo;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        ConnectionInfo ci = ConnectionInfo.mysql();
        Map<String, Long> val = measureConnectionCost(ci, 1000);
        for (Map.Entry<String, Long> entry : val.entrySet()) {
            System.out.println(entry.getKey() + " : " + entry.getValue());
        }
    }

    private static Map<String, Long> measureConnectionCost(ConnectionInfo info, int iterations) {
        long[] results = new long[iterations];
        for (int i = 0; i < 50; i++) {
            // warm-up loop
            try {
                long startTime = System.currentTimeMillis();
                Connection connection = DriverManager.getConnection(info.jdbcUrl(), info.user(), info.password());
                connection.close();
                long endTime = System.currentTimeMillis();
                results[i] = endTime - startTime;
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
        for (int i = 0; i < iterations; i++) {
            try {
                long startTime = System.currentTimeMillis();
                Connection connection = DriverManager.getConnection(info.jdbcUrl(), info.user(), info.password());
                connection.close();
                long endTime = System.currentTimeMillis();
                results[i] = endTime - startTime;
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
        Arrays.sort(results);
        return Map.of(
                "p50", results[499],
                "p99", results[989],
                "MAX", results[999],
                "AVG", (long) Arrays.stream(results).average().getAsDouble()
        );
    }
}
