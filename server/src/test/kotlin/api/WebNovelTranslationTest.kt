package api

import api.plugins.User
import api.plugins.UserRole
import infra.web.WebNovel
import infra.web.WebNovelTocItem
import infra.web.repository.WebNovelMetadataRepository
import infra.web.repository.WebNovelOplogRepository
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.mockk.*
import kotlinx.datetime.Instant
import org.bson.types.ObjectId

private suspend fun submittedToc(payload: Map<String, String>): Map<Int, String?> {
    val metadata = mockk<WebNovelMetadataRepository>()
    val oplog = mockk<WebNovelOplogRepository>(relaxed = true)
    val novel = WebNovel(
        id = ObjectId(), providerId = "pixiv", novelId = "series",
        titleJp = "Novel", authors = emptyList(), points = null, introductionJp = "",
        toc = listOf(
            WebNovelTocItem("同名", "舊一", "id-1"),
            WebNovelTocItem("同名", "舊二", "id-2"),
            WebNovelTocItem("分組", null, null),
        ),
    )
    val written = slot<Map<Int, String?>>()
    coEvery { metadata.get("pixiv", "series") } returns novel
    coEvery { metadata.updateTranslation("pixiv", "series", null, null, capture(written)) } just Runs
    val service = WebNovelApi(
        metadataRepo = metadata, chapterRepo = mockk(), fileRepo = mockk(),
        favoredRepo = mockk(), historyRepo = mockk(), oplogRepo = oplog,
        wenkuMetadataRepo = mockk(), operationHistoryRepo = mockk(),
    )
    service.updateMetadataTranslation(
        user = User("test-user", "tester", UserRole.Admin, Instant.parse("2000-01-01T00:00:00Z")),
        providerId = "pixiv", novelId = "series", title = "", introduction = "", toc = payload,
    )
    coVerify(exactly = 1) { metadata.updateTranslation("pixiv", "series", null, null, any()) }
    return written.captured
}

class WebNovelTranslationTest : DescribeSpec({
    it("updates same-named chapters independently by ID, before legacy title keys") {
        submittedToc(mapOf("id-1" to "第一譯名", "id-2" to "第二譯名", "同名" to "舊客戶端譯名", "分組" to "分組譯名")) shouldBe
            mapOf(0 to "第一譯名", 1 to "第二譯名", 2 to "分組譯名")
    }
    it("accepts old title-keyed requests from cached clients") {
        submittedToc(mapOf("同名" to "舊客戶端譯名")) shouldBe mapOf(0 to "舊客戶端譯名", 1 to "舊客戶端譯名")
    }
    it("allows an explicit blank ID translation and ignores unrelated keys") {
        submittedToc(mapOf("id-1" to "", "unrelated" to "其他譯名")) shouldBe mapOf(0 to "")
    }
})
