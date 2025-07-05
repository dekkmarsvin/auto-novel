package util

private val kanjiOrKatakana = Regex("[\\p{IsHan}\\p{IsKatakana}]")

fun japaneseTermThreshold(term: String): Int {
    return if (kanjiOrKatakana.containsMatchIn(term)) 3 else 10
}
