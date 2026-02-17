# CodeSearch 🔍

> Lightweight code search tool with AST understanding for TypeScript and Python

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](https://github.com/digi-monkey/codesearch)
[![Tests](https://img.shields.io/badge/tests-13%2F13-brightgreen.svg)]()

## Quick Start 🚀

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Index your code
npm start -- build

# Search symbols
npm start -- "functionName"
npm start -- "def:myFunction"
npm start -- "class:MyClass"
```

## Features ✨

### Incremental Indexing (7x Faster!)
- First build: Full index
- Subsequent builds: Only changed files
- Perfect for CI/CD and watch mode

### Multi-Language Support
| Language | Status | Symbols |
|----------|--------|---------|
| TypeScript | ✅ Full | def, ref, class, interface |
| JavaScript | ✅ Full | def, ref, class |
| Python | ✅ Full | def, class, import |

### Smart Query Syntax
```bash
# Search by type
csearch "def:foo"        # function definitions
csearch "ref:bar"        # references/usage
csearch "class:MyClass"  # class definitions

# Or just search everything
csearch "foo"
```

## Installation 📦

### Global Install
```bash
git clone https://github.com/digi-monkey/codesearch.git
cd codesearch
npm install
npm link
```

### Local Usage
```bash
# In your project
codesearch build
codesearch "searchTerm"
```

## Usage Examples 💡

### Index a Project
```bash
# Navigate to your project
cd ~/my-project

# Build index (first time)
codesearch build

# Rebuild (incremental - super fast!)
codesearch build
```

### Search Commands
```bash
# Find function definition
codesearch "def:calculateTotal"

# Find class definition  
codesearch "class:UserService"

# Find all references
codesearch "ref:formatDate"

# Simple search
codesearch "authenticate"
```

### Output Format
```
ƒ calculateTotal (def)
   src/utils.ts:42:10

◎ UserService (def)
   src/services/user.ts:15:7

• formatDate (ref)
   src/components/Order.tsx:88:24
```

## For AI Agents 🤖

### Quick Integration
```javascript
import { buildIndex, search } from 'codesearch';

// Build index for a project
await buildIndex('/path/to/project');

// Search for symbols
search('/path/to/project', 'def:targetFunction');
```

### Project Structure
```
codesearch/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── indexer.ts    # Core indexing logic
│   └── search.ts     # Search functionality
├── tests/            # Test suite (vitest)
└── dist/             # Compiled output
```

### Key APIs
- `buildIndex(projectRoot: string)` - Build/update index
- `search(projectRoot, query, options)` - Search symbols

### Language Extension
To add a new language:
1. Install tree-sitter parser: `npm install tree-sitter-<lang>`
2. Add language config in `src/indexer.ts`
3. Define node types (functionDef, classDef, etc.)
4. Add tests in `tests/`

## Development 🛠️

```bash
# Run tests
npm test

# Development mode
npm run dev

# Build
npm run build
```

## Version History 📋

| Version | Features |
|---------|----------|
| v0.3.0 | Python support, incremental indexing |
| v0.2.0 | Incremental indexing |
| v0.1.0 | TypeScript/JavaScript support |

## License 📄

MIT License - See [LICENSE](./LICENSE) for details

---

**Built with ❤️ by digi-monkey**  
**Contributions welcome!** 🎉
