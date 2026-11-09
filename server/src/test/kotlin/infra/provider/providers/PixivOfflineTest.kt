package infra.provider.providers

import infra.web.datasource.providers.Pixiv
import infra.web.WebNovelType
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.datetime.Instant

private fun pixivClient(engine: MockEngine) = HttpClient(engine) {
    install(ContentNegotiation) { json() }
}

class PixivOfflineTest : DescribeSpec({
    it("maps single-chapter creation time without requiring a live Pixiv session") {
        val client = pixivClient(MockEngine { request ->
            request.url.encodedPath shouldBe "/ajax/novel/123"
            respond("""{"body":{"title":"Single","userName":"Author","userId":"7","seriesNavData":null,"tags":{"tags":[]},"xRestrict":0,"characterCount":10,"description":"Intro","createDate":"2026-10-19T09:00:00+09:00"}}""", headers = headersOf(HttpHeaders.ContentType, "application/json"))
        })
        try {
            val chapter = Pixiv(client).getMetadata("s123").toc.single()
            chapter.chapterId shouldBe "123"
            chapter.createAt shouldBe Instant.parse("2026-10-19T00:00:00Z")
        } finally { client.close() }
    }
    it("uses series timestamps while retaining hidden chapter placeholders and missing dates") {
        val client = pixivClient(MockEngine { request ->
            val body = when (request.url.encodedPath) {
                "/ajax/novel/series/9" -> """{"title":"Series","userName":"Author","userId":"7","xRestrict":0,"publishedTotalCharacterCount":30,"caption":"Intro","tags":["tag"],"total":4}"""
                "/ajax/novel/series_content/9" -> {
                    request.url.parameters["limit"] shouldBe "30"
                    request.url.parameters["last_order"] shouldBe "0"
                    """{"page":{"seriesContents":[
                      {"series":{"viewableType":0},"title":"Date","id":"1","createDate":"2026-10-19T09:00:00+09:00","uploadTimestamp":1},
                      {"series":{"viewableType":1}},
                      {"series":{"viewableType":0},"title":"Timestamp","id":"3","uploadTimestamp":1792454400},
                      {"series":{"viewableType":0},"title":"No date","id":"4"}
                    ]}}"""
                }
                else -> error("Unexpected Pixiv request: ${request.url.encodedPath}")
            }
            respond("""{"body":$body}""", headers = headersOf(HttpHeaders.ContentType, "application/json"))
        })
        try {
            val toc = Pixiv(client).getMetadata("9").toc
            toc.map { it.chapterId } shouldBe listOf("1", null, "3", "4")
            toc.map { it.createAt } shouldBe listOf(Instant.parse("2026-10-19T00:00:00Z"), null, Instant.parse("2026-10-20T00:00:00Z"), null)
            toc[1].title shouldBe "-----"
        } finally { client.close() }
    }

    listOf(
        true to WebNovelType.已完结,
        false to WebNovelType.连载中,
        null to WebNovelType.连载中,
    ).forEach { (concluded, expectedType) ->
        it("maps series completion $concluded and preserves every chapter across pages") {
            val pageStarts = mutableListOf<Int>()
            val concludedField = concluded?.let { """, "isConcluded":$it""" }.orEmpty()
            val client = pixivClient(MockEngine { request ->
                val body = when (request.url.encodedPath) {
                    "/ajax/novel/series/31" ->
                        """{"title":"Series","userName":"Author","userId":"7","xRestrict":0,"publishedTotalCharacterCount":31,"caption":"Intro","tags":[],"total":31$concludedField}"""
                    "/ajax/novel/series_content/31" -> {
                        request.url.parameters["limit"] shouldBe "30"
                        val start = request.url.parameters["last_order"]!!.toInt()
                        pageStarts.add(start)
                        val entries = (start until minOf(start + 30, 31)).joinToString(",") { index ->
                            val dateField = when (index) {
                                0 -> """, "createDate":"2026-10-19T09:00:00+09:00", "uploadTimestamp":1"""
                                1 -> """, "uploadTimestamp":1792454400"""
                                else -> ""
                            }
                            """{"series":{"viewableType":0},"title":"Chapter ${index + 1}","id":"${index + 1}","tags":["tag"]$dateField}"""
                        }
                        """{"page":{"seriesContents":[$entries]}}"""
                    }
                    else -> error("Unexpected Pixiv request: ${request.url}")
                }
                respond("""{"body":$body}""", headers = headersOf(HttpHeaders.ContentType, "application/json"))
            })
            try {
                val metadata = Pixiv(client).getMetadata("31")
                metadata.type shouldBe expectedType
                metadata.keywords shouldBe listOf("tag")
                pageStarts shouldBe listOf(0, 30)
                metadata.toc.map { it.chapterId } shouldBe (1..31).map { it.toString() }
                metadata.toc.take(3).map { it.createAt } shouldBe listOf(
                    Instant.parse("2026-10-19T00:00:00Z"),
                    Instant.parse("2026-10-20T00:00:00Z"),
                    null,
                )
            } finally { client.close() }
        }
    }
})
