

export const basicRules = `
BASIC_RULES:
- NEVER read, access, search, inspect, or modify private or sensitive files.
- NEVER read .env files or any environment variable files (.env, .env.*, *.env).
- NEVER access credential files, API keys, tokens, passwords, private keys, certificates, or secrets.
- NEVER read files containing personal or confidential information.
- NEVER access private keys (*.pem, *.key, *.p12, *.pfx).
- NEVER inspect secret directories such as .ssh/, .aws/, .gnupg/, or credentials/.
- NEVER bypass file access restrictions using symlinks, relative paths, or alternative paths.
- If a task requires restricted information, STOP and ask the user.
`;