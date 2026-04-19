---
name: installmac
description: Build the latest GitChecker DMG and install it to /Applications
disable-model-invocation: true
allowed-tools: Bash(*)
---

# Install GitChecker on macOS

Run the install script:

```bash
bash "${CLAUDE_SKILL_DIR}/../../../scripts/install-mac.sh"
```

After the script completes, confirm the install was successful and let the user know they can launch GitChecker from Spotlight or the Applications folder.
