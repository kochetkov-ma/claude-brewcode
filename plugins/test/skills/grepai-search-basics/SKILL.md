---
name: grepai-search-basics
description: Basic semantic code search with GrepAI. Use this skill to learn fundamental search commands and concepts.
---

# GrepAI Search Basics

This skill covers the fundamentals of semantic code search with GrepAI.

## When to Use This Skill

- Learning GrepAI search
- Performing basic code searches
- Understanding semantic vs. text search
- Interpreting search results

## Prerequisites

1. GrepAI initialized (`grepai init`)
2. Index created (`grepai watch`)
3. Ollama running

## What is Semantic Search?

Unlike traditional text search (grep, ripgrep), GrepAI searches by **meaning**:

| Type | How it Works | Example |
|------|--------------|---------|
| **Text search** | Exact string match | "login" → finds "login" |
| **Semantic search** | Meaning similarity | "authenticate user" → finds login, auth, signin code |

## Basic Search Command

```bash
grepai search "your query here"
```

### Example

```bash
grepai search "user authentication flow"
```

Output:
```
Score: 0.89 | src/main/java/com/example/auth/JwtAuthFilter.java:15-45
──────────────────────────────────────────
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.sendError(401, "Missing token");
            return;
        }
        String token = authHeader.substring(7);
        try {
            Claims claims = validateToken(token);
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(claims.getSubject(), null, null));
        } catch (JwtException e) {
            response.sendError(401, "Invalid token");
        }
        filterChain.doFilter(request, response);
    }
}

Score: 0.82 | src/main/java/com/example/auth/JwtTokenProvider.java:23-55
──────────────────────────────────────────
@Component
public class JwtTokenProvider {
    public Claims validateToken(String token) throws JwtException {
        try {
            return Jwts.parserBuilder()
                .setSigningKey(secretKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
        } catch (ExpiredJwtException | MalformedJwtException e) {
            throw new JwtException("Invalid token", e);
        }
    }
}

Score: 0.76 | src/main/java/com/example/controller/AuthController.java:10-35
──────────────────────────────────────────
@RestController
@RequestMapping("/auth")
public class AuthController {
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        User user = userService.authenticate(request.getEmail(), request.getPassword());
        String token = jwtTokenProvider.generateToken(user);
        return ResponseEntity.ok(new LoginResponse(token));
    }
}
```

## Understanding Results

### Result Format

```
Score: 0.89 | src/auth/middleware.go:15-45
──────────────────────────────────────────
[code content]
```

| Component | Meaning |
|-----------|---------|
| **Score** | Similarity (0.0 to 1.0, higher = more relevant) |
| **File path** | Location of the code |
| **Line numbers** | Start-end lines of the chunk |
| **Content** | The actual code |

### Score Interpretation

| Score | Meaning |
|-------|---------|
| 0.90+ | Excellent match |
| 0.80-0.89 | Good match |
| 0.70-0.79 | Related |
| 0.60-0.69 | Loosely related |
| <0.60 | Weak match |

## Limiting Results

By default, GrepAI returns 10 results. Adjust with `--limit`:

```bash
# Get only top 3 results
grepai search "database queries" --limit 3

# Get more results
grepai search "error handling" --limit 20
```

## Checking Index Status

Before searching, verify your index:

```bash
grepai status
```

Output:
```
✅ GrepAI Status

   Index:
   - Files: 245
   - Chunks: 1,234
   - Last updated: 2 minutes ago

   Ready for search.
```

## Search vs Grep Comparison

### Traditional grep

```bash
grep -r "authenticate" .
```
- Finds exact text "authenticate"
- Misses synonyms (login, signin, auth)
- Returns all matches, unranked

### GrepAI search

```bash
grepai search "authenticate user credentials"
```
- Finds semantically similar code
- Includes related concepts
- Results ranked by relevance

## What Makes a Good Query

### Good Queries ✅

Describe the intent or behavior:

```bash
grepai search "validate user credentials"
grepai search "handle HTTP request errors"
grepai search "connect to the database"
grepai search "send email notification"
grepai search "parse JSON configuration"
```

### Less Effective Queries ❌

Too short or generic:

```bash
grepai search "auth"           # Too vague
grepai search "function"       # Too generic
grepai search "getUserById"    # Exact name (use grep)
```

## Natural Language Queries

GrepAI understands natural language:

```bash
# Ask questions
grepai search "how are users authenticated"
grepai search "where is the database connection configured"

# Describe behavior
grepai search "code that sends emails to users"
grepai search "functions that validate input data"
```

## Multiple Words vs Phrases

Both work, but phrases often get better results:

```bash
# Multiple words (OR-like behavior)
grepai search "login password validation"

# Phrase (describes specific intent)
grepai search "validate user login credentials"
```

## Quick Tips

1. **Use English:** Models are trained on English
2. **Be specific:** "JWT token validation" vs "validation"
3. **Describe intent:** What the code DOES, not what it's called
4. **Use 3-7 words:** Enough context, not too verbose
5. **Iterate:** Refine query based on results

## Common Search Patterns

### Finding Entry Points

```bash
grepai search "main entry point"
grepai search "application startup"
grepai search "HTTP server initialization"
```

### Finding Error Handling

```bash
grepai search "error handling and logging"
grepai search "exception handling"
grepai search "error response to client"
```

### Finding Data Access

```bash
grepai search "database query execution"
grepai search "fetch user from database"
grepai search "save data to storage"
```

### Finding Business Logic

```bash
grepai search "calculate order total"
grepai search "process payment transaction"
grepai search "validate business rules"
```

## Troubleshooting

❌ **Problem:** No results
✅ **Solutions:**
- Check index exists: `grepai status`
- Run `grepai watch` if index is empty
- Simplify query

❌ **Problem:** Irrelevant results
✅ **Solutions:**
- Be more specific
- Use different words
- Check if code exists in the codebase

❌ **Problem:** Missing expected code
✅ **Solutions:**
- Check if file is ignored in config
- Ensure file extension is supported
- Re-index: `rm .grepai/index.gob && grepai watch`

## Output Format

Successful basic search:

```
Query: "user authentication flow"
Results: 5 matches

Score: 0.89 | src/auth/middleware.go:15-45
──────────────────────────────────────────
[relevant code...]

Score: 0.82 | src/auth/jwt.go:23-55
──────────────────────────────────────────
[relevant code...]

[additional results...]

Tip: Use --limit to adjust number of results
     Use --json for machine-readable output
```
