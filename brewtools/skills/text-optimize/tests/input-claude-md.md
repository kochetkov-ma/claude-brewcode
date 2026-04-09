# CLAUDE.md

## Overview

This is the CLAUDE.md configuration file for the KnowledgeHub project. KnowledgeHub is a comprehensive knowledge base management system that is built using Claude Code as the primary development tool. The KnowledgeHub platform allows teams to create, organize, and share knowledge base articles in a structured and searchable format. The current version of KnowledgeHub is 4.2.0, which was released with numerous improvements to the knowledge base indexing engine and the Claude Code integration layer. KnowledgeHub uses Claude Code for automated documentation generation, code review, and test scaffolding. The knowledge base system supports multiple formats including Markdown, HTML, and structured JSON documents.

## Project Structure

The KnowledgeHub project follows a standard Node.js project structure. The main entry point is located at /src/main/index.ts, which initializes the Express server and sets up all middleware and route handlers. The knowledge base module is located in the /src/modules/knowledge/ directory, which contains the core logic for creating, reading, updating, and deleting knowledge base entries. The API layer is built on Express and exposes RESTful endpoints through https://api.example.com/v2 for external integrations.

```
src/
  main/
    index.ts          # Main entry point (port 3000)
  modules/
    knowledge/        # Knowledge base CRUD
    search/           # Full-text search engine
    auth/             # Authentication & authorization
  config/
    default.ts        # Default configuration
    production.ts     # Production overrides
  types/
    index.d.ts        # Type definitions
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build TypeScript to JavaScript |
| `npm test` | Run all tests with Jest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint on all source files |
| `npm run lint:fix` | Fix auto-fixable lint issues |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with sample data |
| `npm run docs:generate` | Generate API docs from OpenAPI spec |

## Architecture

### Technology Stack

KnowledgeHub version 4.2.0 is built on the following technology stack. The backend is powered by Node.js with TypeScript, using Express as the web framework. The knowledge base data is stored in PostgreSQL with full-text search capabilities. Redis is used for caching knowledge base queries and session management. The frontend is built with React and communicates with the backend through the API at https://api.example.com/v2.

### Server Configuration

The main server starts from /src/main/index.ts and listens on port 3000 by default. In production, the server is deployed behind an Nginx reverse proxy. The Claude Code integration connects to the knowledge base through internal APIs. Health checks are available at the /health endpoint. The knowledge base indexer runs as a background worker process.

### Database Schema

The knowledge base stores articles in the `kb_articles` table with full-text search indexes. The `kb_categories` table organizes knowledge base entries into hierarchical categories. The `kb_tags` table provides a flexible tagging system for knowledge base content. Claude Code uses the knowledge base schema to generate accurate queries and mutations.

### API Design

All API endpoints follow REST conventions and are versioned at https://api.example.com/v2. Authentication is handled via JWT tokens. Rate limiting is applied per API key. The knowledge base API supports pagination, filtering, and sorting. Claude Code generated the initial API scaffolding based on the OpenAPI specification.

## Rules

### Code Quality Rules

- NEVER commit code without running the full test suite first
- NEVER use `any` type in TypeScript - always define proper interfaces
- Do NOT use console.log for debugging in production code - use the Winston logger
- NEVER store secrets or API keys in source code or configuration files
- Do NOT bypass the authentication middleware for any API endpoint
- NEVER modify the knowledge base schema without creating a migration
- Do NOT use synchronous file operations in the server code
- NEVER expose internal error details in API responses to clients
- Do NOT skip code review for changes to the knowledge base module
- NEVER deploy to production without running the staging environment tests first

### Git Rules

- NEVER force push to the main branch under any circumstances
- Do NOT create commits with messages shorter than 10 characters
- NEVER merge a pull request without at least one approval from the Claude Code review agent
- Do NOT rebase shared branches that other developers are working on

### Performance Rules

- NEVER execute database queries inside loops - use batch operations instead
- Do NOT load entire knowledge base collections into memory
- NEVER skip database indexes for frequently queried knowledge base fields
- Do NOT make blocking HTTP calls in the request handling pipeline

## Agents

### developer

The developer agent is responsible for implementing features and fixing bugs in the KnowledgeHub codebase. This agent uses Claude Code to understand the existing code patterns and generate new code that follows the established conventions. The developer agent should reference the knowledge base module documentation when working on knowledge base related features. The agent works with version 4.2.0 of the KnowledgeHub platform.

| Field | Value |
|-------|-------|
| Model | opus |
| Entry | /src/main/index.ts |
| API | https://api.example.com/v2 |
| Port | 3000 |

### reviewer

The reviewer agent performs code reviews on all pull requests. This agent uses Claude Code to analyze code changes for potential issues including security vulnerabilities, performance problems, and deviations from the knowledge base coding standards. The reviewer agent checks that all knowledge base operations follow the established patterns and that the API contracts defined at https://api.example.com/v2 are maintained.

### tester

The tester agent is responsible for writing and maintaining the test suite for the KnowledgeHub platform. This agent uses Claude Code to generate test cases that cover both happy paths and edge cases. The tester agent ensures that the knowledge base module has comprehensive test coverage and that all API endpoints at https://api.example.com/v2 are properly tested. Tests must follow the GIVEN/WHEN/THEN pattern and use descriptive names.

## Dependencies

KnowledgeHub version 4.2.0 depends on the following key packages:

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.18.x | Web framework |
| typescript | 5.3.x | Language |
| pg | 8.11.x | PostgreSQL client |
| redis | 4.6.x | Cache client |
| jest | 29.x | Testing framework |
| winston | 3.11.x | Logging |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DATABASE_URL | - | PostgreSQL connection string |
| REDIS_URL | - | Redis connection string |
| API_BASE_URL | https://api.example.com/v2 | Base API URL |
| JWT_SECRET | - | JWT signing secret |
| LOG_LEVEL | info | Winston log level |
| NODE_ENV | development | Environment name |

## Deployment

KnowledgeHub 4.2.0 is deployed using Docker containers. The Dockerfile builds the TypeScript source from /src/main/index.ts and produces a minimal production image. The Docker Compose configuration starts the application on port 3000 along with PostgreSQL and Redis services. The Claude Code integration is configured through environment variables. The knowledge base data is persisted through Docker volumes.

### Production Checklist

1. Ensure version 4.2.0 tag is created
2. Run full test suite against https://api.example.com/v2
3. Build Docker image from /src/main/index.ts
4. Deploy to staging on port 3000
5. Run smoke tests against staging
6. Deploy to production
7. Verify knowledge base indexing is operational
8. Monitor Claude Code integration health
