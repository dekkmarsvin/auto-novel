package infra.provider.providers

import infra.web.WebNovelAttention
import infra.web.datasource.providers.Nailain
import infra.web.datasource.providers.NovelAccessDeniedException
import infra.web.datasource.providers.WebNovelProviderException
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.cookies.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.datetime.Instant

private const val SOURCE_URL = "https://nailain.alwaysdata.net"
private const val POST_URL = "$SOURCE_URL/api/posts/mock-id"
private const val POST_JSON = """{"title":"Mock archive title","category":"fiction","tags":["tag"],"characters":12,"date":"20261001","body":"first\nsecond"}"""

private fun offlineClient(engine: MockEngine) = HttpClient(engine) {
    expectSuccess = true
    install(ContentNegotiation) { json() }
    install(HttpCookies)
}

class NailainOfflineTest : DescribeSpec({
    it("maps metadata and chapters, reuses cookies and reads a new password after session expiry") {
        var password = "mock-first"
        var sourceSession = "mock-session-1"
        var supplierReads = 0
        val submitted = mutableListOf<String>()
        val client = offlineClient(MockEngine { request ->
            if (request.url.encodedPath == "/login") {
                request.url.toString() shouldBe "$SOURCE_URL/login"
                request.method shouldBe HttpMethod.Post
                val form = parseQueryString(request.body.toByteArray().decodeToString())
                form["password"] shouldBe password
                form["next"] shouldBe "/"
                submitted.add(form["password"]!!)
                respond("", HttpStatusCode.SeeOther, headersOf(HttpHeaders.SetCookie, "na_session=$sourceSession; Path=/; HttpOnly"))
            } else {
                request.url.toString() shouldBe POST_URL
                request.method shouldBe HttpMethod.Get
                if (request.headers[HttpHeaders.Cookie]?.contains("na_session=$sourceSession") != true) {
                    respond("", HttpStatusCode.Unauthorized)
                } else {
                    respond(POST_JSON, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
            }
        })
        try {
            val provider = Nailain(client) { supplierReads++; password }
            val metadata = provider.getMetadata("mock-id")
            metadata.title shouldBe "Mock archive title"
            metadata.keywords shouldBe listOf("fiction", "tag")
            metadata.totalCharacters shouldBe 12
            metadata.attentions shouldBe listOf(WebNovelAttention.R18)
            metadata.toc.size shouldBe 1
            metadata.toc.single().title shouldBe metadata.title
            metadata.toc.single().chapterId shouldBe "default"
            metadata.toc.single().createAt shouldBe Instant.parse("2026-09-30T15:00:00Z")
            provider.getChapter("mock-id", "default").paragraphs shouldBe listOf("first", "second")

            password = "mock-second"
            provider.getChapter("mock-id", "default").paragraphs shouldBe listOf("first", "second")
            supplierReads shouldBe 1 // Changing the setting does not revoke a source session.
            sourceSession = "mock-session-2"
            provider.getChapter("mock-id", "default").paragraphs shouldBe listOf("first", "second")
            supplierReads shouldBe 2
            submitted shouldBe listOf("mock-first", "mock-second")
        } finally {
            client.close()
        }
    }

    listOf("missing", "wrong", "unauthorized retry", "login error").forEach { scenario ->
        it("offline $scenario stops after one login and at most one retry") {
            var calls = 0
            var logins = 0
            val client = offlineClient(MockEngine { request ->
                calls++
                if (request.url.encodedPath == "/login") {
                    request.url.toString() shouldBe "$SOURCE_URL/login"
                    request.method shouldBe HttpMethod.Post
                    val form = parseQueryString(request.body.toByteArray().decodeToString())
                    form["password"] shouldBe "mock-password"
                    form["next"] shouldBe "/"
                    logins++
                    respond("", when (scenario) {
                        "wrong" -> HttpStatusCode.Unauthorized
                        "login error" -> HttpStatusCode.InternalServerError
                        else -> HttpStatusCode.SeeOther
                    })
                } else {
                    request.url.toString() shouldBe POST_URL
                    request.method shouldBe HttpMethod.Get
                    respond("", HttpStatusCode.Unauthorized)
                }
            })
            try {
                val provider = Nailain(client) { if (scenario == "missing") null else "mock-password" }
                when (scenario) {
                    "missing" -> shouldThrow<NovelAccessDeniedException> { provider.getChapter("mock-id", "default") }
                    "wrong" -> shouldThrow<WebNovelProviderException> { provider.getChapter("mock-id", "default") }
                        .message!! shouldContain "合言葉错误"
                    "login error" -> shouldThrow<WebNovelProviderException> { provider.getChapter("mock-id", "default") }
                        .message!! shouldContain "登录失败"
                    else -> shouldThrow<ClientRequestException> { provider.getChapter("mock-id", "default") }
                        .response.status shouldBe HttpStatusCode.Unauthorized
                }
                logins shouldBe if (scenario == "missing") 0 else 1
                calls shouldBe when (scenario) { "missing" -> 1; "unauthorized retry" -> 3; else -> 2 }
            } finally {
                client.close()
            }
        }
    }
})
