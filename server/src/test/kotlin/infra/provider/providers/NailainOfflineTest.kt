package infra.provider.providers

import infra.web.datasource.providers.Nailain
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.kotest.assertions.throwables.shouldThrowAny
import io.ktor.client.*
import io.ktor.client.engine.mock.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.cookies.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*

class NailainOfflineTest : DescribeSpec({
    it("reads the latest supplier value only when a fresh login is required") {
        var value = "mock-first"
        var authorized = false
        val submitted = mutableListOf<String>()
        val client = HttpClient(MockEngine { request ->
            if (request.method == HttpMethod.Post) {
                submitted.add(request.body.toByteArray().decodeToString())
                authorized = true
                respond("", HttpStatusCode.SeeOther, headersOf(HttpHeaders.SetCookie, "na_session=mock-session; Path=/"))
            } else if (!authorized) respond("", HttpStatusCode.Unauthorized)
            else respond("""{"body":"mock-body"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }) {
            expectSuccess = true
            install(ContentNegotiation) { json() }
            install(HttpCookies)
        }
        try {
            val provider = Nailain(client) { value }
            provider.getChapter("mock-id", "default")
            value = "mock-second"
            provider.getChapter("mock-id", "default")
            submitted.size shouldBe 1
            authorized = false
            provider.getChapter("mock-id", "default")
            submitted shouldBe listOf("password=mock-first&next=%2F", "password=mock-second&next=%2F")
        } finally { client.close() }
    }
    listOf("success", "missing", "wrong", "unauthorized retry", "login error").forEach { scenario ->
        it("offline $scenario uses at most one login and one retry") {
            var calls = 0
            var logins = 0
            var supplierReads = 0
            var suppliedPassword: String? = if (scenario == "missing") null else "mock-password"
            val engine = MockEngine { request ->
                calls++
                if (request.url.encodedPath == "/login") {
                    logins++
                    request.method shouldBe HttpMethod.Post
                    request.body.toByteArray().decodeToString() shouldBe "password=mock-password&next=%2F"
                    respond("", when (scenario) {
                        "wrong" -> HttpStatusCode.Unauthorized
                        "login error" -> HttpStatusCode.InternalServerError
                        else -> HttpStatusCode.SeeOther
                    }, headersOf(HttpHeaders.SetCookie, "na_session=mock-session; Path=/; HttpOnly"))
                } else if (request.headers[HttpHeaders.Cookie]?.contains("na_session=mock-session") != true || scenario == "unauthorized retry") {
                    respond("", HttpStatusCode.Unauthorized)
                } else {
                    respond("""{"body":"first\nsecond"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
            }
            val client = HttpClient(engine) {
                expectSuccess = true
                install(ContentNegotiation) { json() }
                install(HttpCookies)
            }
            try {
                val provider = Nailain(client) { supplierReads++; suppliedPassword }
                if (scenario == "success") {
                    provider.getChapter("mock-id", "default").paragraphs shouldBe listOf("first", "second")
                    suppliedPassword = null
                    provider.getChapter("mock-id", "default").paragraphs shouldBe listOf("first", "second")
                    supplierReads shouldBe 1 // A setting change does not revoke an existing cookie.
                } else shouldThrowAny { provider.getChapter("mock-id", "default") }
                logins shouldBe if (scenario == "missing") 0 else 1
                calls shouldBe when (scenario) { "missing" -> 1; "success" -> 4; "unauthorized retry" -> 3; else -> 2 }
            } finally { client.close() }
        }
    }
})
