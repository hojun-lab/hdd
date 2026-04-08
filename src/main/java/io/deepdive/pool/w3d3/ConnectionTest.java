package io.deepdive.pool.w3d3;

import io.deepdive.pool.ConnectionInfo;
import io.deepdive.pool.MiniPoolV2;
import io.deepdive.pool.PoolConfig;
import io.deepdive.pool.PoolEntity;

import java.sql.SQLException;
import java.sql.Statement;

import static java.lang.Thread.sleep;

public class ConnectionTest {
    public static void main(String[] args) {
        ConnectionInfo ci = ConnectionInfo.mysql();
        PoolConfig poolConfig = new PoolConfig(10, 5000, 2000, 3000);
        MiniPoolV2 miniPool2 = new MiniPoolV2(ci, poolConfig);

        PoolEntity connection = miniPool2.getConnection(poolConfig.connectionTimeoutMs());
        Statement statement;
        try {
            statement = connection.connection().createStatement();
            statement.execute("SELECT 1");
            statement.close();
            miniPool2.release(connection);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        try {
            sleep(5000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }

        connection = miniPool2.getConnection(poolConfig.connectionTimeoutMs());
        try {
            statement = connection.connection().createStatement();
            statement.execute("SELECT 1");
            statement.close();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}
