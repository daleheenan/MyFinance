# Project Manager Command

You are the Project Manager for Flow Finance Manager. This command is **persistent across all Claude sessions** because it reads from:
1. **Local TODO file**: `C:\Users\daleh\MyAI\MyFinance\financeflow\TODO_USER_REGISTRATION.md`
2. **GitHub Repository**: `https://github.com/daleheenan/MyFinance`
3. **package.json**: For version tracking

## Primary Data Source

The source of truth is `TODO_USER_REGISTRATION.md` in the financeflow directory. Always read this file first.

## Actions to Perform

### 1. Read Current Status
Read these files in order:
1. `C:\Users\daleh\MyAI\MyFinance\financeflow\TODO_USER_REGISTRATION.md` - Task list
2. `C:\Users\daleh\MyAI\MyFinance\financeflow\package.json` - Version number

Parse from TODO file:
- Current version number (from ## Project Status section)
- Last updated date
- Completed tasks (marked with [x])
- Pending tasks (marked with [ ])
- Version history table

### 2. Generate Status Report
Create a summary with this exact format:

```
═══════════════════════════════════════════════════════════════════════════════
  FLOW FINANCE MANAGER - PROJECT STATUS
═══════════════════════════════════════════════════════════════════════════════

📦 Version: [from package.json]
📅 Last Updated: [from TODO file]
📊 Progress: X/Y tasks completed (X%)

✅ COMPLETED PHASES
───────────────────────────────────────────────────────────────────────────────
• [List phases where all tasks are [x]]

🔄 IN PROGRESS
───────────────────────────────────────────────────────────────────────────────
• [Phases with some [x] and some [ ]]

📋 PENDING PHASES
───────────────────────────────────────────────────────────────────────────────
• [Phases with 0 completed tasks]

🎯 RECOMMENDED NEXT ACTIONS
───────────────────────────────────────────────────────────────────────────────
1. [First uncompleted task from highest priority pending phase]
2. [Second task]
3. [Third task]

📝 VERSION RECOMMENDATION
───────────────────────────────────────────────────────────────────────────────
Next release: X.X.X ([patch/minor/major])
Reason: [explanation based on pending work]

🔗 LINKS
───────────────────────────────────────────────────────────────────────────────
• GitHub: https://github.com/daleheenan/MyFinance
• TODO File: financeflow/TODO_USER_REGISTRATION.md

═══════════════════════════════════════════════════════════════════════════════
```

### 3. Version Recommendation Rules
- **Patch (x.x.+1)**: Bug fixes only, no new features
- **Minor (x.+1.0)**: New features that don't break existing functionality
- **Major (+1.0.0)**: Breaking changes to API or database schema

### 4. Commands Available

| Command | Action |
|---------|--------|
| `/pm` | Show full status report |
| `/pm status` | Same as `/pm` |
| `/pm next` | Show only next 5 priority tasks |
| `/pm phase N` | Show details for Phase N |
| `/pm release` | Bump version, update TODO, commit & push |
| `/pm update` | Mark tasks as complete in TODO file |

### 5. Release Process (`/pm release`)
When user runs `/pm release`:
1. Ask for version type: patch, minor, or major
2. Bump version in package.json
3. Update TODO file:
   - Update "Current Version"
   - Update "Last Updated" to today
   - Add entry to Version History table
4. Commit with message: `v{version}: {summary of changes}`
5. Push to GitHub
6. Show updated status report

### 6. Task Update Process (`/pm update`)
When user wants to mark tasks complete:
1. Ask which tasks to mark complete (by number like "1.1, 1.2, 2.3")
2. Edit TODO_USER_REGISTRATION.md to change [ ] to [x]
3. Show updated progress

## Important Notes

- This command works across ALL Claude Code sessions because it reads from persistent files
- The TODO file is the single source of truth for task status
- Always verify files exist before reading
- If GitHub CLI (gh) is available, also check for open issues/PRs
