package infra.common

import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe

class EffectiveTranslationGlossaryTest : DescribeSpec({
    it("keeps unbound UUIDs and the no-glossary sentinel unchanged") {
        effectiveTranslationGlossary("novel-v1", mapOf("私有" to "小說"), null, emptyMap()) shouldBe
            Glossary("novel-v1", mapOf("私有" to "小說"))
        effectiveTranslationGlossary(null, emptyMap(), null, emptyMap()).id shouldBe "no glossary"
    }

    it("versions effective shared content with novel-specific precedence") {
        val own = mapOf("同名" to "小說優先")
        val shared = mapOf("同名" to "主題", "共通" to "初版")
        val initial = effectiveTranslationGlossary("v1", own, "theme", shared)
        initial.map shouldBe mapOf("同名" to "小說優先", "共通" to "初版")
        initial.id shouldNotBe effectiveTranslationGlossary("v1", own, "theme", shared + ("共通" to "新版")).id
        initial.id shouldBe effectiveTranslationGlossary("v1", own, "theme", shared + ("同名" to "被覆蓋的新值")).id
    }

    it("ignores insertion order and frames Unicode keys and values unambiguously") {
        val first = effectiveTranslationGlossary("v1", linkedMapOf("乙" to "小說乙", "甲" to "小說甲"), "theme", linkedMapOf("人🐎" to "讀者", "共通" to "共用"))
        val reordered = effectiveTranslationGlossary("v1", linkedMapOf("甲" to "小說甲", "乙" to "小說乙"), "theme", linkedMapOf("共通" to "共用", "人🐎" to "讀者"))
        first.id shouldBe reordered.id
        effectiveTranslationGlossary("v1", emptyMap(), "theme", mapOf("a" to "bc")).id shouldNotBe
            effectiveTranslationGlossary("v1", emptyMap(), "theme", mapOf("ab" to "c")).id
    }

    it("versions rebinding, deletion and local versions without database fanout") {
        val own = mapOf("私有" to "保留")
        val initial = effectiveTranslationGlossary("v1", own, "theme-a", mapOf("共通" to "主題"))
        initial.id shouldNotBe effectiveTranslationGlossary("v1", own, "theme-b", mapOf("共通" to "主題")).id
        initial.id shouldNotBe effectiveTranslationGlossary("v1", own, "theme-a", emptyMap()).id
        initial.id shouldNotBe effectiveTranslationGlossary("v2", own, "theme-a", mapOf("共通" to "主題")).id
        effectiveTranslationGlossary("v1", own, "theme-a", emptyMap()).map shouldBe own
    }

    it("reuses same-version unbound history but excludes ambiguous legacy versions") {
        canReuseTranslationHistory("v1", "v1") shouldBe true
        canReuseTranslationHistory(null, "no glossary") shouldBe true
        canReuseTranslationHistory("v1", "v2") shouldBe false
        canReuseTranslationHistory("v1", "theme-v1:new") shouldBe false
    }

    it("allows full new themed snapshots to be compared after edits or unbinding") {
        canReuseTranslationHistory("theme-v1:old", "theme-v1:new") shouldBe true
        canReuseTranslationHistory("theme-v1:old", "v2") shouldBe true
    }
})
