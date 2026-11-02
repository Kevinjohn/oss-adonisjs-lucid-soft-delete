/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { execFileSync } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Diagnostic = { file: string; line: number; message: string }
type Example = { target: string; line: number; body: string }
type Markdown = {
  visible: string[]
  examples: Example[]
  errors: { line: number; message: string }[]
}

class OutsideCheckoutError extends Error {
  constructor(target: string) {
    super(`Link points outside the checkout: ${target}`)
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

function isMissing(error: unknown): boolean {
  return errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR'
}

function filesystemFailure(operation: string, target: string, error: unknown): Error {
  const code = errorCode(error)
  if (!code) throw error
  return new Error(`Cannot ${operation}: ${target} (${code})`, { cause: error })
}

function inside(root: string, path: string): boolean {
  const location = relative(root, path)
  return (
    location === '' ||
    (location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location))
  )
}

/** Resolve symlinks before inspecting a local target and preserve missing suffixes. */
async function physicalTarget(root: string, path: string, target: string): Promise<string> {
  let candidate = resolve(path)
  const suffix: string[] = []
  while (true) {
    try {
      const physical = resolve(await realpath(candidate))
      if (!inside(root, physical)) throw new OutsideCheckoutError(target)
      return resolve(physical, ...suffix.reverse())
    } catch (error) {
      if (!isMissing(error)) throw error
      const parent = dirname(candidate)
      if (parent === candidate) throw error
      suffix.push(candidate.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
      candidate = parent
    }
  }
}

/** Retain line numbers while excluding fenced code from Markdown interpretation. */
function parseMarkdown(contents: string): Markdown {
  const result: Markdown = { visible: [], examples: [], errors: [] }
  let source: { target: string; line: number } | undefined
  let fence: { character: string; length: number; body: string[] } | undefined
  const lines = contents.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    result.visible.push('')
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`).test(line)) {
        if (source) result.examples.push({ ...source, body: fence.body.join('\n') })
        source = undefined
        fence = undefined
      } else fence.body.push(line)
      continue
    }
    const marker = line.match(/^\s*<!-- source: (\S+) -->\s*$/)
    if (marker) {
      if (source)
        result.errors.push({
          line: source.line,
          message: 'Source marker requires a following code fence',
        })
      source = { target: marker[1], line: index + 1 }
      continue
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (opening) {
      fence = { character: opening[1][0], length: opening[1].length, body: [] }
      continue
    }
    if (source && line.trim()) {
      result.errors.push({
        line: source.line,
        message: 'Source marker requires a following code fence',
      })
      source = undefined
    }
    result.visible[index] = line
  }
  if (source)
    result.errors.push({ line: source.line, message: 'Source marker requires a closed code fence' })
  return result
}

function anchors(markdown: Markdown): Set<string> {
  const found = new Set<string>()
  for (const line of markdown.visible) {
    for (const match of line
      .replace(/(`+).*?\1/g, '')
      .matchAll(/<a\s+(?:id|name)=["']([^"']+)["'][^>]*>/g))
      found.add(match[1])
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/)?.[1]
    if (!heading) continue
    const base = heading
      .toLowerCase()
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(
        /(`+)(.*?)\1|<[^>]+>|(?<![\p{L}\p{N}])_{1,2}([^_]+)_{1,2}(?![\p{L}\p{N}])/gu,
        (
          _match,
          ticks: string | undefined,
          code: string | undefined,
          emphasis: string | undefined
        ) => (ticks ? code! : (emphasis ?? ''))
      )
      .replace(/[`*~]/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-')
    let name = base
    let suffix = 0
    while (found.has(name)) name = `${base}-${++suffix}`
    found.add(name)
  }
  return found
}

function localTarget(
  root: string,
  file: string,
  target: string
): { path: string; fragment: string } {
  const [pathname, ...fragments] = target.split('#')
  let path: string
  let fragment: string
  try {
    path = pathname
      ? resolve(dirname(resolve(root, file)), decodeURIComponent(pathname))
      : resolve(root, file)
    fragment = decodeURIComponent(fragments.join('#'))
  } catch {
    throw new Error(`Invalid URL encoding: ${target}`)
  }
  const location = relative(resolve(root), path)
  if (location === '..' || location.startsWith(`..${sep}`))
    throw new Error(`Link points outside the checkout: ${target}`)
  return { path, fragment }
}

function links(markdown: Markdown): { target: string; line: number }[] {
  const references = new Map<string, string>()
  const output: { target: string; line: number }[] = []
  const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  for (const line of markdown.visible) {
    const definition = line.match(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/)
    if (definition) references.set(key(definition[1]), definition[2].replace(/^<|>$/g, ''))
  }
  for (const [index, raw] of markdown.visible.entries()) {
    const code = [...raw.matchAll(/(`+).*?\1/g)]
    const inCode = (offset: number) =>
      code.some((match) => offset >= match.index! && offset < match.index! + match[0].length)
    const line = raw.replace(/(`+).*?\1/g, (match) => ' '.repeat(match.length))
    if (/^ {0,3}\[[^\]]+\]:/.test(line)) continue
    for (const match of line.matchAll(
      /!?\[[^\]]*\]\((<[^>]+>|(?:\\.|[^()\s]|\([^()]*\))+)(?:\s+["'][^"']*["'])?\)/g
    )) {
      output.push({
        target: match[1].replace(/^<|>$/g, '').replace(/\\([()])/g, '$1'),
        line: index + 1,
      })
    }
    for (const match of raw.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
      if (inCode(match.index!)) continue
      const label = key(match[2] || match[1])
      output.push({
        target: references.get(label) ?? `missing-reference:${label}`,
        line: index + 1,
      })
    }
    for (const match of raw.matchAll(/!?\[([^\]]+)\](?![\[(])/g)) {
      if (inCode(match.index!) || raw[match.index! - 1] === ']') continue
      const target = references.get(key(match[1]))
      if (target) output.push({ target, line: index + 1 })
    }
  }
  return output
}

/** Check local links, GitHub-style ATX heading anchors, and marked source-region examples. */
export async function checkDocumentation(root: string, files?: string[]): Promise<Diagnostic[]> {
  const selected =
    files ??
    [
      ...new Set(
        execFileSync(
          'git',
          ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'],
          { cwd: root, encoding: 'utf8' }
        )
          .split('\0')
          .filter(Boolean)
      ),
    ].sort()
  const diagnostics: Diagnostic[] = []
  const cache = new Map<string, Promise<string>>()
  let canonicalRoot: string
  try {
    canonicalRoot = resolve(await realpath(root))
  } catch (error) {
    throw filesystemFailure('resolve checkout root', root, error)
  }
  const read = (path: string) => {
    if (!cache.has(path)) cache.set(path, readFile(path, 'utf8'))
    return cache.get(path)!
  }
  for (const file of selected) {
    const report = (line: number, message: string) => diagnostics.push({ file, line, message })
    let markdown: Markdown
    let contents: string
    try {
      const physicalPath = await physicalTarget(canonicalRoot, resolve(root, file), file)
      contents = await read(physicalPath)
    } catch (error) {
      if (error instanceof OutsideCheckoutError) report(1, error.message)
      else if (isMissing(error)) report(1, `Cannot read Markdown file: ${file}`)
      else report(1, filesystemFailure('read Markdown file', file, error).message)
      continue
    }
    markdown = parseMarkdown(contents)
    for (const error of markdown.errors) report(error.line, error.message)
    for (const link of links(markdown)) {
      if (link.target.startsWith('missing-reference:')) {
        report(link.line, `Missing reference definition: ${link.target.slice(18)}`)
        continue
      }
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link.target)) continue
      try {
        const target = localTarget(root, file, link.target)
        const physicalPath = await physicalTarget(canonicalRoot, target.path, link.target)
        let info
        try {
          info = await stat(physicalPath)
        } catch (error) {
          if (isMissing(error)) throw new Error(`Missing file: ${link.target}`)
          throw filesystemFailure('inspect file', link.target, error)
        }
        if (!target.fragment) continue
        const logicalTargetFile = info.isDirectory()
          ? resolve(target.path, 'README.md')
          : target.path
        const targetFile = info.isDirectory()
          ? await physicalTarget(canonicalRoot, resolve(physicalPath, 'README.md'), link.target)
          : physicalPath
        let content: string
        try {
          content = await read(targetFile)
        } catch (error) {
          if (isMissing(error)) throw new Error(`Missing file: ${link.target}`)
          throw filesystemFailure('read file', link.target, error)
        }
        const lineAnchor = target.fragment.match(/^L(\d+)(?:-L(\d+))?$/)
        const valid =
          extname(logicalTargetFile).toLowerCase() === '.md'
            ? anchors(parseMarkdown(content)).has(target.fragment)
            : lineAnchor &&
              Number(lineAnchor[1]) > 0 &&
              Number(lineAnchor[2] ?? lineAnchor[1]) >= Number(lineAnchor[1]) &&
              Number(lineAnchor[2] ?? lineAnchor[1]) <=
                content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0)
        if (!valid)
          report(
            link.line,
            `Missing anchor: #${target.fragment} in ${relative(canonicalRoot, targetFile)}`
          )
      } catch (error) {
        report(link.line, (error as Error).message)
      }
    }
    for (const example of markdown.examples) {
      try {
        const target = localTarget(root, file, example.target)
        const physicalPath = await physicalTarget(canonicalRoot, target.path, example.target)
        let source: string
        try {
          source = await read(physicalPath)
        } catch (error) {
          if (isMissing(error)) throw new Error(`Missing source file: ${example.target}`)
          throw filesystemFailure('read source file', example.target, error)
        }
        const lines = source.split(/\r?\n/)
        const start = lines.findIndex((line) => line.trim() === `// #region ${target.fragment}`)
        const end = lines.findIndex(
          (line, index) => index > start && line.trim() === `// #endregion ${target.fragment}`
        )
        if (!target.fragment || start < 0 || end < 0)
          throw new Error(`Missing source region: ${example.target}`)
        if (
          lines
            .slice(start + 1, end)
            .join('\n')
            .trim() !== example.body.trim()
        )
          report(example.line, `Source example differs: ${example.target}`)
      } catch (error) {
        report(example.line, (error as Error).message)
      }
    }
  }
  return diagnostics
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const diagnostics = await checkDocumentation(
    root,
    process.argv.length > 2 ? process.argv.slice(2) : undefined
  )
  for (const diagnostic of diagnostics)
    console.error(`${diagnostic.file}:${diagnostic.line}: ${diagnostic.message}`)
  if (diagnostics.length) process.exitCode = 1
  else console.log('Documentation checks passed (local links, heading anchors and source examples)')
}
