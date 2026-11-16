import edge from 'edge.js'
import { softDeleteNavigation } from '#services/soft_delete_navigation'
import { addCollection, edgeIconify } from 'edge-iconify'
import lucideIcons from '@iconify-json/lucide/icons.json' with { type: 'json' }

edge.use(edgeIconify)
addCollection(lucideIcons)

edge.global('softDeleteNavigation', softDeleteNavigation)
