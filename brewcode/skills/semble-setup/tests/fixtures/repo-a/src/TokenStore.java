package fixtures.repoa;

import java.util.Map;
import java.util.HashMap;

/** In-memory token store used only as a coverage fixture. */
public class TokenStore {
    private final Map<String, String> tokens = new HashMap<>();

    public void put(String token, String userId) {
        tokens.put(token, userId);
    }

    public String findByToken(String token) {
        return tokens.get(token);
    }

    public int size() {
        return tokens.size();
    }
}
