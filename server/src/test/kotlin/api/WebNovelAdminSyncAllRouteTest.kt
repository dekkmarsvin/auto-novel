package api

import api.plugins.authentication
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import infra.web.WebNovel
import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.resources.Resources
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import org.bson.types.ObjectId
import java.time.Instant

private const val TEST_SECRET = "isolated-sync-route-test-secret"
private const val SYNC_URL = "/novel/admin/sync-all"

private fun token(
    role: String? = "admin",
    secret: String = TEST_SECRET,
    expiresAt: Instant = Instant.now().plusSeconds(60),
): String {
    val builder = JWT.create()
        .withSubject("isolated-sync-test-user")
        .withClaim("crat", 1_700_000_000L)
        .withExpiresAt(expiresAt)
    if (role != null) builder.withClaim("role", role)
    return builder.sign(Algorithm.HMAC256(secret))
}

private fun novel(id: String) = WebNovel(
    id = ObjectId(),
    providerId = "syosetu",
    novelId = id,
    titleJp = "Test novel $id",
    authors = emptyList(),
    points = null,
    introductionJp = "",
    toc = emptyList(),
)

private class IndexStub(
    val novels: List<WebNovel> = listOf(novel("n1"), novel("n2")),
    val failure: Exception? = null,
    val scanFailure: Exception? = null,
) {
    var scans = 0
    var indexAttempts = 0
    val indexedIds = mutableListOf<String>()

    suspend fun findAll(): List<WebNovel> {
        scans++
        scanFailure?.let { throw it }
        return novels
    }

    suspend fun syncNovel(novel: WebNovel) {
        indexAttempts++
        failure?.let { throw it }
        indexedIds.add(novel.novelId)
    }
}

private fun Application.installSyncRoute(index: IndexStub) {
    authentication(TEST_SECRET)
    install(Resources)
    routing {
        routeWebNovelAdminSyncAll(index::findAll, index::syncNovel)
    }
}

class WebNovelAdminSyncAllRouteTest : DescribeSpec({
    describe("GET /novel/admin/sync-all") {
        it("rejects anonymous requests before scanning or indexing") {
            val index = IndexStub()
            testApplication {
                application { installSyncRoute(index) }

                val response = client.get(SYNC_URL)

                response.status shouldBe HttpStatusCode.Unauthorized
                response.headers[HttpHeaders.WWWAuthenticate] shouldBe "Bearer"
                index.scans shouldBe 0
                index.indexAttempts shouldBe 0
                index.indexedIds shouldBe emptyList()
            }
        }

        listOf("trusted", "member", "restricted", "banned", "Admin", "unknown", null)
            .forEach { role ->
                it("rejects signed ${role ?: "missing-role"} tokens before scanning or indexing") {
                    val index = IndexStub()
                    testApplication {
                        application { installSyncRoute(index) }

                        val response = client.get(SYNC_URL) { bearerAuth(token(role)) }

                        response.status shouldBe HttpStatusCode.Unauthorized
                        index.scans shouldBe 0
                        index.indexAttempts shouldBe 0
                        index.indexedIds shouldBe emptyList()
                    }
                }
            }

        listOf(
            "wrong signature" to token(secret = "untrusted-signing-secret"),
            "expired" to token(expiresAt = Instant.now().minusSeconds(60)),
        ).forEach { (description, invalidToken) ->
            it("rejects $description admin tokens before scanning or indexing") {
                val index = IndexStub()
                testApplication {
                    application { installSyncRoute(index) }

                    val response = client.get(SYNC_URL) { bearerAuth(invalidToken) }

                    response.status shouldBe HttpStatusCode.Unauthorized
                    index.scans shouldBe 0
                    index.indexAttempts shouldBe 0
                    index.indexedIds shouldBe emptyList()
                }
            }
        }

        it("keeps the existing admin sync behavior and completion count") {
            val index = IndexStub()
            testApplication {
                application { installSyncRoute(index) }

                val response = client.get(SYNC_URL) { bearerAuth(token()) }

                response.status shouldBe HttpStatusCode.OK
                response.bodyAsText() shouldBe "Synced 2 novels"
                index.scans shouldBe 1
                index.indexAttempts shouldBe 2
                index.indexedIds shouldBe listOf("n1", "n2")
            }
        }

        it("keeps the zero-novel completion response") {
            val index = IndexStub(novels = emptyList())
            testApplication {
                application { installSyncRoute(index) }

                val response = client.get(SYNC_URL) { bearerAuth(token()) }

                response.status shouldBe HttpStatusCode.OK
                response.bodyAsText() shouldBe "Synced 0 novels"
                index.scans shouldBe 1
                index.indexAttempts shouldBe 0
                index.indexedIds shouldBe emptyList()
            }
        }

        it("returns a generic error without exposing index exception details or stack traces") {
            val index = IndexStub(failure = IllegalStateException("private-index-connection-details"))
            testApplication {
                application { installSyncRoute(index) }

                val response = client.get(SYNC_URL) { bearerAuth(token()) }

                response.status shouldBe HttpStatusCode.InternalServerError
                response.bodyAsText() shouldBe "Error syncing novels"
                index.scans shouldBe 1
                index.indexAttempts shouldBe 1
                index.indexedIds shouldBe emptyList()
            }
        }

        it("returns a generic scan error without trying to write the index") {
            val index = IndexStub(scanFailure = IllegalStateException("private-mongo-connection-details"))
            testApplication {
                application { installSyncRoute(index) }

                val response = client.get(SYNC_URL) { bearerAuth(token()) }

                response.status shouldBe HttpStatusCode.InternalServerError
                response.bodyAsText() shouldBe "Error syncing novels"
                index.scans shouldBe 1
                index.indexAttempts shouldBe 0
                index.indexedIds shouldBe emptyList()
            }
        }
    }
})
