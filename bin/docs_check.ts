/*
 * @kevinjohn/lucid-soft-deletes
 *
 * (c) 2026 Kevinjohn Gallagher
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Diagnostic = { file: string; line: number; message: string }
type Example = { target: string; line: number; body: string }
type Markdown = {
  visible: string[]
  examples: Example[]
  errors: { line: number; message: string }[]
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
    for (const match of line.matchAll(/<a\s+(?:id|name)=["']([^"']+)["'][^>]*>/g))
      found.add(match[1])
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/)?.[1]
    if (!heading) continue
    const base = heading
      .toLowerCase()
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
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
    const line = raw.replace(/(`+).*?\1/g, '')
    if (/^ {0,3}\[[^\]]+\]:/.test(line)) continue
    for (const match of line.matchAll(
      /!?\[[^\]]*\]\((<[^>]+>|(?:\\.|[^()\s]|\([^()]*\))+)(?:\s+["'][^"']*["'])?\)/g
    )) {
      output.push({
        target: match[1].replace(/^<|>$/g, '').replace(/\\([()])/g, '$1'),
        line: index + 1,
      })
    }
    for (const match of line.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
      const label = key(match[2] || match[1])
      output.push({
        target: references.get(label) ?? `missing-reference:${label}`,
        line: index + 1,
      })
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
  const read = (path: string) => {
    if (!cache.has(path)) cache.set(path, readFile(path, 'utf8'))
    return cache.get(path)!
  }
  for (const file of selected) {
    const report = (line: number, message: string) => diagnostics.push({ file, line, message })
    let markdown: Markdown
    try {
      markdown = parseMarkdown(await read(resolve(root, file)))
    } catch {
      report(1, `Cannot read Markdown file: ${file}`)
      continue
    }
    for (const error of markdown.errors) report(error.line, error.message)
    for (const link of links(markdown)) {
      if (link.target.startsWith('missing-reference:')) {
        report(link.line, `Missing reference definition: ${link.target.slice(18)}`)
        continue
      }
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link.target)) continue
      try {
        const target = localTarget(root, file, link.target)
        let info
        try {
          info = await stat(target.path)
        } catch {
          throw new Error(`Missing file: ${link.target}`)
        }
        if (!target.fragment) continue
        const targetFile = info.isDirectory() ? resolve(target.path, 'README.md') : target.path
        const content = await read(targetFile)
        const lineAnchor = target.fragment.match(/^L(\d+)(?:-L(\d+))?$/)
        const valid =
          extname(targetFile).toLowerCase() === '.md'
            ? anchors(parseMarkdown(content)).has(target.fragment)
            : lineAnchor &&
              Number(lineAnchor[1]) > 0 &&
              Number(lineAnchor[2] ?? lineAnchor[1]) >= Number(lineAnchor[1]) &&
              Number(lineAnchor[2] ?? lineAnchor[1]) <= content.trimEnd().split(/\r?\n/).length
        if (!valid)
          report(link.line, `Missing anchor: #${target.fragment} in ${relative(root, targetFile)}`)
      } catch (error) {
        report(link.line, (error as Error).message)
      }
    }
    for (const example of markdown.examples) {
      try {
        const target = localTarget(root, file, example.target)
        let source: string
        try {
          source = await read(target.path)
        } catch {
          throw new Error(`Missing source file: ${example.target}`)
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
