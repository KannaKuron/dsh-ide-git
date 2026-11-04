/** dsh-ide-git host: row Config (rail switches + commit-message settings). */

/* Row Config = the plugin's only settings surface on dsh >= 0.2.2-rc.1: the host
   persists these values under the loader row id ('ide-git', see cordis.patch.yml)
   and the browser reads them through ctx.configForms, so the Plugins-panel bundle
   card and the action rail read ONE document. The rail's edit is one switch per
   action (`railRefresh` … `railPush`); a missing field means "default" (the action
   is shown), which keeps an action added by a later version visible in an existing
   profile.
   `@deepseek-ai/schemastery` is resolved LAZILY: a static peer import would make
   the Loader silently skip the whole row when the package is not resolvable, so
   the failure degrades to an unvalidated Config instead. */
let Schema = null
try {
  Schema = (await import('@deepseek-ai/schemastery')).default
} catch (error) {
  console.warn('[dsh-ide-git] @deepseek-ai/schemastery is not resolvable here; the row Config is passed through unvalidated: '
    + (error && error.message ? error.message : String(error)))
}

/** Rail action ids, in rail order. MUST mirror RAIL_SPECS in src/client.js. */
const RAIL_CONFIG_IDS = [
  'refresh', 'tree', 'worktrees', 'float', 'split', 'fullscreen', 'newBranch', 'checkout', 'delete',
  'compare', 'diff', 'stash', 'tag', 'favorite', 'fetch', 'pull', 'push',
]

function railConfigSchema(schema) {
  const shape = {}
  for (const id of RAIL_CONFIG_IDS) {
    shape['rail' + id.charAt(0).toUpperCase() + id.slice(1)] = schema.boolean().default(true).volatile()
  }
  /* The action rail's order, comma-separated. Empty means the code order; the
     plugin validates, de-duplicates and backfills any action a later version
     adds, so an old document never hides a new button. */
  shape.railOrder = schema.string().default('').volatile()
  /* AI commit message (issue #6), the three settings the user asked for. Empty
     string means "follow whatever the session is using" / "no extra prompt", so
     an untouched profile behaves exactly like the feature's default. */
  shape.commitModel = schema.string().default('').volatile()
  shape.commitReasoning = schema.string().default('').volatile()
  shape.commitPrompt = schema.string().default('').volatile()
  /* Conversation-area view tab (issue #8): on by default, switchable off from
     the plugin settings card. false means "do not register the
     conversation.view seat at all" — the sidebar and dock seats are not
     affected; a missing field means the default (shown). */
  shape.conversationTab = schema.boolean().default(true).volatile()
  /* Immersive conversation seat (issue #8 round 3): on by default. false means
     the seat falls back to the pin-to-scrollport layout with a visible
     composer; a missing field means the default (on). NOTE: the field MUST be
     declared here — the Host rejects row-Config writes for paths the schema
     does not mark volatile ("Config field … is not volatile"), and the settings
     switch then rolls back silently. */
  shape.immersive = schema.boolean().default(true).volatile()
  /* Composer status pill (v0.19.0): the settings card's "输入框 Git 状态" switch
     and the pill itself read this field. v0.19.0-v0.19.6 shipped the switch and
     the reader WITHOUT this declaration, so the Host rejected every write with
     `Config field "composerStatus" is not volatile` — the card rolled the switch
     back and said "设置没写进去". Any new row-Config field the client writes MUST
     be declared (and volatile) here, or the write is refused before it lands. */
  shape.composerStatus = schema.boolean().default(true).volatile()
  /* Inline diff preview (issue #22): ON by default so the panel's own diff
     pane — with its split / wrap switches — stays reachable even when
     dsh-better-sidebar or the native preview seat is installed. OFF hands the
     preview back to those external tabs, exactly the pre-0.23 behaviour. */
  shape.inlineDiff = schema.boolean().default(true).volatile()
  return schema.object(shape)
}

export const Config = Schema === null ? undefined : railConfigSchema(Schema)
