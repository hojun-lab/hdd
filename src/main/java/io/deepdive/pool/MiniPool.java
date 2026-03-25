package io.deepdive.pool;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;

public class MiniPool {
    private final ConnectionInfo connectionInfo;
    private final int poolSize;

    ArrayList<Connection> connectionStore = new ArrayList<>();

    public MiniPool(ConnectionInfo connectionInfo, int poolSize) {
        this.connectionInfo = connectionInfo;
        this.poolSize = poolSize;

        for (int i = 0; i < poolSize; i++) {
            try {
                Connection connection = DriverManager.getConnection(connectionInfo.jdbcUrl(), connectionInfo.user(), connectionInfo.password());
                connectionStore.add(connection);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }

    public synchronized Connection getConnection() {
        if (connectionStore.isEmpty()) {
            throw new RuntimeException("Connection is null");
        }
        Connection conn = connectionStore.get(0);
        connectionStore.remove(0);
        return conn;
    }

    public synchronized void release(Connection conn) {
        connectionStore.add(conn);
    }
}
