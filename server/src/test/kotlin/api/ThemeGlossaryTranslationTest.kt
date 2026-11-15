package api

import infra.common.Glossary
import infra.common.ThemeGlossary
import infra.common.ThemeGlossaryRepository
import infra.common.TranslatorId
import infra.web.WebNovel
import infra.web.WebNovelChapter
import infra.web.WebNovelChapterTranslationState
import infra.web.WebNovelTocItem
import infra.web.repository.WebNovelChapterRepository
import infra.web.repository.WebNovelMetadataRepository
import infra.wenku.WenkuChapterGlossary
import infra.wenku.WenkuNovel
import infra.wenku.WenkuNovelLevel
import infra.wenku.datasource.VolumeAccessor
import infra.wenku.repository.WenkuNovelMetadataRepository
import infra.wenku.repository.WenkuNovelVolumeRepository
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.ktor.http.HttpStatusCode
import io.mockk.*
import org.bson.types.ObjectId
import java.nio.file.Path

private const val THEME_ID = "660ab4da55001f583649a621"
private const val SECOND_THEME_ID = "660ab4da55001f583649a622"
private val originalTranslation = listOf("共通初版譯文", "其他譯文")

private data class TaskGlossaries(val current: String, val previous: String?)
private data class PreparedGlossaries(
    val id: String,
    val glossary: Map<String, String>,
    val oldId: String?,
    val oldGlossary: Map<String, String>,
    val oldParagraphs: List<String>?,
)

/** Only persistence/remote I/O is mocked; every tested decision is in the APIs. */
private abstract class TranslationFixture(val translator: TranslatorId) {
    var binding: String? = THEME_ID
    var novelUuid: String? = "novel-v1"
    var own = mapOf("同名" to "小說優先")
    var shared: Map<String, String>? = mapOf("同名" to "主題", "共通" to "初版")
    var themeName = "主題"
    var oldId: String? = "novel-v1"
    var oldGlossary = own
    var oldTranslation: List<String>? = originalTranslation
    var saved: Glossary? = null
    var writes = 0
    val themes = mockk<ThemeGlossaryRepository>()

    init {
        coEvery { themes.get(any()) } coAnswers {
            shared?.let { terms ->
                ThemeGlossary(id = ObjectId(firstArg<String>()), name = themeName,
                    authorId = ObjectId(THEME_ID), glossary = terms)
            }
        }
    }

    abstract suspend fun task(): TaskGlossaries
    abstract suspend fun prepare(): PreparedGlossaries
    abstract suspend fun save(id: String?)

    fun persisted(id: String, terms: Map<String, String>) {
        saved = Glossary(id, terms)
        oldId = id
        oldGlossary = terms
        writes++
    }
}

private class WebTranslationFixture(translator: TranslatorId) : TranslationFixture(translator) {
    val metadata = mockk<WebNovelMetadataRepository>()
    val chapters = mockk<WebNovelChapterRepository>()
    val api = WebNovelTranslateV2Api(metadata, chapters, themes)

    private fun novel() = WebNovel(
        id = ObjectId(THEME_ID), providerId = "syosetu", novelId = "n1234ab",
        titleJp = "小説", authors = emptyList(), points = null, introductionJp = "",
        glossaryUuid = novelUuid, themeGlossaryId = binding, glossary = own,
        toc = listOf(WebNovelTocItem("第一章", null, "1")), jp = 1,
    )

    private fun chapter() = WebNovelChapter(
        providerId = "syosetu", novelId = "n1234ab", chapterId = "1", paragraphs = listOf("共通", "その他"),
        baiduGlossaryUuid = oldId, baiduGlossary = oldGlossary, baiduParagraphs = oldTranslation,
        youdaoGlossaryUuid = oldId, youdaoGlossary = oldGlossary, youdaoParagraphs = oldTranslation,
        gptGlossaryUuid = oldId, gptGlossary = oldGlossary, gptParagraphs = oldTranslation,
        sakuraGlossaryUuid = oldId, sakuraGlossary = oldGlossary, sakuraParagraphs = oldTranslation,
        sakuraVersion = "0.9",
    )

    init {
        coEvery { metadata.get("syosetu", "n1234ab") } coAnswers { novel() }
        coEvery { metadata.getNovelAndSave("syosetu", "n1234ab", 10) } coAnswers { Result.success(novel()) }
        coEvery { chapters.getTranslationOutlines("syosetu", "n1234ab", translator) } coAnswers {
            listOf(WebNovelChapterTranslationState("1", oldId, oldTranslation != null, "0.9"))
        }
        coEvery { chapters.getOrSyncRemote("syosetu", "n1234ab", "1", false) } coAnswers { Result.success(chapter()) }
        coEvery { chapters.get("syosetu", "n1234ab", "1") } coAnswers { chapter() }
        coEvery { chapters.updateTranslation("syosetu", "n1234ab", "1", translator, any(), any()) } coAnswers {
            val glossary = arg<Glossary>(4)
            persisted(glossary.id, glossary.map)
            oldTranslation = arg(5)
            1L
        }
    }

    override suspend fun task(): TaskGlossaries = api.getTranslateTask("syosetu", "n1234ab", translator).let {
        TaskGlossaries(it.glossaryUuid, it.toc.single().glossaryUuid)
    }

    override suspend fun prepare(): PreparedGlossaries = api.getChapterTranslateTask("syosetu", "n1234ab", translator, "1", false).let {
        PreparedGlossaries(it.glossaryId, it.glossary, it.oldGlossaryId, it.oldGlossary, it.oldParagraphZh)
    }

    override suspend fun save(id: String?) {
        api.updateChapterTranslation("syosetu", "n1234ab", "1", translator, id, originalTranslation, "0.9")
    }
}

private class WenkuTranslationFixture(translator: TranslatorId) : TranslationFixture(translator) {
    val metadata = mockk<WenkuNovelMetadataRepository>()
    val volumes = mockk<WenkuNovelVolumeRepository>()
    val volume = mockk<VolumeAccessor>()
    val api = WenkuNovelTranslateV2Api(metadata, volumes, themes)

    private fun novel() = WenkuNovel(
        id = ObjectId(THEME_ID), title = "小説", titleZh = "小說", authors = emptyList(), artists = emptyList(),
        keywords = emptyList(), level = WenkuNovelLevel.轻小说, introduction = "", volumes = emptyList(),
        glossaryUuid = novelUuid, themeGlossaryId = binding, glossary = own, visited = 0,
    )

    init {
        coEvery { metadata.get(THEME_ID) } coAnswers { novel() }
        coEvery { volumes.getVolume(THEME_ID, "volume.txt") } returns volume
        coEvery { volume.listChapter() } returns listOf("1")
        coEvery { volume.translationExist(translator, "1") } coAnswers { oldTranslation != null }
        coEvery { volume.getChapterGlossary(translator, "1") } coAnswers { WenkuChapterGlossary(oldId, oldGlossary, "0.9") }
        coEvery { volume.getChapter("1") } returns listOf("共通", "その他")
        coEvery { volume.getTranslation(translator, "1") } coAnswers { oldTranslation }
        coEvery { volume.setTranslation(translator, "1", any()) } coAnswers {
            oldTranslation = thirdArg()
            Path.of("isolated-volume-translation")
        }
        coEvery { volume.setChapterGlossary(translator, "1", any(), any(), any()) } coAnswers {
            persisted(arg(2), arg(3))
        }
        coEvery { volume.listTranslation(translator) } returns listOf("1")
    }

    override suspend fun task(): TaskGlossaries = api.getTranslateTask(THEME_ID, translator, "volume.txt").let {
        TaskGlossaries(it.glossaryId, it.toc.single().glossaryId)
    }

    override suspend fun prepare(): PreparedGlossaries = api.getChapterTranslateTask(THEME_ID, "volume.txt", translator, "1").let {
        PreparedGlossaries(it.glossaryId, it.glossary, it.oldGlossaryId, it.oldGlossary, it.oldParagraphZh)
    }

    override suspend fun save(id: String?) {
        api.updateChapterTranslation(THEME_ID, translator, "volume.txt", "1", id, originalTranslation, "0.9")
    }
}

class ThemeGlossaryTranslationTest : DescribeSpec({
    val factories: List<Pair<String, (TranslatorId) -> TranslationFixture>> = listOf(
        "Web" to { WebTranslationFixture(it) },
        "Wenku" to { WenkuTranslationFixture(it) },
    )
    factories.forEach { (name, create) ->
        describe(name) {
            it("expires legacy bound chapters, prepares them without ambiguous history and saves the merged snapshot for every translator") {
                TranslatorId.entries.forEach { translator ->
                    val fixture = create(translator)
                    val task = fixture.task()
                    task.current shouldNotBe task.previous
                    val prepared = fixture.prepare()
                    prepared.id shouldBe task.current
                    prepared.oldParagraphs shouldBe null
                    prepared.glossary shouldBe mapOf("同名" to "小說優先", "共通" to "初版")
                    fixture.save(prepared.id)
                    fixture.saved shouldBe Glossary(prepared.id, prepared.glossary)
                    fixture.task() shouldBe TaskGlossaries(task.current, task.current)
                    fixture.prepare().oldParagraphs shouldBe originalTranslation
                    fixture.prepare().oldGlossary shouldBe prepared.glossary
                }
            }

            it("shared edits expire selection and prepare while preserving a complete new history snapshot and rejecting stale uploads") {
                val fixture = create(TranslatorId.Gpt)
                val original = fixture.prepare()
                fixture.save(original.id)
                fixture.shared = fixture.shared!! + ("共通" to "新版")
                val task = fixture.task()
                task.current shouldNotBe task.previous
                val prepared = fixture.prepare()
                prepared.id shouldBe task.current
                prepared.oldId shouldBe original.id
                prepared.oldParagraphs shouldBe originalTranslation
                prepared.oldGlossary["共通"] shouldBe "初版"
                prepared.glossary["共通"] shouldBe "新版"
                // The segment pipeline can reuse unrelated lines by comparing
                // these genuine old/new maps, rather than an incomplete map.
                prepared.oldGlossary.filterKeys { it in "その他" } shouldBe prepared.glossary.filterKeys { it in "その他" }
                prepared.oldGlossary.filterKeys { it in "共通" } shouldNotBe prepared.glossary.filterKeys { it in "共通" }
                shouldThrow<HttpException> { fixture.save(original.id) }.status shouldBe HttpStatusCode.BadRequest
                fixture.writes shouldBe 1
                fixture.save(prepared.id)
                fixture.saved shouldBe Glossary(prepared.id, prepared.glossary)
                fixture.task().previous shouldBe fixture.task().current
            }

            it("deleted shared glossaries fall back to local terms and expire the old shared snapshot") {
                val fixture = create(TranslatorId.Gpt)
                fixture.save(fixture.prepare().id)
                fixture.shared = null
                val task = fixture.task()
                task.current shouldNotBe task.previous
                val prepared = fixture.prepare()
                prepared.id shouldBe task.current
                prepared.glossary shouldBe fixture.own
                prepared.oldGlossary["共通"] shouldBe "初版"
                prepared.oldParagraphs shouldBe originalTranslation
                fixture.save(prepared.id)
                fixture.saved shouldBe Glossary(prepared.id, fixture.own)
            }

            it("rebinding with identical terms invalidates an in-flight upload; unbinding keeps the ordinary UUID") {
                val fixture = create(TranslatorId.Gpt)
                val previous = fixture.prepare()
                fixture.binding = SECOND_THEME_ID
                val rebound = fixture.prepare()
                rebound.id shouldNotBe previous.id
                shouldThrow<HttpException> { fixture.save(previous.id) }.status shouldBe HttpStatusCode.BadRequest
                fixture.writes shouldBe 0
                fixture.save(rebound.id)
                fixture.binding = null
                val unbound = fixture.prepare()
                unbound.id shouldBe "novel-v1"
                unbound.glossary shouldBe fixture.own
                unbound.oldGlossary shouldBe rebound.glossary
                unbound.oldParagraphs shouldBe originalTranslation
                shouldThrow<HttpException> { fixture.save(rebound.id) }.status shouldBe HttpStatusCode.BadRequest
            }

            it("rename, insertion order and overridden shared values do not expire the effective glossary") {
                val fixture = create(TranslatorId.Gpt)
                fixture.save(fixture.prepare().id)
                fixture.themeName = "重新命名"
                fixture.shared = linkedMapOf("共通" to "初版", "同名" to "小說仍覆蓋")
                val task = fixture.task()
                task.current shouldBe task.previous
                fixture.prepare().oldParagraphs shouldBe originalTranslation
            }

            it("unchanged unbound UUID history is reusable; mismatched legacy history is retained on disk but not reused") {
                val fixture = create(TranslatorId.Gpt)
                fixture.binding = null
                fixture.task() shouldBe TaskGlossaries("novel-v1", "novel-v1")
                fixture.prepare().oldParagraphs shouldBe originalTranslation
                fixture.novelUuid = "novel-v2"
                fixture.prepare().oldParagraphs shouldBe null
                fixture.oldTranslation shouldBe originalTranslation
                fixture.writes shouldBe 0
                fixture.save("novel-v2")
                fixture.prepare().oldParagraphs shouldBe originalTranslation
            }

            it("normalizes the no-glossary sentinel without a theme lookup or data rewrite") {
                val fixture = create(TranslatorId.Gpt)
                fixture.binding = null
                fixture.novelUuid = null
                fixture.oldId = null
                fixture.task() shouldBe TaskGlossaries("no glossary", "no glossary")
                fixture.prepare().oldParagraphs shouldBe originalTranslation
                coVerify(exactly = 0) { fixture.themes.get(any()) }
                fixture.writes shouldBe 0
            }
        }
    }
})
