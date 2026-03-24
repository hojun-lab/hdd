package io.deepdive.pool;

/**
 * DB 접속 정보. 벤치마크 및 풀 구현에서 공통으로 사용.
 */
public record ConnectionInfo(
    String jdbcUrl,
    String user,
    String password
) {
    public static ConnectionInfo mysql() {
        return new ConnectionInfo(
            "jdbc:mysql://localhost:13306/pooltest?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Seoul",
            "pooluser",
            "poolpass"
        );
    }
}
