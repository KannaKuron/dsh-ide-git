/**
 * dsh-ide-git — history date-column format test (issue #26).
 *
 * The column's formatter is pure: it takes an ISO string, a mode and an
 * optional "now", and returns the label the row shows. It is lifted out of the
 * client half the same way tests/graph.test.mjs lifts buildRows, so the test
 * drives the shipped function instead of a re-implementation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'src', 'client.js'), 'utf8')
const hostConfig = readFileSync(join(here, '..', 'src', 'host', 'config.js'), 'utf8')

/** End offset (exclusive) of the function whose body starts at `start`. */
function endOfFunction(text, start) {
  let depth = 0
  for (let index = text.indexOf('{', start); index < text.length; index += 1) {
    const char = text[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  throw new Error('unbalanced braces')
}

function liftedFormatters() {
  const relStart = source.indexOf('function relativeTime(iso) {')
  assert.ok(relStart >= 0, 'relativeTime is gone from the client half')
  const absStart = source.indexOf('function commitDateText(iso, mode, now) {')
  assert.ok(absStart >= 0, 'commitDateText is gone from the client half')
  const slice = source.slice(relStart, endOfFunction(source, absStart))
  return new Function(slice + '; return { relativeTime, commitDateText };')()
}

const { commitDateText } = liftedFormatters()

/** Local-time ISO string, so the expected label does not depend on the TZ. */
const localIso = (year, month, day, hour, minute) => new Date(year, month - 1, day, hour, minute).toISOString()

test('absolute mode keeps the current year short and pads every field', () => {
  const now = new Date(2026, 5, 1)
  assert.equal(commitDateText(localIso(2026, 11, 5, 10, 42), 'absolute', now), '11-05 10:42')
  assert.equal(commitDateText(localIso(2026, 1, 9, 8, 7), 'absolute', now), '01-09 08:07')
})

test('absolute mode names the year only when it differs', () => {
  const now = new Date(2026, 5, 1)
  assert.equal(commitDateText(localIso(2025, 1, 2, 3, 4), 'absolute', now), '2025/01/02 03:04')
  assert.equal(commitDateText(localIso(2027, 12, 31, 23, 59), 'absolute', now), '2027/12/31 23:59')
})

test('relative mode is untouched, and unknown modes fall back to it', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  assert.equal(commitDateText(twoHoursAgo, 'relative'), '2h')
  assert.equal(commitDateText(twoHoursAgo, undefined), '2h')
  assert.equal(commitDateText(twoHoursAgo, 'absolute-ish'), '2h')
})

test('an unreadable timestamp renders as an empty cell, never as "Invalid Date"', () => {
  assert.equal(commitDateText('', 'absolute'), '')
  assert.equal(commitDateText(null, 'absolute'), '')
  assert.equal(commitDateText('not-a-date', 'absolute'), '')
})

test('absolute mode with the default now stays inside the current-year shape', () => {
  assert.match(commitDateText(new Date().toISOString(), 'absolute'), /^\d{2}-\d{2} \d{2}:\d{2}$/)
})

test('the row Config declares dateFormat volatile with the shipped default', () => {
  assert.match(
    hostConfig,
    /shape\.dateFormat = schema\.string\(\)\.default\('relative'\)\.volatile\(\)/,
    'the Host rejects writes for fields the schema does not mark volatile, so dateFormat must be declared',
  )
})

test('the history list wires the format through to the date cell', () => {
  assert.match(source, /commitDateText\(commit\.date, props\.dateFormat\)/)
  assert.match(source, /'data-format': absoluteDate \? 'absolute' : 'relative'/)
  assert.match(source, /dateFormat: readDateFormat\(\)/)
  assert.match(source, /'\.dig-commit-date\[data-format="absolute"\]\{width:116px\}'/)
})

test('the settings card puts the format row in its own history section', () => {
  assert.match(source, /fold\('settings\.history\.title',[\s\S]{0,900}selectRow\(field, 'settings\.date\.label'/)
  assert.match(source, /'settings\.date\.relative'/)
  assert.match(source, /'settings\.date\.absolute'/)
})

test('every dictionary carries the new date-format keys', () => {
  for (const key of ['settings.history.title', 'settings.date.label', 'settings.date.relative', 'settings.date.absolute']) {
    const entries = source.split("'" + key + "': '").length - 1
    assert.equal(entries, 21, key + ' must ship in ZH + EN + every LOCALES entry, saw ' + entries)
  }
})

test('an unreadable timestamp keeps an empty cell and gets no tooltip', () => {
  assert.match(source, /const dateText = commitDateText\(commit\.date, props\.dateFormat\)/)
  assert.match(source, /const dateTitle = dateText === ''/)
  assert.match(source, /title: dateTitle/)
})
