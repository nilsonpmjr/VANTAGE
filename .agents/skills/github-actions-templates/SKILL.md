---
name: github-actions-templates
description: Production-ready GitHub Actions workflow patterns for testing, building, and deploying applications.
source: https://skills.sh/wshobson/agents/github-actions-templates
---

# GitHub Actions Templates

Standardized, production-grade workflow patterns for modern software development.

## Common Workflow Patterns

### 1. Test Workflow

Automates the testing process on every push or pull request to the main branch.

- Runs on `ubuntu-latest`.
- Includes steps for checkout, language setup, dependency installation, and test execution.

### 2. Build and Push Docker Image

Builds a Docker image and pushes it to a container registry (GHCR/DockerHub).

- Triggers on successful tests.
- Handles tags and multi-platform builds.

### 3. Release Workflow

Automates the creation of GitHub releases and version tagging.

- Synchronizes versioning with branch tags.
- Generates changelogs automatically.
