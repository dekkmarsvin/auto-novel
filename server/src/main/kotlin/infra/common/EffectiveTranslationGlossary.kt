package infra.common

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.security.MessageDigest

private const val THEME_TOKEN_PREFIX = "theme-v1:"

/** A read-time version: shared edits never require rewriting bound novels. */
fun effectiveTranslationGlossary(
    novelUuid: String?,
    novelGlossary: Map<String, String>,
    themeGlossaryId: String?,
    themeGlossary: Map<String, String>,
): Glossary {
    val novelToken = novelUuid ?: "no glossary"
    if (themeGlossaryId == null) return Glossary(novelToken, novelGlossary)

    // Novel-specific entries win. Hash the resulting content, not timestamps,
    // names or overridden shared values; insertion order must not matter.
    val merged = themeGlossary + novelGlossary
    val bytes = ByteArrayOutputStream().also { buffer ->
        DataOutputStream(buffer).use { output ->
            fun text(value: String) {
                val encoded = value.toByteArray(Charsets.UTF_8)
                output.writeInt(encoded.size)
                output.write(encoded)
            }
            text(novelToken)
            text(themeGlossaryId)
            output.writeInt(merged.size)
            merged.toSortedMap().forEach { (key, value) ->
                text(key)
                text(value)
            }
        }
    }.toByteArray()
    val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        .joinToString("") { "%02x".format(it) }
    return Glossary(THEME_TOKEN_PREFIX + digest, merged)
}

/**
 * Legacy chapter snapshots omitted shared terms. If their version changed, we
 * cannot distinguish a former binding from an ordinary glossary edit, so do not
 * offer that ambiguous paragraph history to the segment-reuse pipeline. Stored
 * translations and segment caches remain intact. Same-version unbound history
 * is unchanged; new themed snapshots contain the full merged map and can be
 * compared across versions to reuse unaffected segments.
 */
fun canReuseTranslationHistory(oldId: String?, currentId: String): Boolean =
    (oldId ?: "no glossary") == currentId || oldId?.startsWith(THEME_TOKEN_PREFIX) == true
