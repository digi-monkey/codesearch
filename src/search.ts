import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface Symbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'export' | 'import';
  file: string;
  line: number;
  column: number;
  kind: 'def' | 'ref';
}

interface Index {
  version: string;
  created: string;
  symbols: Symbol[];
}

/**
 * 加载索引
 */
function loadIndex(projectRoot: string): Index | null {
  const indexPath = join(projectRoot, '.cindex', 'index.json');
  if (!existsSync(indexPath)) {
    console.error(`No index found. Run 'cindex build' first.`);
    return null;
  }

  try {
    const content = readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error loading index:`, err);
    return null;
  }
}

/**
 * 搜索符号
 */
export function search(
  projectRoot: string,
  query: string,
  options: {
    type?: 'def' | 'ref';
    symbolType?: 'function' | 'class' | 'interface';
  } = {}
): void {
  const index = loadIndex(projectRoot);
  if (!index) return;

  let results = index.symbols;

  // 解析查询
  // 支持: def:name, ref:name, class:Name, function:name
  let searchName = query;
  let searchKind: 'def' | 'ref' | undefined = options.type;
  let searchSymbolType = options.symbolType;

  if (query.includes(':')) {
    const [prefix, name] = query.split(':', 2);
    searchName = name;

    if (prefix === 'def') searchKind = 'def';
    else if (prefix === 'ref') searchKind = 'ref';
    else if (prefix === 'class') searchSymbolType = 'class';
    else if (prefix === 'function') searchSymbolType = 'function';
    else if (prefix === 'interface') searchSymbolType = 'interface';
  }

  // 过滤结果
  results = results.filter(s => {
    // 名称匹配（支持部分匹配）
    const nameMatch = s.name.toLowerCase().includes(searchName.toLowerCase());

    // 类型过滤
    const kindMatch = searchKind ? s.kind === searchKind : true;
    const symbolTypeMatch = searchSymbolType ? s.type === searchSymbolType : true;

    return nameMatch && kindMatch && symbolTypeMatch;
  });

  // 去重（相同位置的符号）
  const seen = new Set<string>();
  const unique = results.filter(s => {
    const key = `${s.file}:${s.line}:${s.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 显示结果
  if (unique.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`Found ${unique.length} results:\n`);

  for (const s of unique.slice(0, 20)) { // 最多显示20个
    const kind = s.kind === 'def' ? 'def' : 'ref';
    const icon = s.type === 'function' ? 'ƒ' : s.type === 'class' ? '◎' : s.type === 'interface' ? '▢' : '•';
    console.log(`${icon} ${s.name} (${kind})`);
    console.log(`   ${s.file}:${s.line}:${s.column}`);
  }

  if (unique.length > 20) {
    console.log(`\n... and ${unique.length - 20} more results`);
  }
}
