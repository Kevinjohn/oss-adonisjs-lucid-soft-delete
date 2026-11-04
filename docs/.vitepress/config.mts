import { defineConfig } from 'vitepress'
import { githubLinks, repository } from './github_links.mjs'
import { nav, sidebar } from './navigation.mjs'

export default defineConfig({
  title: 'Lucid Soft Deletes',
  description: 'Soft deletes for AdonisJS 7 Lucid models',
  base: '/oss-adonisjs-lucid-soft-delete/',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['maintainers/**'],
  rewrites: { 'README.md': 'index.md', 'reference/README.md': 'reference/index.md' },
  markdown: { config: githubLinks },
  transformPageData(pageData) {
    if (pageData.relativePath.startsWith('reference/api/')) {
      pageData.frontmatter.editLink = false
    }
  },
  themeConfig: {
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: `${repository}/edit/main/docs/:path` },
    nav,
    sidebar,
  },
})
